import express from 'express';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';
import { processEmailHtml, extractEmailBody, findInlineImages, processInlineImages } from '../utils/emailProcessor';
import { AIService, EmailContent } from '../services/aiService';
import * as he from 'he';

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
  attachments: z.array(z.object({
    name: z.string(),
    data: z.string(), // base64 encoded data
    mimeType: z.string(),
  })).optional(),
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
      maxResults: 50, // Increased from 20 to 50 threads
      q: req.query.q as string || '',
    });

    const threads = response.data.threads || [];
    
    // Use batch requests to get thread metadata more efficiently
    const threadsWithPreview = await Promise.allSettled(
      threads.map(async (thread) => { // Process all 50 threads
        // Extract display name from "Display Name <email@domain.com>" format
        const extractDisplayName = (fromField: string): string => {
          if (!fromField) return '';
          
          // If it's in "Display Name <email@domain.com>" format, extract the display name
          const match = fromField.match(/^"?(.*?)"?\s*<.*>$/);
          if (match && match[1]) {
            return match[1].trim();
          }
          
          // If it's just an email address without display name, return the email
          const emailMatch = fromField.match(/^([^<]+)$/);
          if (emailMatch) {
            return emailMatch[1].trim();
          }
          
          // Fallback to the original field
          return fromField;
        };

        try {
          const threadData = await withTimeout(
            gmail.users.threads.get({
            userId: 'me',
            id: thread.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
            }),
            15000 // 15 second timeout for each thread metadata request (increased for 50 threads)
          );

          const messages = threadData.data.messages || [];
          const latestMessage = messages[messages.length - 1];
          const headers = latestMessage?.payload?.headers || [];
          
          const from = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const date = headers.find(h => h.name === 'Date')?.value || '';

          // Get labels for the latest message to determine read status
          const labelIds = latestMessage?.labelIds || [];
          const isUnread = labelIds.includes('UNREAD');
          
          // Debug logging
          logger.info(`Thread ${thread.id}: labelIds=${JSON.stringify(labelIds)}, isUnread=${isUnread}, read=${!isUnread}`);

          return {
            id: thread.id,
            snippet: he.decode(thread.snippet || ''),
            from: extractDisplayName(from),
            subject,
            date,
            messageCount: messages.length,
            read: !isUnread, // true if not unread, false if unread
            labels: labelIds,
          };
        } catch (error) {
          logger.error(`Error getting thread ${thread.id}:`, error);
          // Return basic info even if metadata fetch fails
          return {
            id: thread.id,
            snippet: he.decode(thread.snippet || ''),
            from: extractDisplayName(''),
            subject: '',
            date: '',
            messageCount: 0,
            read: true, // Default to read if we can't determine
            labels: [],
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

// Get labels
router.get('/labels', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await withTimeout(
      gmail.users.labels.list({
        userId: 'me',
      }),
      10000 // 10 second timeout for labels
    );

    const labels = response.data.labels || [];
    
    // Transform labels to match our interface
    const transformedLabels = labels.map(label => ({
      id: label.id!,
      name: label.name!,
      color: label.color?.backgroundColor || '#4285F4',
      count: label.messagesTotal || 0,
    }));

    return res.json({ labels: transformedLabels });
  } catch (error) {
    logger.error('Error fetching labels:', error);
    return res.status(500).json({ error: 'Failed to fetch labels' });
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
        // Extract display name from "Display Name <email@domain.com>" format
        const extractDisplayName = (fromField: string): string => {
          if (!fromField) return '';
          
          // If it's in "Display Name <email@domain.com>" format, extract the display name
          const match = fromField.match(/^"?(.*?)"?\s*<.*>$/);
          if (match && match[1]) {
            return match[1].trim();
          }
          
          // If it's just an email address without display name, return the email
          const emailMatch = fromField.match(/^([^<]+)$/);
          if (emailMatch) {
            return emailMatch[1].trim();
          }
          
          // Fallback to the original field
          return fromField;
        };

        try {
        const headers = message.payload?.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        const displayName = extractDisplayName(from);
        
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
        
        // Extract attachments from the message
        const attachments: Array<{
          id: string;
          name: string;
          mimeType: string;
          size: number;
        }> = [];
        
        const extractAttachments = (payload: any): void => {
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.body?.attachmentId) {
                attachments.push({
                  id: part.body.attachmentId,
                  name: part.filename || `attachment_${part.body.attachmentId}`,
                  mimeType: part.mimeType || 'application/octet-stream',
                  size: part.body.size || 0,
                });
              }
              // Recursively check nested parts
              if (part.parts) {
                extractAttachments(part);
              }
            }
          }
        };
        
        extractAttachments(message.payload);
        
        // Process the email HTML (sanitize, clean, format)
        const processedResult = processEmailHtml({
          html: processedBody,
          shouldLoadImages: true, // Allow images by default
          theme: 'light',
        });
        
        return {
          id: message.id,
          from: displayName,
          fromRaw: from, // Add original "From" field for email extraction
          subject,
          date,
          body: processedResult.processedHtml,
          rawBody: rawBody, // Keep original for debugging
          plainTextContent: processedResult.plainTextContent,
          hasBlockedImages: processedResult.hasBlockedImages,
          snippet: he.decode(message.snippet || ''),
          attachments: attachments.length > 0 ? attachments : undefined,
        };
        } catch (error) {
          logger.error(`Error processing message ${message.id}:`, error);
          // Return basic message info even if processing fails
          const headers = message.payload?.headers || [];
          return {
            id: message.id,
            from: extractDisplayName(headers.find(h => h.name === 'From')?.value || ''),
            fromRaw: headers.find(h => h.name === 'From')?.value || '', // Add original "From" field
            subject: headers.find(h => h.name === 'Subject')?.value || '',
            date: headers.find(h => h.name === 'Date')?.value || '',
            body: he.decode(message.snippet || 'Message content could not be loaded'),
            rawBody: '',
            plainTextContent: message.snippet || '',
            hasBlockedImages: false,
            snippet: he.decode(message.snippet || ''),
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
    const { to, subject, body, threadId, attachments } = sendEmailSchema.parse(req.body);
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Generate a unique boundary for multipart MIME
    const boundary = `----=_NextPart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let emailContent = '';
    
    if (attachments && attachments.length > 0) {
      // Multipart email with attachments
      emailContent = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 7bit`,
        '',
        body,
        '',
      ].join('\n');
      
      // Add attachments
      for (const attachment of attachments) {
        emailContent += [
          `--${boundary}`,
          `Content-Type: ${attachment.mimeType}; name="${attachment.name}"`,
          `Content-Disposition: attachment; filename="${attachment.name}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          attachment.data,
          '',
        ].join('\n');
      }
      
      emailContent += `--${boundary}--\n`;
    } else {
      // Simple text email without attachments
      emailContent = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=UTF-8`,
        '',
        body,
      ].join('\n');
    }
    
    const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
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

// Mark thread as read
router.post('/threads/:threadId/read', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    const { threadId } = req.params;
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // First, get the thread to find all message IDs
    const threadResponse = await withTimeout(
      gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      }),
      10000
    );

    const thread = threadResponse.data;
    const messages = thread.messages || [];
    
    // Remove UNREAD label from all messages in the thread
    const updatePromises = messages.map(async (message) => {
      try {
        await withTimeout(
          gmail.users.messages.modify({
            userId: 'me',
            id: message.id!,
            requestBody: {
              removeLabelIds: ['UNREAD'],
            },
          }),
          5000
        );
      } catch (error) {
        logger.error(`Error marking message ${message.id} as read:`, error);
        throw error;
      }
    });

    await Promise.all(updatePromises);
    
    logger.info(`Thread ${threadId} marked as read`);
    return res.json({ success: true });
  } catch (error) {
    logger.error('Error marking thread as read:', error);
    return res.status(500).json({ error: 'Failed to mark thread as read' });
  }
});

