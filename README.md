# DixieAI - Your AI Email Assistant

A React Native mobile app that provides AI-powered email management using Gmail API.

## Features

- **Google Sign-In** - Secure authentication with Gmail
- **Email Management** - View, search, and manage email threads
- **AI-Powered Replies** - Generate intelligent, contextual email replies using OpenAI GPT-4
- **Smart Context Analysis** - AI understands email content and generates appropriate responses
- **Fallback System** - Template-based replies when AI service is unavailable

### Prerequisites

- Node.js 16+
- React Native development environment
- Google Cloud Console project with Gmail API enabled

### Installation

1. **Clone the repository**
```bash
   git clone <repository-url>
   cd DixieAI
   ```

2. **Install dependencies**
   ```bash
npm install
```

3. **Start the backend server**
```bash
cd backend
   npm install
npm start
```

4. **Start the mobile app**
   ```bash
   npx expo start
   ```

### Configuration

1. **Google OAuth Setup**
   - Create a project in Google Cloud Console
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Update `src/config/googleSignIn.ts` with your client ID

2. **Backend Environment**
   - Copy `.env.example` to `.env` in the backend folder
   - Add your Google OAuth credentials
   - Set your JWT secret
   - Add your OpenAI API key for AI-powered replies

3. **OpenAI API Setup**
   - Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Add `OPENAI_API_KEY=your_api_key_here` to your backend `.env` file
   - The AI reply feature will use GPT-4o-mini for intelligent email responses
   - If no API key is provided, the app will use template-based fallback replies

## Development

### Project Structure

```
DixieAI/
├── src/
│   ├── config/          # Configuration files
│   ├── context/         # React Context providers
│   ├── screens/         # App screens
│   ├── services/        # API services
│   └── utils/           # Utility functions
├── backend/             # Express.js backend
├── android/             # Android-specific files
└── ios/                 # iOS-specific files
```

### Key Features

- **Dynamic IP Detection** - Automatically finds backend server
- **Timeout Handling** - Robust network request handling
- **Retry Logic** - Automatic retry with exponential backoff
- **Error Recovery** - Graceful handling of network issues
- **Real-time Updates** - Network change detection

## Troubleshooting

### Common Issues

1. **"Server disconnected" error**
   - Ensure backend is running on port 3000
   - Check if your IP address is in the supported patterns
   - Try tapping the refresh button

2. **Timeout errors**
   - The app now has robust timeout handling
   - Check your internet connection
   - Verify backend server is accessible

3. **Google Sign-In issues**
   - Verify OAuth credentials are correct
   - Check if Gmail API is enabled
   - Ensure redirect URI matches your app

### Network Changes

When you change networks (WiFi, mobile data, etc.):
- The app automatically detects the change
- Clears the cached backend URL
- Re-scans for the correct IP address
- Updates the connection status

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. 