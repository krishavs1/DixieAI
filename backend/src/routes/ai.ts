import express from 'express';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-development',
});

// Schema for AI requests
const summarizeSchema = z.object({
  content: z.string(),
  type: z.enum(['thread', 'email']).default('thread'),
});

const replySchema = z.object({
  content: z.string(),
  context: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'friendly']).default('professional'),
});

const querySchema = z.object({
  question: z.string(),
  context: z.string(),
});

// Summarize email or thread
router.post('/summarize', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key-for-development') {
      return res.status(503).json({ error: 'OpenAI API key not configured' });
    }
    
    const { content, type } = summarizeSchema.parse(req.body);
    
    const prompt = type === 'thread' 
      ? `Please summarize this email thread concisely, highlighting the key points, decisions, and any action items:\n\n${content}`
      : `Please summarize this email, highlighting the main points and any action items:\n\n${content}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Dixie, an AI email assistant. Provide clear, concise summaries that help users quickly understand their emails. Focus on key information, decisions, and action items.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const summary = response.choices[0]?.message?.content || '';
    
    return res.json({ summary });
  } catch (error) {
    logger.error('Error generating summary:', error);
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Generate reply suggestion
router.post('/reply', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key-for-development') {
      return res.status(503).json({ error: 'OpenAI API key not configured' });
    }
    
    const { content, context, tone } = replySchema.parse(req.body);
    
    const toneInstructions = {
      professional: 'Use a professional, business-appropriate tone.',
      casual: 'Use a casual, friendly tone.',
      friendly: 'Use a warm, friendly tone while maintaining professionalism.',
    };

    const prompt = `Please draft a reply to this email. ${toneInstructions[tone]} Keep it concise and appropriate.
    
    ${context ? `Context: ${context}\n\n` : ''}
    
    Original email:
    ${content}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Dixie, an AI email assistant. Generate helpful, appropriate email replies that match the requested tone and context. Always be respectful and professional.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || '';
    
    return res.json({ reply });
  } catch (error) {
    logger.error('Error generating reply:', error);
    return res.status(500).json({ error: 'Failed to generate reply' });
  }
});

// Answer questions about emails
router.post('/query', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key-for-development') {
      return res.status(503).json({ error: 'OpenAI API key not configured' });
    }
    
    const { question, context } = querySchema.parse(req.body);
    
    const prompt = `Based on the following email context, please answer this question: ${question}
    
    Email context:
    ${context}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Dixie, an AI email assistant. Answer questions about emails based on the provided context. Be accurate and helpful. If you cannot answer based on the context, say so.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const answer = response.choices[0]?.message?.content || '';
    
    return res.json({ answer });
  } catch (error) {
    logger.error('Error answering query:', error);
    return res.status(500).json({ error: 'Failed to answer query' });
  }
});

// Chat with AI assistant
router.post('/chat', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy-key-for-development') {
      return res.status(503).json({ error: 'OpenAI API key not configured' });
    }
    
    const { messages, context } = req.body;
    
    const systemMessage = {
      role: 'system',
      content: `You are Dixie, an intelligent AI email assistant. You help users manage their emails through natural conversation.
      
      ${context ? `Current email context: ${context}` : ''}
      
      You can help with:
      - Summarizing emails and threads
      - Drafting replies
      - Answering questions about email content
      - Organizing and managing emails
      - Scheduling and task extraction
      
      Be helpful, concise, and conversational. Always maintain a friendly but professional tone.`,
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [systemMessage, ...messages],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || '';
    
    return res.json({ reply });
  } catch (error) {
    logger.error('Error in AI chat:', error);
    return res.status(500).json({ error: 'Failed to process chat' });
  }
});

export default router; 