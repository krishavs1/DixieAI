import express from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Schema for token exchange
const tokenExchangeSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

// Get OAuth URL
router.get('/google/url', (req: express.Request, res: express.Response) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: req.query.state as string || '',
    });

    return res.json({ url });
  } catch (error) {
    logger.error('Error generating OAuth URL:', error);
    return res.status(500).json({ error: 'Failed to generate authentication URL' });
  }
});

// Exchange code for tokens
router.post('/google/callback', async (req: express.Request, res: express.Response) => {
  try {
    const { code } = tokenExchangeSchema.parse(req.body);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Create JWT token
    const jwtToken = jwt.sign(
      {
        userId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '7d' }
    );

    // TODO: Store user and tokens in database
    logger.info(`User authenticated: ${userInfo.email}`);

    return res.json({
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
      token: jwtToken,
      refreshToken: tokens.refresh_token,
    });
  } catch (error) {
    logger.error('Error in OAuth callback:', error);
    return res.status(400).json({ error: 'Authentication failed' });
  }
});

// Refresh tokens
router.post('/refresh', async (req: express.Request, res: express.Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    return res.json({
      accessToken: credentials.access_token,
      expiresIn: credentials.expiry_date,
    });
  } catch (error) {
    logger.error('Error refreshing tokens:', error);
    return res.status(400).json({ error: 'Failed to refresh tokens' });
  }
});

export default router; 