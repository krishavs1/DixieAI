import express from 'express';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';
import { processEmailHtml, extractEmailBody, findInlineImages, processInlineImages } from '../utils/emailProcessor';

interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// Helper function to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
    ),
  ]);
};

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
      maxResults: 20, // Reduced from 50 to improve performance
      q: req.query.q as string || '',
    });

    const threads = response.data.threads || [];
    
    // Use batch requests to get thread metadata more efficiently
    const threadsWithPreview = await Promise.allSettled(
      threads.slice(0, 10).map(async (thread) => { // Limit to first 10 threads for better performance
        try {
          const threadData = await withTimeout(
            gmail.users.threads.get({
              userId: 'me',
              id: thread.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            }),
            10000 // 10 second timeout for each thread metadata request
          );

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
          // Return basic info even if metadata fetch fails
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

    // Filter out failed requests and get successful results
    const successfulThreads = threadsWithPreview
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    return res.json({ threads: successfulThreads });
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
    
    const response = await withTimeout(
      gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      }),
      20000 // 20 second timeout for detailed thread fetching
    );

    const thread = response.data;
    const messages = thread.messages || [];

    // Process messages to extract and process content
    const processedMessages = await Promise.allSettled(
      messages.map(async (message) => {
        try {
          const headers = message.payload?.headers || [];
          const from = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const date = headers.find(h => h.name === 'Date')?.value || '';
          
          // Extract raw HTML body using our email processor
          let rawBody = extractEmailBody(message.payload);
          
          // If no HTML body found, try to get plain text and convert to HTML
          if (!rawBody && message.payload?.parts) {
            const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              const plainText = Buffer.from(textPart.body.data, 'base64').toString();
              rawBody = plainText.replace(/\n/g, '<br>');
            }
          }
          
          // Process inline images with timeout
          const inlineImages = findInlineImages(message.payload);
          const attachmentMap = new Map<string, string>();
          
          // Fetch inline image data with timeout
          for (const img of inlineImages) {
            try {
              const attachment = await withTimeout(
                gmail.users.messages.attachments.get({
                  userId: 'me',
                  messageId: message.id!,
                  id: img.id,
                }),
                5000 // 5 second timeout for each attachment
              );
              
              if (attachment.data.data) {
                // Create data URL for inline image
                const mimeType = message.payload?.parts?.find(p => p.body?.attachmentId === img.id)?.mimeType || 'image/jpeg';
                const dataUrl = `data:${mimeType};base64,${attachment.data.data}`;
                attachmentMap.set(img.contentId, dataUrl);
              }
            } catch (error) {
              logger.error(`Error fetching inline image ${img.id}:`, error);
            }
          }
          
          // Process the HTML content with inline images
          let processedBody = processInlineImages(rawBody, attachmentMap);
          
          // Process the email HTML (sanitize, clean, format)
          const processedResult = processEmailHtml({
            html: processedBody,
            shouldLoadImages: true, // Allow images by default
            theme: 'light',
          });
          
          return {
            id: message.id,
            from,
            subject,
            date,
            body: processedResult.processedHtml,
            rawBody: rawBody, // Keep original for debugging
            plainTextContent: processedResult.plainTextContent,
            hasBlockedImages: processedResult.hasBlockedImages,
            snippet: message.snippet,
          };
        } catch (error) {
          logger.error(`Error processing message ${message.id}:`, error);
          // Return basic message info even if processing fails
          const headers = message.payload?.headers || [];
          return {
            id: message.id,
            from: headers.find(h => h.name === 'From')?.value || '',
            subject: headers.find(h => h.name === 'Subject')?.value || '',
            date: headers.find(h => h.name === 'Date')?.value || '',
            body: message.snippet || 'Message content could not be loaded',
            rawBody: '',
            plainTextContent: message.snippet || '',
            hasBlockedImages: false,
            snippet: message.snippet,
          };
        }
      })
    );

    // Filter out failed message processing
    const successfulMessages = processedMessages
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    return res.json({
      thread: {
        id: thread.id,
        messages: successfulMessages,
      },
    });
  } catch (error) {
    logger.error('Error fetching thread:', error);
    return res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Process email content with user preferences
router.post('/process', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { html, shouldLoadImages = false, theme = 'light' } = req.body;
    
    if (!html) {
      return res.status(400).json({ error: 'HTML content is required' });
    }
    
    const result = processEmailHtml({
      html,
      shouldLoadImages,
      theme,
    });
    
    return res.json(result);
  } catch (error) {
    logger.error('Error processing email content:', error);
    return res.status(500).json({ error: 'Failed to process email content' });
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