// Get attachment data
router.get('/messages/:messageId/attachments/:attachmentId', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    const { messageId, attachmentId } = req.params;
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await withTimeout(
      gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId,
      }),
      10000
    );

    if (!response.data.data) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    return res.json({
      data: response.data.data,
      size: response.data.size,
    });
  } catch (error) {
    logger.error('Error fetching attachment:', error);
    return res.status(500).json({ error: 'Failed to fetch attachment' });
  }
});

// Classify emails for "needs reply" and "important updates"
router.post('/classify', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    const { threadIds } = req.body; // Array of thread IDs to classify
    
    if (!Array.isArray(threadIds)) {
      return res.status(400).json({ error: 'threadIds must be an array' });
    }
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get the latest message from each thread for classification
    const emailsToClassify: EmailContent[] = [];
    const threadMap = new Map<string, any>();
    
    for (const threadId of threadIds) {
      try {
        const threadResponse = await withTimeout(
          gmail.users.threads.get({
            userId: 'me',
            id: threadId,
          }),
          5000
        );
        
        const thread = threadResponse.data;
        const messages = thread.messages || [];
        const latestMessage = messages[messages.length - 1];
        
        if (latestMessage) {
          const headers = latestMessage.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const from = headers.find(h => h.name === 'From')?.value || '';
          
          // Extract plain text body
          let body = '';
          if (latestMessage.payload?.parts) {
            const textPart = latestMessage.payload.parts.find(part => part.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString();
            }
          } else if (latestMessage.payload?.body?.data) {
            body = Buffer.from(latestMessage.payload.body.data, 'base64').toString();
          }
          
          emailsToClassify.push({
            subject,
            body,
            from,
            snippet: latestMessage.snippet || undefined,
          });
          
          threadMap.set(threadId, latestMessage);
        }
      } catch (error) {
        logger.error(`Error fetching thread ${threadId}:`, error);
      }
    }
    
    // Classify emails using AI (now includes both needs reply and important updates)
    const classifications = await AIService.classifyBatch(emailsToClassify);
    
    // Map results back to thread IDs
    const results = threadIds.map((threadId, index) => ({
      threadId,
      needsReply: classifications[index]?.needsReply || false,
      isImportant: classifications[index]?.isImportant || false,
      confidence: classifications[index]?.confidence || 0,
    }));
    
    logger.info(`Classified ${results.length} threads for needs reply and important updates`);
    return res.json({ classifications: results });
  } catch (error) {
    logger.error('Error classifying emails:', error);
    return res.status(500).json({ error: 'Failed to classify emails' });
  }
});

