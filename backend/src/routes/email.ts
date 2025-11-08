import express from 'express';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth';
import { z } from 'zod';
import { processEmailHtml, extractEmailBody, findInlineImages, processInlineImages } from '../utils/emailProcessor';
import { AIService, EmailContent } from '../services/aiService';
const he = require('he');

interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// Test endpoint for email labeling
router.post('/test-label', async (req, res) => {
  try {
    const { sender, subject, body } = req.body;
    
    if (!sender || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields: sender, subject, body' });
    }

    const emailContent: EmailContent = {
      from: sender,
      subject,
      body,
      snippet: body.substring(0, 100)
    };

    logger.info(`Testing email labeling for: ${subject}`);
    
    const label = await AIService.labelEmail(emailContent);
    
    return res.json({
      success: true,
      email: emailContent,
      label,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in test-label endpoint:', error);
    return res.status(500).json({ error: 'Failed to label email' });
  }
});

// Batch label existing emails (for initial processing)
router.post('/label-existing', async (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'Missing or invalid emails array' });
    }

    logger.info(`Starting batch labeling for ${emails.length} emails`);
    
    const emailContents: EmailContent[] = emails.map((email: any) => ({
      from: email.from || email.sender || '',
      subject: email.subject || '',
      body: email.body || email.snippet || '',
      snippet: email.snippet || ''
    }));

    const labels = await AIService.labelEmailsBatch(emailContents);
    
    return res.json({
      success: true,
      processed: emails.length,
      labels,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in label-existing endpoint:', error);
    return res.status(500).json({ error: 'Failed to label emails' });
  }
});

// Process and label user's emails automatically
router.post('/process-user-emails', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { accessToken } = req.user;
    
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing access token' });
    }

    logger.info('Starting to process and label user emails');
    
    // Create Gmail client
    const { gmail, tryWithRefresh } = createGmailClient(accessToken);
    
    // Fetch recent emails (limit to 50 for testing)
    const maxResults = 50;
    logger.info(`Fetching ${maxResults} recent emails for labeling`);
    
    const threadsResponse = await gmail.users.threads.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox' // Only inbox emails
    });
    
    const threads = threadsResponse.data.threads || [];
    logger.info(`Found ${threads.length} email threads`);
    
    // Process each thread to get email details
    const emails: EmailContent[] = [];
    
    for (const thread of threads) {
      try {
        const threadResponse = await gmail.users.threads.get({
          userId: 'me',
          id: thread.id!
        });
        
        const messages = threadResponse.data.messages || [];
        if (messages.length > 0) {
          const message = messages[0]; // Get the most recent message in thread
          const headers = message.payload?.headers || [];
          
          const from = headers.find(h => h.name === 'From')?.value || '';
          const subject = headers.find(h => h.name === 'Subject')?.value || '';
          const body = he.decode(message.snippet || '');
          
          emails.push({
            from,
            subject,
            body,
            snippet: body.substring(0, 100)
          });
        }
      } catch (error) {
        logger.error(`Error processing thread ${thread.id}:`, error);
        // Continue with other threads
      }
    }
    
    logger.info(`Processed ${emails.length} emails for labeling`);
    
    // Label the emails using AI
    const labels = await AIService.labelEmailsBatch(emails);
    
    // Combine emails with their labels
    const labeledEmails = emails.map((email, index) => ({
      ...email,
      label: labels[index]
    }));
    
    return res.json({
      success: true,
      processed: emails.length,
      labeledEmails,
      summary: {
        needsReply: labeledEmails.filter(e => e.label.label === 'NEEDS_REPLY').length,
        important: labeledEmails.filter(e => e.label.label === 'IMPORTANT_UPDATE').length,
        marketing: labeledEmails.filter(e => e.label.label === 'MARKETING').length,
        receipts: labeledEmails.filter(e => e.label.label === 'RECEIPTS').length,
        spam: labeledEmails.filter(e => e.label.label === 'SPAM').length,
        work: labeledEmails.filter(e => e.label.label === 'WORK').length,
        personal: labeledEmails.filter(e => e.label.label === 'PERSONAL').length,
        other: labeledEmails.filter(e => e.label.label === 'OTHER').length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error processing user emails:', error);
    return res.status(500).json({ error: 'Failed to process emails' });
  }
});

