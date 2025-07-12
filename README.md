# 🤖 Dixie AI - Intelligent Email Assistant

<p align="center">
  <img src="https://img.shields.io/badge/React%20Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI" />
  <img src="https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail" />
</p>

Dixie is an **AI-powered mobile email assistant** that lets you interact with your Gmail inbox through natural conversation and voice commands. Think of it as ChatGPT meets your email, with the convenience of Superhuman's speed and the intelligence of a personal assistant.

## ✨ Features

- 🗣️ **Voice Commands**: Dictate emails and ask questions using your voice
- 💬 **Chat Interface**: Talk to your inbox like a chatbot
- 🧠 **AI Summarization**: Get smart summaries of threads and emails
- ✍️ **Reply Generation**: AI-powered reply suggestions
- 🔍 **Natural Language Search**: Ask questions like "What did my boss say yesterday?"
- 📱 **Mobile-First**: Optimized for phone usage with React Native
- 🔐 **Secure**: OAuth 2.0 integration with Gmail API

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  React Native   │    │   Node.js API   │    │   External      │
│     Frontend    │◄──►│    Backend      │◄──►│   Services      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Chat UI       │    │ • Gmail API     │    │ • Gmail API     │
│ • Voice Input   │    │ • OpenAI API    │    │ • OpenAI API    │  
│ • Auth Flow     │    │ • JWT Auth      │    │ • PostgreSQL    │
│ • State Mgmt    │    │ • Rate Limiting │    │ • Redis         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- PostgreSQL database
- Redis (optional, for caching)
- Google Cloud Console project
- OpenAI API key

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd dixie-ai

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

### 2. Environment Setup

**Frontend (root directory):**
```bash
cp .env.example .env
# Edit .env with your Google Client ID
```

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env with all required credentials
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Add your client ID to both frontend and backend `.env` files

### 4. Database Setup

```bash
# Start PostgreSQL
# Update DATABASE_URL in backend/.env

cd backend
npm run db:generate
npm run db:migrate
```

### 5. Start Development

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm start
```

## 📱 Usage

### Authentication
1. Open the app and tap "Continue with Google"
2. Grant Gmail permissions
3. You'll be redirected to the main inbox view

### Chat with Your Inbox
- **Voice**: Tap the microphone and speak naturally
- **Text**: Type questions like:
  - "Summarize my unread emails"
  - "What did Sarah say about the project?"
  - "Draft a reply to the meeting request"

### Smart Features
- **Quick Actions**: Tap buttons for common tasks
- **Thread View**: Tap any email to open chat mode
- **Voice Replies**: Use voice-to-text for quick responses

## 🛠️ Development

### Project Structure

```
dixie-ai/
├── src/                    # React Native source
│   ├── components/         # Reusable UI components
│   ├── screens/           # Screen components
│   ├── services/          # API clients & utilities
│   ├── store/            # State management (Zustand)
│   └── types/            # TypeScript definitions
├── backend/               # Node.js API server
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── middleware/   # Express middleware
│   │   ├── utils/        # Utility functions
│   │   └── types/        # TypeScript definitions
│   └── logs/             # Application logs
└── docs/                 # Documentation
```

### Key Technologies

**Frontend:**
- React Native + Expo
- TypeScript
- Zustand (state management)
- React Navigation
- Gifted Chat
- React Query

**Backend:**
- Node.js + Express
- TypeScript
- Gmail API
- OpenAI API
- PostgreSQL + Drizzle ORM
- Redis (caching)
- JWT Authentication

## 📋 API Endpoints

### Authentication
- `GET /api/auth/google/url` - Get OAuth URL
- `POST /api/auth/google/callback` - Exchange code for tokens
- `POST /api/auth/refresh` - Refresh access token

### Email Operations
- `GET /api/email/threads` - List email threads
- `GET /api/email/threads/:id` - Get specific thread
- `POST /api/email/send` - Send email/reply

### AI Features
- `POST /api/ai/summarize` - Summarize email content
- `POST /api/ai/reply` - Generate reply suggestions
- `POST /api/ai/query` - Answer questions about emails
- `POST /api/ai/chat` - Chat with AI assistant

## 🔧 Configuration

### Gmail API Scopes
```javascript
const scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile', 
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send'
];
```

### OpenAI Models
- **Summarization**: `gpt-4o-mini` (cost-efficient)
- **Reply Generation**: `gpt-4o-mini` (creative responses)
- **Chat**: `gpt-4o-mini` (conversational)

## 🚀 Deployment

### Backend (Node.js)
```bash
cd backend
npm run build
npm start
```

### Frontend (React Native)
```bash
# Build for production
expo build:android
expo build:ios
```

### Environment Variables (Production)
- Set `NODE_ENV=production`
- Use secure JWT secrets
- Configure production database URLs
- Set up proper CORS origins

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Documentation](https://docs.expo.dev/)

## 📞 Support

For support, email support@dixie-ai.com or join our [Discord](https://discord.gg/dixie-ai).

---

<p align="center">
  Made with ❤️ by the Dixie AI team
</p> 