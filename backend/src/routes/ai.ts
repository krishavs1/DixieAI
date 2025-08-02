import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../utils/logger';
import { z } from 'zod';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory cache for summaries
const summaryCache = new Map<string, {
  summary: string;
  timestamp: number;
  emailCount: number;
  userEmail: string;
}>();

// Cache duration: 30 minutes
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Helper function to get cache key
const getCacheKey = (userEmail: string): string => {
  const today = new Date().toDateString();
  return `summary_${userEmail}_${today}`;
};

// Helper function to check if cache is valid
const isCacheValid = (cacheEntry: any): boolean => {
  const now = Date.now();
  return (now - cacheEntry.timestamp) < CACHE_DURATION;
};

// Fallback summary generator
function generateFallbackSummary(threads: any[]): string {
  if (!threads || threads.length === 0) {
    return "Your inbox is empty. No new emails to summarize.";
  }
  
  const count = threads.length;
  const unreadCount = threads.filter(t => !t.read).length;
  const recentCount = threads.slice(0, 5).length;
  
  if (unreadCount > 0) {
    return `You have ${count} emails in your inbox, with ${unreadCount} unread messages. The most recent emails are from ${recentCount} different senders.`;
  } else {
    return `You have ${count} emails in your inbox, all marked as read. Your inbox is up to date.`;
  }
}

// Schema for AI reply generation
const generateReplySchema = z.object({
  prompt: z.string(),
  context: z.object({
    originalMessage: z.string(),
    sender: z.string(),
    subject: z.string(),
  }),
});

// Schema for HTML to text conversion
const htmlToTextSchema = z.object({
  htmlContent: z.string(),
  subject: z.string().optional(),
});

// Convert HTML email content to clean, readable text
router.post('/html-to-text', authMiddleware, async (req: any, res: express.Response) => {
  try {
    const { htmlContent, subject } = htmlToTextSchema.parse(req.body);
    
    logger.info('Converting HTML email to clean text');
    
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured, using fallback HTML stripping');
      const fallbackText = htmlContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return res.json({
        text: fallbackText,
        success: true,
        source: 'fallback',
      });
    }
    
    const systemPrompt = `You are an email content processor that converts HTML email content into clean, readable text.

Your task is to:
1. Extract the actual email content from HTML markup
2. Remove all HTML tags, CSS, and formatting
3. Preserve the natural flow and meaning of the text
4. Remove tracking pixels, hidden elements, and email client artifacts
5. Return only the human-readable content that should be read aloud
6. Maintain proper sentence structure and punctuation
7. Remove any "View in browser" links or email client instructions

Return ONLY the clean, readable text content. Do not include any HTML, formatting instructions, or metadata.`;

    const userPrompt = `Please convert this HTML email content to clean, readable text:

Subject: ${subject || 'No subject'}

HTML Content:
${htmlContent}

Return only the clean, readable text that should be read aloud to a user.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    const cleanText = response.choices[0]?.message?.content?.trim() || '';
    
    if (cleanText) {
      logger.info('Successfully converted HTML to clean text');
      return res.json({
        text: cleanText,
        success: true,
        source: 'openai',
      });
    } else {
      throw new Error('No text generated from OpenAI');
    }
    
  } catch (error) {
    logger.error('Error converting HTML to text:', error);
    return res.status(500).json({ 
      error: 'Failed to convert HTML to text',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate AI-powered reply
router.post('/generate-reply', authMiddleware, async (req: any, res: express.Response) => {
  try {
    const { prompt, context } = generateReplySchema.parse(req.body);
    
    logger.info('Generating AI reply for:', context.subject);
    
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured, using fallback reply');
      const fallbackReply = generateContextualReply(context);
      return res.json({
        reply: fallbackReply,
        success: true,
        source: 'fallback',
      });
    }
    
    // Create a more sophisticated prompt for OpenAI
    const systemPrompt = `You are an intelligent email assistant that helps users write professional, contextual replies to emails. 

Your task is to generate a natural, human-like reply that:
1. Acknowledges the original message appropriately
2. Provides a relevant and helpful response
3. Maintains a professional but friendly tone
4. Sounds like it was written by a real person, not an AI
5. Is concise (under 100 words) but complete
6. Matches the context and urgency of the original message
7. ONLY generates the email body content - DO NOT include subject lines, headers, or metadata

IMPORTANT: Generate ONLY the email body content with proper formatting:
- Start with a greeting (e.g., "Hi [Name],")
- Add TWO line breaks after the greeting
- Write the main content
- Add TWO line breaks before the signature
- End with a signature (e.g., "Best regards,\nKrishav")

Do not include:
- Subject lines (like "Re: Follow up ⏰")
- "From:" or "To:" headers
- Date/time information
- Any other email metadata

Example format:
Hi [Name],

[Main content here]

Best regards,
Krishav`;

    const userPrompt = `Please generate ONLY the email body content for this reply:

Original Email:
From: ${context.sender}
Subject: ${context.subject}
Content: ${context.originalMessage}

Generate a natural, professional email body that would be appropriate for this context. Start with a greeting and end with a signature. Do not include any subject lines or headers.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content?.trim() || '';
    
    if (reply) {
      logger.info('Successfully generated AI reply');
      return res.json({
        reply,
        success: true,
        source: 'openai',
      });
    } else {
      throw new Error('No reply generated from OpenAI');
    }
    
  } catch (error) {
    logger.error('Error generating AI reply:', error);
    
    // Fallback to template-based reply
    try {
      const fallbackReply = generateContextualReply(req.body.context);
      return res.json({
        reply: fallbackReply,
        success: true,
        source: 'fallback',
        error: 'AI service unavailable, using fallback',
      });
    } catch (fallbackError) {
      logger.error('Fallback reply generation failed:', fallbackError);
      return res.status(500).json({ 
        error: 'Failed to generate reply',
        success: false,
      });
    }
  }
});

