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

// Schema for AI reply generation
const generateReplySchema = z.object({
  prompt: z.string(),
  context: z.object({
    originalMessage: z.string(),
    sender: z.string(),
    subject: z.string(),
  }),
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

IMPORTANT: Generate ONLY the email body content. Do not include:
- Subject lines (like "Re: Follow up ⏰")
- "From:" or "To:" headers
- Date/time information
- Any other email metadata

Start directly with the greeting and end with the signature.`;

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

// Simple contextual reply generator (fallback)
function generateContextualReply(context: any): string {
  const { originalMessage, sender, subject } = context;
  const content = originalMessage.toLowerCase();
  
  // Analyze the content and generate appropriate replies
  if (content.includes('thank you') || content.includes('thanks')) {
    return "You're welcome! I'm glad I could help. Let me know if you need anything else.";
  }
  
  if (content.includes('meeting') || content.includes('schedule') || content.includes('appointment')) {
    return "Thank you for reaching out about the meeting. I'll review the details and confirm my availability. I'll get back to you shortly with my response.";
  }
  
  if (content.includes('project') || content.includes('deadline') || content.includes('timeline')) {
    return "Thanks for the project update. I've reviewed the information and will follow up with any questions or next steps. I appreciate you keeping me in the loop.";
  }
  
  if (content.includes('question') || content.includes('help') || content.includes('assistance')) {
    return "Thank you for your question. I'll look into this and provide a detailed response soon. I want to make sure I give you the most accurate and helpful information.";
  }
  
  if (content.includes('urgent') || content.includes('asap') || content.includes('important')) {
    return "I understand this is urgent. I'll prioritize this and get back to you as soon as possible. Thank you for bringing this to my attention.";
  }
  
  if (content.includes('good') || content.includes('great') || content.includes('excellent')) {
    return "That's great to hear! I'm glad everything is working out well. Keep me updated on any further developments.";
  }
  
  // Default professional reply
  return "Thank you for your email. I've received your message and will review it carefully. I'll respond with a detailed reply shortly. I appreciate you reaching out.";
  }

export default router; 