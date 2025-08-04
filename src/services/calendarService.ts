import { API_CONFIG } from '../config/api';

// Helper function to create a fetch with timeout
const fetchWithTimeout = async (url: string, options: RequestInit, timeout: number = API_CONFIG.TIMEOUT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export interface CalendarEvent {
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  location?: string;
}

export interface MeetingSuggestion {
  shouldSchedule: boolean;
  suggestedTime?: string;
  duration?: number; // in minutes
  attendees?: string[];
  summary?: string;
  reason?: string;
}

class CalendarService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private async getBaseURL(): Promise<string> {
    const { getBackendURL } = await import('../config/api');
    return await getBackendURL();
  }

  // Analyze email content to determine if a meeting should be scheduled
  async analyzeForMeetingSuggestion(emailContent: string, senderEmail: string): Promise<MeetingSuggestion> {
    try {
      const baseURL = await this.getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/ai/analyze-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          emailContent,
          senderEmail,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error analyzing for meeting suggestion:', error);
      return { shouldSchedule: false };
    }
  }

  // Create a calendar event and send invites
  async createMeetingEvent(event: CalendarEvent): Promise<boolean> {
    try {
      const baseURL = await this.getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/calendar/create-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Calendar event created:', data);
      return true;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return false;
    }
  }

  // Get user's calendar availability for the next few days
  async getAvailability(days: number = 7): Promise<any[]> {
    try {
      const baseURL = await this.getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/calendar/availability?days=${days}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting calendar availability:', error);
      return [];
    }
  }

  // Suggest meeting times based on availability
  async suggestMeetingTimes(attendees: string[], duration: number = 30): Promise<string[]> {
    try {
      const baseURL = await this.getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/calendar/suggest-times`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          attendees,
          duration,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.suggestedTimes;
    } catch (error) {
      console.error('Error suggesting meeting times:', error);
      return [];
    }
  }
}

export const calendarService = new CalendarService();
export default calendarService; 