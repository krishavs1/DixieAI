import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Debug: Check if API key is loaded
console.log('OpenAI API Key loaded:', process.env.OPENAI_API_KEY ? 'Yes' : 'No');

export interface EmailClassification {
  needsReply: boolean;
  isImportant: boolean;
  confidence?: number;
}

export interface EmailContent {
  subject: string;
  body: string;
  from: string;
  snippet?: string;
}

export class AIService {
  /**
   * Classify if an email needs a reply
   */
  static async classifyNeedsReply(email: EmailContent): Promise<EmailClassification> {
    try {
      // Clean and prepare email content
      const cleanBody = this.cleanEmailContent(email.body);
      const content = `${email.subject}\n\n${cleanBody}`.substring(0, 500); // Limit to 500 chars for cost efficiency

      const systemPrompt = `You are an email triage assistant. Your job is to determine if an email requires a reply from the recipient.

Consider these factors:
- Questions or requests that need answers
- Meeting invitations that need responses
- Action items or tasks assigned
- Important updates that require acknowledgment
- Personal messages that would be rude not to reply to

Do NOT consider these as needing replies:
- Marketing emails
- Newsletter subscriptions
- Automated notifications
- Spam or promotional content
- Already replied to conversations

Respond ONLY with "yes" or "no".`;

      const userPrompt = `Email content:
${content}

Does this email require a reply? (yes/no):`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 5,
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase();
      const needsReply = result === 'yes';

      logger.info(`Email classification result: ${result} for subject: ${email.subject}`);

      return {
        needsReply,
        isImportant: false, // Will be set by classifyImportant
        confidence: 0.9, // We can enhance this later with confidence scoring
      };
    } catch (error) {
      logger.error('Error classifying email:', error);
      // Default to false on error to avoid false positives
      return {
        needsReply: false,
        isImportant: false,
        confidence: 0,
      };
    }
  }

  /**
   * Classify if an email contains important updates
   */
  static async classifyImportant(email: EmailContent): Promise<EmailClassification> {
    try {
      // Clean and prepare email content
      const cleanBody = this.cleanEmailContent(email.body);
      const content = `${email.subject}\n\n${cleanBody}`.substring(0, 500); // Limit to 500 chars for cost efficiency

      const systemPrompt = `You are an email triage assistant. Your job is to determine if an email contains important updates that require attention.

Consider these as IMPORTANT updates:
- Job offers, acceptances, or rejections
- Security alerts or account changes
- Important deadlines or due dates
- Financial transactions or billing issues
- Health or medical information
- Legal documents or contracts
- Critical system notifications
- Important personal news or events

Do NOT consider these as important:
- Marketing emails or promotions
- Newsletter subscriptions
- Social media notifications
- General promotional content
- Routine automated notifications

Respond ONLY with "yes" or "no".`;

      const userPrompt = `Email content:
${content}

Does this email contain important updates? (yes/no):`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 5,
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase();
      const isImportant = result === 'yes';

      logger.info(`Important classification result: ${result} for subject: ${email.subject}`);

      return {
        needsReply: false, // Will be set by classifyNeedsReply
        isImportant,
        confidence: 0.9,
      };
    } catch (error) {
      logger.error('Error classifying important email:', error);
      // Default to false on error to avoid false positives
      return {
        needsReply: false,
        isImportant: false,
        confidence: 0,
      };
    }
  }

  /**
   * Classify multiple emails for both needs reply and important updates
   */
  static async classifyBatch(emails: EmailContent[]): Promise<EmailClassification[]> {
    try {
      // For MVP, process sequentially to avoid rate limits
      // Later we can implement batching with multiple API calls
      const results: EmailClassification[] = [];
      
      for (const email of emails) {
        // Get both classifications
        const [replyClassification, importantClassification] = await Promise.all([
          this.classifyNeedsReply(email),
          this.classifyImportant(email)
        ]);
        
        // Combine results
        const combinedClassification: EmailClassification = {
          needsReply: replyClassification.needsReply,
          isImportant: importantClassification.isImportant,
          confidence: Math.max(replyClassification.confidence || 0, importantClassification.confidence || 0),
        };
        
        results.push(combinedClassification);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay for faster processing
      }
      
      return results;
    } catch (error) {
      logger.error('Error in batch classification:', error);
      // Return default classifications on error
      return emails.map(() => ({ needsReply: false, isImportant: false, confidence: 0 }));
    }
  }