// Generate inbox summary
router.post('/summarize-inbox', authMiddleware, async (req: any, res: express.Response) => {
  try {
    const { threads, token } = req.body;
    const userEmail = req.user.email;
    
    logger.info('Generating inbox summary for', threads?.length || 0, 'threads');
    
    // Check cache first
    const cacheKey = getCacheKey(userEmail);
    const cachedSummary = summaryCache.get(cacheKey);
    
    if (cachedSummary && isCacheValid(cachedSummary)) {
      logger.info('Returning cached summary for user:', userEmail);
      return res.json({
        summary: cachedSummary.summary,
        success: true,
        source: 'cache',
        cached: true,
        emailCount: cachedSummary.emailCount,
      });
    }
    
    // Cache miss or expired - generate new summary
    logger.info('Cache miss - generating new summary for user:', userEmail);
    
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OpenAI API key not configured, using fallback summary');
      const fallbackSummary = generateFallbackSummary(threads);
      
      // Cache the fallback summary
      summaryCache.set(cacheKey, {
        summary: fallbackSummary,
        timestamp: Date.now(),
        emailCount: threads?.length || 0,
        userEmail,
      });
      
      return res.json({
        summary: fallbackSummary,
        success: true,
        source: 'fallback',
        cached: false,
        emailCount: threads?.length || 0,
      });
    }
    
    // Create a summary of the inbox
    const systemPrompt = `You are an intelligent email assistant that provides concise, actionable summaries of email inboxes.

Your task is to:
1. Analyze the email threads provided
2. Identify key themes, urgent items, and important updates
3. Provide a brief, conversational summary (2-3 sentences max)
4. Highlight any emails that need immediate attention
5. Keep the tone helpful and professional
6. Focus on actionable insights

Return ONLY the summary text. Do not include any formatting, headers, or metadata.`;

    const threadSummaries = threads?.slice(0, 10).map((thread: any) => 
      `From: ${thread.from}, Subject: ${thread.subject}, Date: ${thread.date}`
    ).join('\n') || 'No emails found';

    const userPrompt = `Please provide a brief summary of this inbox:

${threadSummaries}

Generate a concise, helpful summary of what's in this inbox.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content?.trim() || '';
    
    if (summary) {
      logger.info('Successfully generated inbox summary');
      
      // Cache the generated summary
      summaryCache.set(cacheKey, {
        summary,
        timestamp: Date.now(),
        emailCount: threads?.length || 0,
        userEmail,
      });
      
      return res.json({
        summary,
        success: true,
        source: 'openai',
        cached: false,
        emailCount: threads?.length || 0,
      });
    } else {
      throw new Error('No summary generated from OpenAI');
    }
    
  } catch (error) {
    logger.error('Error generating inbox summary:', error);
    
    // Fallback to template-based summary
    try {
      const fallbackSummary = generateFallbackSummary(req.body.threads);
      
      // Cache the fallback summary
      const userEmail = req.user.email;
      const cacheKey = getCacheKey(userEmail);
      summaryCache.set(cacheKey, {
        summary: fallbackSummary,
        timestamp: Date.now(),
        emailCount: req.body.threads?.length || 0,
        userEmail,
      });
      
      return res.json({
        summary: fallbackSummary,
        success: true,
        source: 'fallback',
        error: 'AI service unavailable, using fallback',
        cached: false,
        emailCount: req.body.threads?.length || 0,
      });
    } catch (fallbackError) {
      logger.error('Fallback summary generation failed:', fallbackError);
      return res.status(500).json({ 
        error: 'Failed to generate inbox summary',
        success: false,
      });
    }
  }
});

// Simple contextual reply generator (fallback)
function generateContextualReply(context: any): string {
  const { originalMessage, sender, subject } = context;
  const content = originalMessage.toLowerCase();
  
  // Extract sender name for greeting
  const senderName = sender.split('<')[0].trim();
  
  // Analyze the content and generate appropriate replies
  if (content.includes('thank you') || content.includes('thanks')) {
    return `Hi ${senderName},\n\nYou're welcome! I'm glad I could help. Let me know if you need anything else.\n\nBest regards,\nKrishav`;
  }
  
  if (content.includes('meeting') || content.includes('schedule') || content.includes('appointment')) {
    return `Hi ${senderName},\n\nThank you for reaching out about the meeting. I'll review the details and confirm my availability. I'll get back to you shortly with my response.\n\nBest regards,\nKrishav`;
  }
  
  if (content.includes('project') || content.includes('deadline') || content.includes('timeline')) {
    return `Hi ${senderName},\n\nThanks for the project update. I've reviewed the information and will follow up with any questions or next steps. I appreciate you keeping me in the loop.\n\nBest regards,\nKrishav`;
  }
  
  if (content.includes('question') || content.includes('help') || content.includes('assistance')) {
    return `Hi ${senderName},\n\nThank you for your question. I'll look into this and provide a detailed response soon. I want to make sure I give you the most accurate and helpful information.\n\nBest regards,\nKrishav`;
  }
  
  if (content.includes('urgent') || content.includes('asap') || content.includes('important')) {
    return `Hi ${senderName},\n\nI understand this is urgent. I'll prioritize this and get back to you as soon as possible. Thank you for bringing this to my attention.\n\nBest regards,\nKrishav`;
  }
  
  if (content.includes('good') || content.includes('great') || content.includes('excellent')) {
    return `Hi ${senderName},\n\nThat's great to hear! I'm glad everything is working out well. Keep me updated on any further developments.\n\nBest regards,\nKrishav`;
  }
  
  // Default professional reply
  return `Hi ${senderName},\n\nThank you for your email. I've received your message and will review it carefully. I'll respond with a detailed reply shortly. I appreciate you reaching out.\n\nBest regards,\nKrishav`;
}

