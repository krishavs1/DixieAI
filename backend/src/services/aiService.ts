import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

      const systemPrompt = `You are Dixie, a friendly email assistant. Generate a conversational, helpful summary of the user's inbox.

Be conversational and encouraging. Use emojis sparingly but effectively. Focus on actionable insights.

Structure your response like this:
1. Brief overview with key numbers
2. Priority actions (emails needing replies)
3. Important updates to review
4. Encouraging conclusion

Keep it concise but friendly.`;

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

Generate a friendly, conversational summary:`;

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