// Helper function to create Gmail client with automatic token refresh
const createGmailClient = (accessToken: string, refreshToken?: string) => {
  const oauth2Client = new google.auth.OAuth2();
  
  // Try with current access token first
  oauth2Client.setCredentials({ access_token: accessToken });
  
  // If that fails, try refreshing the token
  const tryWithRefresh = async () => {
    if (refreshToken) {
      try {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials({ access_token: credentials.access_token });
        logger.info('Successfully refreshed Google access token');
      } catch (refreshError) {
        logger.error('Failed to refresh Google access token:', refreshError);
        throw new Error('Authentication failed - please log in again');
      }
    } else {
      throw new Error('No refresh token available - please log in again');
    }
  };
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  return { gmail, oauth2Client, tryWithRefresh };
};

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
      maxResults: 20, // Reduced to 20 threads per page for better performance
      q: req.query.q as string || '',
      pageToken: req.query.pageToken as string || undefined,
    });

    const threads = response.data.threads || [];
    
    // Use batch requests to get thread metadata more efficiently
    const threadsWithPreview = await Promise.allSettled(
      threads.map(async (thread, index) => { // Process all 8 threads
        // Add delay between requests to avoid overwhelming Gmail API
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay for better performance
        }
        
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
            5000 // Much longer timeout - 5 seconds
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
            from: 'Unknown Sender',
            subject: thread.snippet ? thread.snippet.substring(0, 50) + '...' : '(No Subject)',
            date: new Date().toISOString(),
            messageCount: 1,
            read: true, // Default to read if we can't determine
            labels: ['INBOX'],
          };
        }
      })
    );

    // Filter out failed requests and get successful results
    const successfulThreads = threadsWithPreview
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    return res.json({ 
      threads: successfulThreads,
      nextPageToken: response.data.nextPageToken,
      hasMore: !!response.data.nextPageToken
    });
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
      5000 // Reduced to 5 second timeout for labels
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



// Find threads by sender name
router.get('/threads/by-sender', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sender } = req.query;
    
    if (!sender || typeof sender !== 'string') {
      return res.status(400).json({ error: 'Sender name is required' });
    }
    
    const { gmail, tryWithRefresh } = createGmailClient(req.user.accessToken, req.user.refreshToken);
    
    // Search for emails from this sender - be more flexible with the search
    // Split the sender name into words and search for any of them
    const senderWords = sender.split(/\s+/).filter(word => word.length > 2);
    let searchQuery = senderWords.length > 0 
      ? `from:(${senderWords.join(' OR ')})`
      : `from:${sender}`;
    
    // If no results, try a broader search
    if (sender.toLowerCase().includes('trader') || sender.toLowerCase().includes('broker')) {
      searchQuery = 'from:trader OR from:broker OR from:brokerage';
    }
    
    logger.info(`Searching for emails with query: "${searchQuery}" from sender: "${sender}"`);
    
    try {
      logger.info(`Making Gmail API call: threads.list with query: "${searchQuery}"`);
      logger.info(`Gmail client object:`, typeof gmail, gmail.users ? 'has users' : 'no users');
      const threadsResult = await withTimeout(gmail.users.threads.list({
        userId: 'me',
        q: searchQuery,
        maxResults: 10,
      }));

      if (!threadsResult.data.threads || threadsResult.data.threads.length === 0) {
        return res.status(404).json({ error: `No emails found from "${sender}"` });
      }

      // Get the most recent thread from this sender
      const threadId = threadsResult.data.threads[0].id!;
      logger.info(`Found thread ID: ${threadId}, now fetching full thread details`);
      
      const threadResult = await withTimeout(gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      }));

      const thread = threadResult.data;
      if (!thread.messages) {
        return res.status(404).json({ error: 'Thread has no messages' });
      }

      // Get the latest message in the thread
      const latestMessage = thread.messages[thread.messages.length - 1];
      const headers = latestMessage.payload?.headers || [];
      const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
      
      // Extract message body
      const cleanBody = extractEmailBody(latestMessage.payload!);
      
      const threadData = {
        id: threadId,
        subject: subjectHeader?.value || 'No Subject',
        from: fromHeader?.value || 'Unknown Sender',
        snippet: thread.snippet || cleanBody.substring(0, 150) + '...',
        fullBody: cleanBody,
        messageCount: thread.messages.length,
        latestMessage: {
          id: latestMessage.id,
          from: fromHeader?.value || 'Unknown Sender',
          subject: subjectHeader?.value || 'No Subject',
          body: cleanBody,
          snippet: latestMessage.snippet || cleanBody.substring(0, 150) + '...',
        }
      };

      logger.info(`Found thread from "${sender}": ${threadData.subject}`);
      return res.json({ thread: threadData });

    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        await tryWithRefresh();
        // Retry the request with refreshed token
        throw new Error('Token refreshed, please retry the request');
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error finding thread by sender:', error);
    return res.status(500).json({ error: 'Failed to find thread by sender' });
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