// Cache management endpoints for demo purposes
router.post('/clear-summary-cache', authMiddleware, async (req: any, res: express.Response) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = getCacheKey(userEmail);
    
    if (summaryCache.has(cacheKey)) {
      summaryCache.delete(cacheKey);
      logger.info('Cleared summary cache for user:', userEmail);
      return res.json({
        success: true,
        message: 'Summary cache cleared successfully',
      });
    } else {
      return res.json({
        success: true,
        message: 'No cache found to clear',
      });
    }
  } catch (error) {
    logger.error('Error clearing summary cache:', error);
    return res.status(500).json({
      error: 'Failed to clear cache',
      success: false,
    });
  }
});

// Get cache status for debugging
router.get('/cache-status', authMiddleware, async (req: any, res: express.Response) => {
  try {
    const userEmail = req.user.email;
    const cacheKey = getCacheKey(userEmail);
    const cachedSummary = summaryCache.get(cacheKey);
    
    if (cachedSummary) {
      const isValid = isCacheValid(cachedSummary);
      const timeRemaining = Math.max(0, CACHE_DURATION - (Date.now() - cachedSummary.timestamp));
      
      return res.json({
        success: true,
        hasCache: true,
        isValid,
        timeRemaining: Math.floor(timeRemaining / 1000), // seconds
        emailCount: cachedSummary.emailCount,
        source: cachedSummary.summary.includes('fallback') ? 'fallback' : 'openai',
      });
    } else {
      return res.json({
        success: true,
        hasCache: false,
        message: 'No cache found',
      });
    }
  } catch (error) {
    logger.error('Error getting cache status:', error);
    return res.status(500).json({
      error: 'Failed to get cache status',
      success: false,
    });
  }
});

export default router; 