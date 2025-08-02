# ElevenLabs TTS Integration Setup

## 🎯 **What We're Doing**
Replacing Expo's basic TTS with ElevenLabs for much better voice quality.

## 📋 **Setup Steps**

### 1. **Get ElevenLabs API Key**
- Go to [ElevenLabs.io](https://elevenlabs.io)
- Sign up for a free account
- Get your API key from the dashboard
- Free tier gives you 10,000 characters per month

### 2. **Add Environment Variable**
Add to your `.env` file:
```
ELEVENLABS_API_KEY=your-api-key-here
```

### 3. **Install Dependencies**
```bash
npm install buffer
```

### 4. **Update the TTS Service**
The `src/services/elevenLabsTTS.ts` file is already created with:
- ✅ ElevenLabs API integration
- ✅ Audio playback using expo-av
- ✅ Proper error handling
- ✅ Callback support (onStart, onDone, onError)

### 5. **Replace Speech References**
You need to replace all `Speech.speak()` and `Speech.stop()` calls with `elevenLabsTTS.speak()` and `elevenLabsTTS.stop()`.

## 🎙️ **Voice Options**
You can change the voice by updating the `voiceId` in `elevenLabsTTS.ts`:

- **Rachel** (current): `21m00Tcm4TlvDq8ikWAM` - Professional, clear
- **Domi**: `AZnzlk1XvdvUeBnXmlld` - Warm, friendly
- **Bella**: `EXAVITQu4vr4xnSDxMaL` - Natural, conversational
- **Antoni**: `ErXwobaYiN019PkySvjV` - Deep, authoritative

## 🔧 **Usage Example**
```typescript
import elevenLabsTTS from '../services/elevenLabsTTS';

// Speak text
await elevenLabsTTS.speak("Hello, this is Dixie speaking!", {
  onStart: () => console.log('Started speaking'),
  onDone: () => console.log('Finished speaking'),
  onError: (error) => console.error('TTS error:', error)
});

// Stop speaking
elevenLabsTTS.stop();
```

## 🚀 **Benefits**
- **Much better voice quality** - sounds human, not robotic
- **Natural intonation** - understands context and emphasis
- **Multiple voice options** - choose the perfect voice for Dixie
- **Professional sound** - perfect for demos and production

## ⚠️ **Important Notes**
- **API Limits**: Free tier has 10,000 characters/month
- **Network Required**: Needs internet connection for API calls
- **Latency**: Slight delay for API calls (usually 1-2 seconds)
- **Cost**: Free tier should be sufficient for testing/demos

## 🎬 **Perfect for Demo Videos**
ElevenLabs will make Dixie sound much more professional and natural in your demo videos! 