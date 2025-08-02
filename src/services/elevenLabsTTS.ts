import { Audio } from 'expo-av';
import axios from 'axios';
import { Buffer } from 'buffer';

interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  baseUrl?: string;
}

class ElevenLabsTTS {
  private config: ElevenLabsConfig;
  private sound: Audio.Sound | null = null;
  private isPlaying = false;

  constructor(config: ElevenLabsConfig) {
    this.config = {
      baseUrl: 'https://api.elevenlabs.io/v1',
      ...config,
    };
  }

  async speak(text: string, options?: {
    onStart?: () => void;
    onDone?: () => void;
    onError?: (error: any) => void;
    rate?: number;
    pitch?: number;
  }): Promise<void> {
    try {
      // Stop any currently playing audio
      await this.stop();

      console.log('🎤 ElevenLabs TTS - Generating speech for:', text.substring(0, 50) + '...');

      // Call ElevenLabs API to generate speech
      const response = await axios.post(
        `${this.config.baseUrl}/text-to-speech/${this.config.voiceId}`,
        {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.3,        // Lower stability for faster, more dynamic speech
            similarity_boost: 0.75,
            style: 0.2,            // Higher style for more expressive, faster delivery
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.config.apiKey,
          },
          responseType: 'arraybuffer',
        }
      );

      // Convert array buffer to base64
      const base64Audio = Buffer.from(response.data, 'binary').toString('base64');
      const audioUri = `data:audio/mpeg;base64,${base64Audio}`;

      // Load and play the audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            if (status.isPlaying && !this.isPlaying) {
              this.isPlaying = true;
              options?.onStart?.();
            } else if (!status.isPlaying && this.isPlaying) {
              this.isPlaying = false;
              options?.onDone?.();
            }
          }
        }
      );

      this.sound = sound;
      this.isPlaying = true;
      options?.onStart?.();

      console.log('🎤 ElevenLabs TTS - Speech started successfully');

    } catch (error) {
      console.error('❌ ElevenLabs TTS Error:', error);
      options?.onError?.(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
      this.isPlaying = false;
      console.log('🛑 ElevenLabs TTS - Speech stopped');
    } catch (error) {
      console.error('❌ Error stopping ElevenLabs TTS:', error);
    }
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  async setVolume(volume: number): Promise<void> {
    if (this.sound) {
      await this.sound.setVolumeAsync(volume);
    }
  }
}

// Default configuration - you'll need to set your API key
const defaultConfig: ElevenLabsConfig = {
  apiKey: 'sk_397920ab6d693f7ec6a68471142ba7e383e3874109eb1f7b', // Your API key from .env
  voiceId: 'piTKgcLEGmPE4e6mEKli', // Bella voice - warm and friendly
};

export const elevenLabsTTS = new ElevenLabsTTS(defaultConfig);

// Helper function to initialize with custom config
export const createElevenLabsTTS = (config: ElevenLabsConfig) => {
  return new ElevenLabsTTS(config);
};

export default elevenLabsTTS; 