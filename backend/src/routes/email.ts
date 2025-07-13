import express from 'express';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';

interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// Schema for sending emails
const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  body: z.string(),
  threadId: z.string().optional(),
});

// Get all threads
router.get('/threads', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    
    // Debug: Log what we have in req.user
    logger.info('User data from JWT:', req.user);
    logger.info('Access token:', accessToken);
    
    if (!accessToken) {
      logger.error('No access token found in JWT payload');
      return res.status(401).json({ error: 'No access token available. Please log in again.' });
    }
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.threads.list({
      userId: 'me',
      maxResults: 50,
      q: req.query.q as string || '',
    });

    const threads = response.data.threads || [];
    
    // Get preview data for each thread
    const threadsWithPreview = await Promise.all(
      threads.map(async (thread) => {
        try {
          const threadData = await gmail.users.threads.get({
            userId: 'me',
            id: thread.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });

          const messages = threadData.data.messages || [];
          const latestMessage = messages[messages.length - 1];
          const headers = latestMessage?.payload?.headers || [];
          
          const from = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const date = headers.find(h => h.name === 'Date')?.value || '';

          return {
            id: thread.id,
            snippet: thread.snippet,
            from,
            subject,
            date,
            messageCount: messages.length,
          };
        } catch (error) {
          logger.error(`Error getting thread ${thread.id}:`, error);
          return {
            id: thread.id,
            snippet: thread.snippet,
            from: '',
            subject: '',
            date: '',
            messageCount: 0,
          };
        }
      })
    );

    return res.json({ threads: threadsWithPreview });
  } catch (error) {
    logger.error('Error fetching threads:', error);
    return res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get specific thread
router.get('/threads/:threadId', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    const { threadId } = req.params;
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
    });

    const thread = response.data;
    const messages = thread.messages || [];

    // Process messages to extract content
    const processedMessages = messages.map(message => {
      const headers = message.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      
      // Extract body content
      let body = '';
      if (message.payload?.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString();
      } else if (message.payload?.parts) {
        const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString();
        }
      }

      return {
        id: message.id,
        from,
        subject,
        date,
        body,
        snippet: message.snippet,
      };
    });

    return res.json({
      thread: {
        id: thread.id,
        messages: processedMessages,
      },
    });
  } catch (error) {
    logger.error('Error fetching thread:', error);
    return res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Send email/reply
router.post('/send', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    const { to, subject, body, threadId } = sendEmailSchema.parse(req.body);
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Create email message
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body,
    ];
    
    const email = emailLines.join('\n');
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: threadId,
      },
    });

    logger.info(`Email sent successfully: ${response.data.id}`);
    return res.json({ messageId: response.data.id, success: true });
  } catch (error) {
    logger.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

export default router; 