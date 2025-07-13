import express from 'express';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { z } from 'zod';
import axios from 'axios';

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

// Schema for mobile authentication
const mobileAuthSchema = z.object({
  idToken: z.string(),
});

// Get OAuth URL
router.get('/google/url', (req: express.Request, res: express.Response) => {
  try {
    // Support custom redirect URI from query parameter (for mobile apps)
    const redirectUri = req.query.redirect_uri as string || process.env.GOOGLE_REDIRECT_URI;
    
    // Create OAuth client with the appropriate redirect URI
    const oauthClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
    ];

    const url = oauthClient.generateAuthUrl({
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
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
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
      accessToken: tokens.access_token,
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

// Mobile Google authentication endpoint (like YouTube tutorial)
router.post('/google/mobile', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { idToken } = mobileAuthSchema.parse(req.body);

    // Verify the ID token with Google API (like in YouTube tutorial)
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    const { sub, email, name, given_name, family_name, picture } = response.data;

    // Verify the client ID matches
    if (response.data.aud !== process.env.GOOGLE_CLIENT_ID) {
      res.status(400).json({ message: 'Invalid client ID' });
      return;
    }

    // Create user object
    const user = {
      googleId: sub,
      email,
      name,
      givenName: given_name,
      familyName: family_name,
      picture,
    };

    // Create JWT token for authentication
    const token = jwt.sign(
      { userId: sub, email: email },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    logger.info(`Mobile Google authentication successful for user: ${email}`);

    // Send response with the user and token (like YouTube tutorial)
    res.status(200).json({
      message: 'Google login successful',
      user,
      token,
    });
  } catch (error: any) {
    logger.error('Mobile Google authentication failed:', error);
    res.status(400).json({ message: 'Google authentication failed', error: error.message });
  }
});

export default router; 