// Store active summary requests for cancellation
const activeSummaryRequests = new Map<string, { res: express.Response, cancelled: boolean }>();

// Generate inbox summary
router.post('/summary', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  const requestId = Math.random().toString(36).substring(7);
  activeSummaryRequests.set(requestId, { res, cancelled: false });
  
  try {
    const { accessToken, refreshToken } = req.user;
    
    const { gmail, tryWithRefresh } = createGmailClient(accessToken, refreshToken);
    
    // Get threads (limit to 50 for summary)
    let threadsResponse;
    try {
      threadsResponse = await withTimeout(
        gmail.users.threads.list({
          userId: 'me',
          maxResults: 50,
        }),
        10000
      );
    } catch (error: any) {
      // If we get a 401, try refreshing the token
      if (error.code === 401 || error.response?.status === 401) {
        logger.info('Access token expired, attempting to refresh...');
        await tryWithRefresh();
        
        // Retry the request with refreshed token
        threadsResponse = await withTimeout(
          gmail.users.threads.list({
            userId: 'me',
            maxResults: 50,
          }),
          10000
        );
      } else {
        throw error;
      }
    }

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

    // Check if request was cancelled
    const requestInfo = activeSummaryRequests.get(requestId);
    if (requestInfo?.cancelled) {
      logger.info(`Summary request ${requestId} was cancelled`);
      activeSummaryRequests.delete(requestId);
      return res.status(499).json({ error: 'Request cancelled' });
    }

    // Classify emails first
    const emailsToClassify: EmailContent[] = validThreads.map(thread => ({
      subject: thread.subject,
      body: '', // We don't need body for summary
      from: thread.from,
    }));

    const classifications = await AIService.classifyBatch(emailsToClassify);
    
    // Check again if request was cancelled after classification
    if (requestInfo?.cancelled) {
      logger.info(`Summary request ${requestId} was cancelled after classification`);
      activeSummaryRequests.delete(requestId);
      return res.status(499).json({ error: 'Request cancelled' });
    }
    
    // Generate summary
    const summary = await AIService.generateInboxSummary(validThreads, classifications);
    
    // Check one more time before sending response
    if (requestInfo?.cancelled) {
      logger.info(`Summary request ${requestId} was cancelled before sending response`);
      activeSummaryRequests.delete(requestId);
      return res.status(499).json({ error: 'Request cancelled' });
    }
    
    logger.info(`Generated inbox summary for ${validThreads.length} threads`);
    activeSummaryRequests.delete(requestId);
    return res.json({ summary });
  } catch (error) {
    logger.error('Error generating inbox summary:', error);
    activeSummaryRequests.delete(requestId);
    return res.status(500).json({ error: 'Failed to generate inbox summary' });
  }
});

// Cancel summary request
router.post('/summary/cancel', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }
    
    const requestInfo = activeSummaryRequests.get(requestId);
    if (requestInfo) {
      requestInfo.cancelled = true;
      logger.info(`Cancelled summary request ${requestId}`);
      return res.json({ success: true, message: 'Request cancelled' });
    } else {
      return res.status(404).json({ error: 'Request not found' });
    }
  } catch (error) {
    logger.error('Error cancelling summary request:', error);
    return res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// Generate a reply for a specific thread
router.post('/generate-reply', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { sender } = req.query;
    
    if (!sender || typeof sender !== 'string') {
      return res.status(400).json({ error: 'Sender name is required' });
    }
    
    const { gmail, tryWithRefresh } = createGmailClient(req.user.accessToken, req.user.refreshToken);
    
    // Search for emails from this sender - be more flexible with the search
    // Split the sender name into words and search for any of them
    const senderWords = sender.split(/\s+/).filter(word => word.length > 2);
    let searchQuery = senderWords.length > 0 
      ? `from:(${senderWords.join(' OR ')})`
      : `from:${sender}`;
    
    // If no results, try a broader search
    if (sender.toLowerCase().includes('trader') || sender.toLowerCase().includes('broker')) {
      searchQuery = 'from:trader OR from:broker OR from:brokerage';
    }
    
    logger.info(`Searching for emails with query: "${searchQuery}" from sender: "${sender}"`);
    
    try {
      logger.info(`Making Gmail API call: threads.list with query: "${searchQuery}"`);
      logger.info(`Gmail client object:`, typeof gmail, gmail.users ? 'has users' : 'no users');
      const threadsResult = await withTimeout(gmail.users.threads.list({
        userId: 'me',
        q: searchQuery,
        maxResults: 10,
      }));

      if (!threadsResult.data.threads || threadsResult.data.threads.length === 0) {
        return res.status(404).json({ error: `No emails found from "${sender}"` });
      }

      // Get the most recent thread from this sender
      const threadId = threadsResult.data.threads[0].id!;
      logger.info(`Found thread ID: ${threadId}, now fetching full thread details`);
      
      const threadResult = await withTimeout(gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      }));

      const thread = threadResult.data;
      if (!thread.messages) {
        return res.status(404).json({ error: 'Thread has no messages' });
      }

      // Get the latest message in the thread
      const latestMessage = thread.messages[thread.messages.length - 1];
      const headers = latestMessage.payload?.headers || [];
      const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
      
      // Extract message body
      const cleanBody = extractEmailBody(latestMessage.payload!);
      
      const threadData = {
        id: threadId,
        subject: subjectHeader?.value || 'No Subject',
        from: fromHeader?.value || 'Unknown Sender',
        snippet: thread.snippet || cleanBody.substring(0, 150) + '...',
        fullBody: cleanBody,
        messageCount: thread.messages.length,
        latestMessage: {
          id: latestMessage.id,
          from: fromHeader?.value || 'Unknown Sender',
          subject: subjectHeader?.value || 'No Subject',
          body: cleanBody,
          snippet: latestMessage.snippet || cleanBody.substring(0, 150) + '...',
        }
      };

      logger.info(`Found thread from "${sender}": ${threadData.subject}`);
      return res.json({ thread: threadData });

    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        await tryWithRefresh();
        // Retry the request with refreshed token
        throw new Error('Token refreshed, please retry the request');
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error finding thread by sender:', error);
    return res.status(500).json({ error: 'Failed to find thread by sender' });
  }
});

