# Dixie AI Setup Guide

## Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- Google Cloud Console account
- Gmail account

## 1. Google OAuth Setup

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Gmail API and Google+ API

### Step 2: Get Android SHA-1 Certificate Fingerprint
First, initialize EAS to get your Android credentials:

```bash
eas init
```

Then get your SHA-1 certificate fingerprint:

```bash
eas credentials
```

Select **Android** → **Keystore** to view/generate your SHA-1 fingerprint.

**Alternative for quick testing** (debug keystore):
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey
```
Password: `android`

### Step 3: Create OAuth Credentials
1. Navigate to "Credentials" in the left sidebar
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the consent screen if prompted
4. For Application type, choose "iOS" and "Android" for mobile apps
5. For iOS, add your bundle identifier: `com.dixieai.mobile`
6. For Android, add your package name: `com.dixieai.mobile` and SHA-1 certificate fingerprint (from step 2)
7. Also create a "Web application" credential for the backend

### Step 4: Get Your Client IDs
- Copy the **Web Client ID** for the backend
- Copy the **iOS Client ID** for the React Native app
- Copy the **Client Secret** for the backend

## 2. Backend Configuration

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Environment Variables
Create a `.env` file in the backend directory:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_web_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# JWT Configuration
JWT_SECRET=your_jwt_secret_here_make_it_long_and_secure

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Step 3: Start Backend Server
```bash
npm run dev
```

## 3. React Native App Configuration

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Update Client ID
1. Open `src/config/api.ts`
2. Replace `YOUR_GOOGLE_CLIENT_ID` with your **iOS Client ID**

### Step 3: Configure URL Scheme
1. In `app.json`, add the scheme:
```json
{
  "expo": {
    "scheme": "dixie-ai",
    "ios": {
      "bundleIdentifier": "com.yourname.dixieai"
    },
    "android": {
      "package": "com.yourname.dixieai"
    }
  }
}
```

### Step 4: Start the App
```bash
npx expo start
```

## 4. Testing the Setup

### Backend Health Check
Visit `http://localhost:3000/auth/google/url` to verify the backend is running.

### App Testing
1. Launch the app
2. Try "Continue with Google" - it should open a browser for OAuth
3. After successful authentication, you should see your emails

## 5. Troubleshooting

### Common Issues

**"Invalid Client ID"**
- Ensure you're using the correct Client ID for each platform
- iOS apps need iOS Client ID, not Web Client ID

**"Redirect URI Mismatch"**
- Make sure your redirect URI in Google Console matches exactly
- For development: `http://localhost:3000/auth/google/callback`

**"Unable to load emails"**
- Check that Gmail API is enabled in Google Cloud Console
- Ensure the backend server is running on port 3000
- Check the browser console for error messages

**"Authentication failed"**
- Verify that your JWT_SECRET is set in backend .env
- Check backend logs for detailed error messages

## 6. Production Deployment

### Backend
1. Deploy to services like Heroku, Railway, or Render
2. Update the `GOOGLE_REDIRECT_URI` to match your production URL
3. Add the production domain to Google OAuth redirect URIs

### React Native App
1. Update `API_CONFIG.BASE_URL` in `src/config/api.ts`
2. Build the app using `expo build` or EAS Build
3. Upload to App Store / Play Store

## 7. Next Steps

After setup, you can:
- Test sending emails through the chat interface
- Customize the AI responses
- Add more Gmail features (labels, filters, etc.)
- Implement push notifications for new emails

Need help? Check the logs in both the backend server and React Native debugger for detailed error messages. 