// Generate inbox summary
router.post('/summary', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { accessToken } = req.user;
    
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Get threads (limit to 50 for summary)
    const threadsResponse = await withTimeout(
      gmail.users.threads.list({
        userId: 'me',
        maxResults: 50,
      }),
      10000
    );

    const threads = threadsResponse.data.threads || [];
    
    // Get thread details
    const threadsWithDetails = await Promise.allSettled(
      threads.map(async (thread) => {
        try {
          const threadData = await withTimeout(
            gmail.users.threads.get({
              userId: 'me',
              id: thread.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            }),
            5000
          );

          const messages = threadData.data.messages || [];
          const latestMessage = messages[messages.length - 1];
          const headers = latestMessage?.payload?.headers || [];
          
          const from = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const date = headers.find(h => h.name === 'Date')?.value || '';
          const labelIds = latestMessage?.labelIds || [];
          const isUnread = labelIds.includes('UNREAD');

          return {
            id: thread.id,
            subject,
            from,
            date,
            read: !isUnread,
            labels: labelIds,
          };
        } catch (error) {
          logger.error(`Error getting thread ${thread.id}:`, error);
          return null;
        }
      })
    );

    const validThreads = threadsWithDetails
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => (result as PromiseFulfilledResult<any>).value);

    // Classify emails first
    const emailsToClassify: EmailContent[] = validThreads.map(thread => ({
      subject: thread.subject,
      body: '', // We don't need body for summary
      from: thread.from,
    }));

    const classifications = await AIService.classifyBatch(emailsToClassify);
    
    // Generate summary
    const summary = await AIService.generateInboxSummary(validThreads, classifications);
    
    logger.info(`Generated inbox summary for ${validThreads.length} threads`);
    return res.json({ summary });
  } catch (error) {
    logger.error('Error generating inbox summary:', error);
    return res.status(500).json({ error: 'Failed to generate inbox summary' });
  }
});

export default router; 