// Generate a reply for a specific thread
router.post('/generate-reply', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { threadId, instruction } = req.body;
    
    if (!threadId || !instruction) {
      return res.status(400).json({ error: 'Thread ID and instruction are required' });
    }
    
    const { gmail, tryWithRefresh } = createGmailClient(req.user.accessToken, req.user.refreshToken);
    
    try {
      // Get the thread to understand context
      const threadResult = await withTimeout(gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      }));

      const thread = threadResult.data;
      if (!thread.messages || thread.messages.length === 0) {
        return res.status(404).json({ error: 'Thread not found or has no messages' });
      }

      // Get the latest message for context
      const latestMessage = thread.messages[thread.messages.length - 1];
      const headers = latestMessage.payload?.headers || [];
      const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from');
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
      
      // Extract the email body
      const cleanBody = extractEmailBody(latestMessage.payload!);
      
      // Generate AI reply
      const replyContent = await AIService.generateContextualReply({
        originalEmail: {
          from: fromHeader?.value || 'Unknown Sender',
          subject: subjectHeader?.value || 'No Subject',
          body: cleanBody,
        },
        instruction: instruction,
        userName: req.user.name || 'User',
      });

      logger.info(`Generated reply for thread ${threadId} with instruction: ${instruction}`);
      return res.json({ 
        reply: replyContent,
        threadId: threadId,
        originalSubject: subjectHeader?.value || 'No Subject',
        replyTo: fromHeader?.value || 'Unknown Sender',
      });

    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        await tryWithRefresh();
        // Retry the request with refreshed token
        throw new Error('Token refreshed, please retry the request');
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error generating reply:', error);
    return res.status(500).json({ error: 'Failed to generate reply' });
  }
});

// Generate contextual reply automatically
router.post('/generate-contextual-reply', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { threadId } = req.body;

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    const tryWithRefresh = async () => {
      const { gmail } = createGmailClient(req.user.accessToken, req.user.refreshToken);
      
      // Get the thread to understand context
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      });

      const thread = threadResponse.data;
      if (!thread.messages || thread.messages.length === 0) {
        throw new Error('Thread has no messages');
      }

      // Get the latest message (the one to reply to)
      const latestMessage = thread.messages[thread.messages.length - 1];
      const payload = latestMessage.payload;
      
      // Extract email content
      const fromHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from');
      const subjectHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject');
      const senderName = fromHeader?.value?.replace(/<.*>/g, '').trim() || 'Unknown';
      const originalSubject = subjectHeader?.value || 'No Subject';

      // Extract email body
      const emailBody = extractEmailBody(payload!);

      // Generate contextual reply using AI
      const replyContent = await AIService.generateContextualReply({
        originalEmail: {
          from: senderName,
          subject: originalSubject,
          body: emailBody,
        },
        instruction: "Write a professional and contextual reply that acknowledges the email content and provides a helpful response. Be concise but complete.",
        userName: req.user.name || 'User',
      });

      logger.info(`Generated contextual reply for thread ${threadId}`);
      return res.json({ 
        reply: replyContent,
        threadId: threadId,
        originalSubject: originalSubject,
        replyTo: senderName,
      });
    };

    try {
      return await tryWithRefresh();
    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        return await tryWithRefresh();
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error generating contextual reply:', error);
    return res.status(500).json({ error: 'Failed to generate contextual reply' });
  }
});