  /**
   * Generate a conversational inbox summary
   */
  static async generateInboxSummary(threads: any[], classifications: EmailClassification[]): Promise<string> {
    try {
      // Analyze the data
      const totalEmails = threads.length;
      const needsReplyCount = classifications.filter(c => c.needsReply).length;
      const importantCount = classifications.filter(c => c.isImportant).length;
      const unreadCount = threads.filter(t => !t.read).length;
      
      // Get emails that need replies
      const emailsNeedingReply = threads.filter((thread, index) => 
        classifications[index]?.needsReply
      ).slice(0, 3); // Top 3
      
      // Get important emails
      const importantEmails = threads.filter((thread, index) => 
        classifications[index]?.isImportant
      ).slice(0, 3); // Top 3
      
      // Create summary data
      const summaryData = {
        totalEmails,
        needsReplyCount,
        importantCount,
        unreadCount,
        emailsNeedingReply: emailsNeedingReply.map(t => ({ subject: t.subject, from: t.from })),
        importantEmails: importantEmails.map(t => ({ subject: t.subject, from: t.from })),
        promotionalCount: totalEmails - needsReplyCount - importantCount
      };

      const systemPrompt = `You are Dixie, an inbox-summarization assistant.

When generating an inbox summary, produce exactly one sentence in this format:

"You have {needReplies} emails needing your reply and {importantUpdates} important updates. The emails needing your reply are from {sender1}, {sender2}, ..., {senderN}. As for the important updates, {sender1} {action1} and {sender2} {action2}."

Rules:
• No greetings or sign-offs
• No emojis
• No extra sentences
• Use commas to separate names, and "and" before the last item
• For important updates, use format: "{sender} {action}" (e.g., "Google sent a security alert", "Sallie Mae shared Student Loan Information")
• Be precise and direct
• Convert subject lines into natural actions
• Use natural speech patterns that sound conversational when spoken aloud`;

      const userPrompt = `Inbox Summary Data:
- Total emails: ${summaryData.totalEmails}
- Need replies: ${summaryData.needsReplyCount}
- Important updates: ${summaryData.importantCount}
- Unread: ${summaryData.unreadCount}
- Promotional: ${summaryData.promotionalCount}

Emails needing replies:
${summaryData.emailsNeedingReply.map(e => `• "${e.subject}" from ${e.from}`).join('\n')}

Important emails:
${summaryData.importantEmails.map(e => `• "${e.subject}" from ${e.from}`).join('\n')}

Generate the inbox summary in exactly one sentence. For important updates, convert the subject into a natural action (e.g., "PLEASE READ: Important 2025 Student Loan Option Information" becomes "Sallie Mae shared Student Loan Information").`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const summary = response.choices[0]?.message?.content?.trim() || 'Unable to generate summary';
      
      logger.info(`Generated inbox summary for ${totalEmails} emails`);
      return summary;
    } catch (error) {
      logger.error('Error generating inbox summary:', error);
      return 'Sorry, I had trouble analyzing your inbox. Please try again.';
    }
  }

  /**
   * Generate a contextual reply based on the original email and user instruction
   */
  static async generateContextualReply(options: {
    originalEmail: {
      from: string;
      subject: string;
      body: string;
    };
    instruction: string;
    userName: string;
  }): Promise<string> {
    try {
      const { originalEmail, instruction, userName } = options;
      
      // Clean the original email body
      const cleanBody = this.cleanEmailContent(originalEmail.body);
      
      // Extract sender name from email address/format
      const senderName = originalEmail.from.includes('<') 
        ? originalEmail.from.split('<')[0].trim() 
        : originalEmail.from.split('@')[0];
      
      const systemPrompt = `You are Dixie, an AI email assistant helping ${userName} write professional and contextual email replies.

Your job is to:
1. Read the original email carefully
2. Follow the user's instruction exactly
3. Write a professional, natural reply that sounds like ${userName}
4. Include appropriate greetings and sign-offs
5. Keep the tone consistent with the original email

Rules:
• Always start with an appropriate greeting (e.g., "Hi [Name]," or "Good morning [Name],")
• Be concise but complete (2-4 sentences)
• Match the formality level of the original email
• End with "Best regards, ${userName}" or similar
• Don't repeat the original email content
• Focus on directly addressing what was asked in the instruction
• If the email is informational, acknowledge it and show understanding
• If the email asks a question, provide a clear answer
• If the email requires action, indicate your response or next steps`;

      const userPrompt = `Original email from ${originalEmail.from}:
Subject: ${originalEmail.subject}

${cleanBody}

User's instruction: ${instruction}

Write a professional reply following the user's instruction:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const reply = response.choices[0]?.message?.content?.trim() || 'Sorry, I couldn\'t generate a reply. Please try again.';
      
      logger.info(`Generated contextual reply for email from ${originalEmail.from}: ${reply.substring(0, 100)}...`);
      return reply;
    } catch (error) {
      logger.error('Error generating contextual reply:', error);
      logger.error('Error details:', JSON.stringify(error, null, 2));
      return 'Sorry, I had trouble generating a reply. Please try again.';
    }
  }

  /**
   * Clean email content for better classification
   */
  private static cleanEmailContent(content: string): string {
    return content
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove email signatures (common patterns)
      .replace(/--\s*\n[\s\S]*$/, '')
      .replace(/Sent from my iPhone[\s\S]*$/, '')
      .replace(/Sent from my iPad[\s\S]*$/, '')
      .replace(/Sent from my Android[\s\S]*$/, '')
      // Remove quoted text (lines starting with >)
      .replace(/^>.*$/gm, '')
      // Remove multiple whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }
} 