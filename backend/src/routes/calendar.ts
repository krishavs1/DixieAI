import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { google } from 'googleapis';
import { logger } from '../utils/logger';

interface AuthRequest extends Request {
  user?: any;
}

const router = express.Router();

// Middleware to ensure user is authenticated
router.use(authMiddleware);

// Analyze email content to determine if a meeting should be scheduled
router.post('/analyze-meeting', async (req: AuthRequest, res: Response) => {
  try {
    const { emailContent, senderEmail } = req.body;
    const user = req.user;

    if (!emailContent || !senderEmail) {
      return res.status(400).json({ error: 'Email content and sender email are required' });
    }

    // Use OpenAI to analyze if a meeting should be scheduled
    const analysisPrompt = `
    Analyze this email content and determine if a meeting should be scheduled. Consider:
    1. Does the email mention scheduling a meeting, call, or discussion?
    2. Are there action items that require a meeting?
    3. Is there a request for availability or time slots?
    4. Does the content suggest collaboration or discussion is needed?

    Email content: "${emailContent}"
    Sender: ${senderEmail}

    Respond with a JSON object:
    {
      "shouldSchedule": true/false,
      "reason": "explanation",
      "suggestedTime": "if mentioned, otherwise null",
      "duration": 30,
      "attendees": ["email1", "email2"],
      "summary": "meeting title"
    }
    `;

    const openai = require('openai');
    const client = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that analyzes emails to determine if meetings should be scheduled. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    logger.info('Meeting analysis completed', { 
      shouldSchedule: analysis.shouldSchedule, 
      senderEmail,
      userId: user.userId 
    });

    return res.json(analysis);
  } catch (error) {
    logger.error('Error analyzing meeting suggestion:', error);
    return res.status(500).json({ error: 'Failed to analyze meeting suggestion' });
  }
});

// Create a calendar event and send invites
router.post('/create-event', async (req: AuthRequest, res: Response) => {
  try {
    const { summary, description, startTime, endTime, attendees, location } = req.body;
    const user = req.user;

    if (!summary || !startTime || !endTime || !attendees) {
      return res.status(400).json({ error: 'Summary, start time, end time, and attendees are required' });
    }

    // Create Google Calendar API client
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: user.accessToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Create the event
    const event = {
      summary,
      description,
      start: {
        dateTime: startTime,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/New_York',
      },
      attendees: attendees.map((email: string) => ({ email })),
      location,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Send invites to all attendees
    });

    logger.info('Calendar event created successfully', { 
      eventId: response.data.id,
      attendees: attendees.length,
      userId: user.userId 
    });

    return res.json({
      success: true,
      eventId: response.data.id,
      eventLink: response.data.htmlLink,
      attendees: response.data.attendees,
    });
  } catch (error) {
    logger.error('Error creating calendar event:', error);
    return res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

// Get user's calendar availability
router.get('/availability', async (req: AuthRequest, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const user = req.user;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: user.accessToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + parseInt(days as string));

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busy = response.data.calendars?.primary?.busy || [];
    
    logger.info('Calendar availability retrieved', { 
      days: parseInt(days as string),
      busySlots: busy.length,
      userId: user.userId 
    });

    return res.json(busy);
  } catch (error) {
    logger.error('Error getting calendar availability:', error);
    return res.status(500).json({ error: 'Failed to get calendar availability' });
  }
});

// Suggest meeting times based on availability
router.post('/suggest-times', async (req: AuthRequest, res: Response) => {
  try {
    const { attendees, duration = 30 } = req.body;
    const user = req.user;

    if (!attendees || attendees.length === 0) {
      return res.status(400).json({ error: 'At least one attendee is required' });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: user.accessToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get availability for next 7 days
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(now.getDate() + 7);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        items: [
          { id: 'primary' },
          ...attendees.map((email: string) => ({ id: email }))
        ],
      },
    });

    // Find free time slots
    const suggestedTimes = [];
    const businessHours = { start: 9, end: 17 }; // 9 AM to 5 PM

    for (let day = 0; day < 7; day++) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + day);
      
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;

      for (let hour = businessHours.start; hour < businessHours.end; hour++) {
        const slotStart = new Date(currentDate);
        slotStart.setHours(hour, 0, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);

        // Check if this time slot is free for all attendees
        const isFree = !response.data.calendars?.primary?.busy?.some((busy: any) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slotStart < busyEnd && slotEnd > busyStart;
        });

        if (isFree && slotStart > now) {
          suggestedTimes.push(slotStart.toISOString());
          if (suggestedTimes.length >= 5) break; // Limit to 5 suggestions
        }
      }
      if (suggestedTimes.length >= 5) break;
    }

    logger.info('Meeting time suggestions generated', { 
      suggestions: suggestedTimes.length,
      attendees: attendees.length,
      userId: user.userId 
    });

    return res.json({ suggestedTimes });
  } catch (error) {
    logger.error('Error suggesting meeting times:', error);
    return res.status(500).json({ error: 'Failed to suggest meeting times' });
  }
});

export default router; 