// Send reply email
router.post('/send-reply', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { threadId, replyContent } = req.body;

    if (!threadId || !replyContent) {
      return res.status(400).json({ error: 'Thread ID and reply content are required' });
    }

    const tryWithRefresh = async () => {
      const { gmail } = createGmailClient(req.user.accessToken, req.user.refreshToken);
      
      // Get the thread to get reply information
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      });

      const thread = threadResponse.data;
      if (!thread.messages || thread.messages.length === 0) {
        throw new Error('Thread has no messages');
      }

      // Get the latest message to reply to
      const latestMessage = thread.messages[thread.messages.length - 1];
      const payload = latestMessage.payload;
      
      // Extract headers for reply
      const fromHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from');
      const subjectHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject');
      const messageIdHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'message-id');
      
      const toEmail = fromHeader?.value?.match(/<(.+)>/)?.[1] || fromHeader?.value || '';
      const originalSubject = subjectHeader?.value || '';
      const replySubject = originalSubject.startsWith('Re: ') ? originalSubject : `Re: ${originalSubject}`;

      // Create reply email
      const emailContent = [
        `To: ${toEmail}`,
        `Subject: ${replySubject}`,
        messageIdHeader ? `In-Reply-To: ${messageIdHeader.value}` : '',
        messageIdHeader ? `References: ${messageIdHeader.value}` : '',
        'Content-Type: text/plain; charset=utf-8',
        '',
        replyContent
      ].filter(line => line !== '').join('\n');

      // Encode the email
      const encodedEmail = Buffer.from(emailContent).toString('base64url');

      // Send the reply
      const sendResponse = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail,
          threadId: threadId,
        },
      });

      logger.info(`Reply sent successfully for thread ${threadId}, message ID: ${sendResponse.data.id}`);
      return res.json({ 
        success: true,
        messageId: sendResponse.data.id,
        threadId: threadId,
      });
    };

    try {
      return await tryWithRefresh();
    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        return await tryWithRefresh();
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error sending reply:', error);
    return res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Edit existing reply with user feedback
router.post('/edit-reply', authMiddleware, async (req: AuthRequest, res: express.Response) => {
  try {
    const { threadId, currentReply, editFeedback } = req.body;

    if (!threadId || !currentReply || !editFeedback) {
      return res.status(400).json({ error: 'Thread ID, current reply, and edit feedback are required' });
    }

    const tryWithRefresh = async () => {
      const { gmail } = createGmailClient(req.user.accessToken, req.user.refreshToken);
      
      // Get the thread to understand context
      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
      });

      const thread = threadResponse.data;
      if (!thread.messages || thread.messages.length === 0) {
        throw new Error('Thread has no messages');
      }

      // Get the latest message (the one to reply to)
      const latestMessage = thread.messages[thread.messages.length - 1];
      const payload = latestMessage.payload;
      
      // Extract email content
      const fromHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'from');
      const subjectHeader = payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'subject');
      const senderName = fromHeader?.value?.replace(/<.*>/g, '').trim() || 'Unknown';
      const originalSubject = subjectHeader?.value || 'No Subject';

      // Extract email body
      const emailBody = extractEmailBody(payload!);

      // Generate edited reply using AI
      const editedReply = await AIService.generateEditedReply({
        originalEmail: {
          from: senderName,
          subject: originalSubject,
          body: emailBody,
        },
        currentReply: currentReply,
        editFeedback: editFeedback,
        userName: req.user.name || 'User',
      });

      logger.info(`Generated edited reply for thread ${threadId} with feedback: ${editFeedback}`);
      return res.json({ 
        reply: editedReply,
        threadId: threadId,
        originalSubject: originalSubject,
        replyTo: senderName,
      });
    };

    try {
      return await tryWithRefresh();
    } catch (error: any) {
      if (error.code === 401) {
        logger.info('Access token expired, attempting refresh...');
        return await tryWithRefresh();
      }
      throw error;
    }

  } catch (error) {
    logger.error('Error editing reply:', error);
    return res.status(500).json({ error: 'Failed to edit reply' });
  }
});

export default router; 