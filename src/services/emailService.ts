import { API_CONFIG } from '../config/api';

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  body: string;
  date: string;
  read: boolean;
  labels?: string[]; // Array of label IDs
  starred?: boolean;
  important?: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
  read?: boolean;
  labels?: string[]; // Array of label IDs
  starred?: boolean;
  important?: boolean;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  rawBody?: string;
  plainTextContent?: string;
  hasBlockedImages?: boolean;
  snippet: string;
  labels?: string[]; // Array of label IDs
}

export interface DetailedEmailThread {
  id: string;
  messages: EmailMessage[];
  labels?: string[]; // Array of label IDs
}

export type EmailCategory = 'primary' | 'social' | 'promotions' | 'updates';

export interface EmailCategoryInfo {
  id: EmailCategory;
  name: string;
  color: string;
  icon: string;
  count: number;
}

export interface EmailFilter {
  labels?: string[];
  read?: boolean;
  starred?: boolean;
  important?: boolean;
  searchQuery?: string;
}

// Predefined system labels
export const SYSTEM_LABELS: EmailLabel[] = [
  { id: 'inbox', name: 'Inbox', color: '#4285F4' },
  { id: 'sent', name: 'Sent', color: '#34A853' },
  { id: 'drafts', name: 'Drafts', color: '#FBBC04' },
  { id: 'spam', name: 'Spam', color: '#EA4335' },
  { id: 'trash', name: 'Trash', color: '#9AA0A6' },
  { id: 'important', name: 'Important', color: '#FF6D01' },
  { id: 'starred', name: 'Starred', color: '#F9AB00' },
];

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
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
};

// Helper function to retry failed requests
const retryFetch = async (
  fetchFn: () => Promise<Response>,
  maxRetries: number = 2,
  delay: number = 1000
): Promise<Response> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
  
  throw lastError!;
};

// Helper function to get the base URL dynamically
const getBaseURL = async (): Promise<string> => {
  if (typeof API_CONFIG.BASE_URL === 'string') {
    return API_CONFIG.BASE_URL;
  }
  return await API_CONFIG.BASE_URL;
};

export const emailService = {
  async fetchThreads(token: string): Promise<EmailThread[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.threads || [];
    } catch (error) {
      console.error('Error fetching threads:', error);
      throw error;
    }
  },

  async searchThreads(token: string, query: string): Promise<EmailThread[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.threads || [];
    } catch (error) {
      console.error('Error searching threads:', error);
      throw error;
    }
  },

  async getThread(token: string, threadId: string): Promise<DetailedEmailThread | null> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        }, API_CONFIG.TIMEOUT * 2) // Give more time for detailed thread fetching
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.thread || null;
    } catch (error) {
      console.error('Error fetching thread:', error);
      throw error;
    }
  },

  async sendEmail(token: string, emailData: {
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await retryFetch(() =>
        fetchWithTimeout(`${baseURL}/api/email/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
        }, API_CONFIG.TIMEOUT)
      );

      if (!response.ok) {
        if (response.status === 401) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Authentication failed. Please log in again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  },

  // Email categorization function
  categorizeEmail(thread: EmailThread): EmailCategory {
    const from = thread.from.toLowerCase();
    const subject = thread.subject.toLowerCase();
    const snippet = thread.snippet.toLowerCase();
    
    // Social media and networking
    const socialKeywords = [
      'facebook', 'twitter', 'instagram', 'linkedin', 'tiktok', 'snapchat', 'youtube',
      'discord', 'slack', 'whatsapp', 'telegram', 'reddit', 'pinterest', 'tumblr',
      'friend', 'connection', 'follow', 'like', 'share', 'comment', 'post'
    ];
    
    // Promotional emails - MUCH more comprehensive
    const promotionKeywords = [
      // Common promotional words
      'sale', 'discount', 'offer', 'deal', 'promotion', 'coupon', 'save', 'buy',
      'shop', 'store', 'retail', 'clearance', 'free shipping', 'buy now', 'shop now',
      'limited time', 'flash sale', 'exclusive', 'special offer', 'today only',
      
      // Retail brands and stores
      'amazon', 'ebay', 'etsy', 'walmart', 'target', 'best buy', 'home depot',
      'lowes', 'macy', 'nordstrom', 'gap', 'old navy', 'banana republic',
      'h&m', 'zara', 'uniqlo', 'forever 21', 'asos', 'shein', 'fashion nova',
      
      // Sports and fashion brands
      'nike', 'adidas', 'puma', 'reebok', 'under armour', 'converse', 'vans',
      'pacsun', 'urban outfitters', 'american eagle', 'aeropostale', 'hollister',
      
      // Department stores and malls
      'kohl', 'jcpenney', 'sears', 'belk', 'dillards', 'neiman marcus',
      'saks', 'bloomingdale', 'barneys', 'bergdorf', 'lord & taylor',
      
      // Food and restaurants
      'mcdonalds', 'burger king', 'wendys', 'subway', 'dominos', 'pizza hut',
      'chipotle', 'panera', 'starbucks', 'dunkin', 'kfc', 'taco bell',
      
      // Entertainment and media
      'netflix', 'hulu', 'disney', 'hbo', 'paramount', 'peacock', 'apple tv',
      'spotify', 'pandora', 'youtube music', 'tidal', 'amazon music',
      
      // Technology and electronics
      'apple', 'samsung', 'google', 'microsoft', 'dell', 'hp', 'lenovo',
      'sony', 'lg', 'panasonic', 'sharp', 'philips', 'bose', 'jbl',
      
      // Automotive
      'ford', 'chevrolet', 'toyota', 'honda', 'nissan', 'bmw', 'mercedes',
      'audi', 'volkswagen', 'hyundai', 'kia', 'mazda', 'subaru',
      
      // Travel and hospitality
      'marriott', 'hilton', 'hyatt', 'ihg', 'choice', 'wyndham', 'airbnb',
      'expedia', 'booking', 'hotels', 'priceline', 'orbitz', 'kayak',
      
      // Financial services
      'chase', 'bank of america', 'wells fargo', 'citibank', 'capital one',
      'american express', 'discover', 'mastercard', 'visa', 'paypal',
      
      // Health and beauty
      'walgreens', 'cvs', 'rite aid', 'ulta', 'sephora', 'mac', 'loreal',
      'maybelline', 'revlon', 'covergirl', 'neutrogena', 'cerave',
      
      // Marketing and newsletter indicators
      'newsletter', 'marketing', 'advertisement', 'sponsored', 'promotional',
      'email campaign', 'special', 'announcement', 'news', 'updates',
      
      // Emojis and symbols commonly used in promotions
      '🔥', '⚡', '🎉', '🎊', '💥', '⭐', '🏆', '🎯', '💰', '💎',
      
      // Common promotional phrases
      'take off', 'almost gone', 'going fast', 'stock up', 'must-have',
      'favorite', 'trending', 'popular', 'bestseller', 'hot', 'new',
      'just dropped', 'exclusive', 'limited edition', 'while supplies last'
    ];
    
    // Updates and notifications
    const updateKeywords = [
      'update', 'notification', 'alert', 'reminder', 'confirm', 'verify',
      'password', 'security', 'login', 'account', 'billing', 'payment',
      'receipt', 'invoice', 'statement', 'report', 'status', 'tracking',
      'delivery', 'shipping', 'order', 'confirmation'
    ];
    
    // Check for social keywords
    const hasSocialKeywords = socialKeywords.some(keyword => 
      from.includes(keyword) || subject.includes(keyword) || snippet.includes(keyword)
    );
    
    // Check for promotion keywords - more aggressive matching
    const hasPromotionKeywords = promotionKeywords.some(keyword => 
      from.includes(keyword) || subject.includes(keyword) || snippet.includes(keyword)
    );
    
    // Check for update keywords
    const hasUpdateKeywords = updateKeywords.some(keyword => 
      from.includes(keyword) || subject.includes(keyword) || snippet.includes(keyword)
    );
    
    // Categorize based on priority - promotions first for better accuracy
    if (hasPromotionKeywords) return 'promotions';
    if (hasSocialKeywords) return 'social';
    if (hasUpdateKeywords) return 'updates';
    
    // Default to primary (personal emails)
    return 'primary';
  },

  // Sort threads by date (newest first)
  sortThreads(threads: EmailThread[]): EmailThread[] {
    return [...threads].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  // Filtering functions
  filterThreads(threads: EmailThread[], filter: EmailFilter): EmailThread[] {
    return threads.filter(thread => {
      // Filter by read status
      if (filter.read !== undefined && thread.read !== filter.read) {
        return false;
      }

      // Filter by starred
      if (filter.starred !== undefined && thread.starred !== filter.starred) {
        return false;
      }

      // Filter by important
      if (filter.important !== undefined && thread.important !== filter.important) {
        return false;
      }

      // Filter by labels
      if (filter.labels && filter.labels.length > 0) {
        if (!thread.labels || !filter.labels.some(label => thread.labels!.includes(label))) {
          return false;
        }
      }

      // Filter by search query
      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase();
        return (
          thread.subject.toLowerCase().includes(query) ||
          thread.from.toLowerCase().includes(query) ||
          thread.snippet.toLowerCase().includes(query)
        );
      }

      return true;
    });
  },

  // Label management functions
  async addLabelToThread(token: string, threadId: string, labelId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labelId }),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error adding label to thread:', error);
      throw error;
    }
  },

  async removeLabelFromThread(token: string, threadId: string, labelId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/labels/${labelId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error removing label from thread:', error);
      throw error;
    }
  },

  async createLabel(token: string, label: Omit<EmailLabel, 'id'>): Promise<EmailLabel> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(label),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating label:', error);
      throw error;
    }
  },

  async fetchLabels(token: string): Promise<EmailLabel[]> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/labels`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return [...SYSTEM_LABELS, ...data.labels];
    } catch (error) {
      console.error('Error fetching labels:', error);
      // Return system labels as fallback
      return SYSTEM_LABELS;
    }
  },

  async updateThreadStatus(token: string, threadId: string, updates: {
    read?: boolean;
    starred?: boolean;
    important?: boolean;
  }): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating thread status:', error);
      throw error;
    }
  },

  async markAsRead(token: string, threadId: string): Promise<void> {
    try {
      const baseURL = await getBaseURL();
      const response = await fetchWithTimeout(`${baseURL}/api/email/threads/${threadId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }, API_CONFIG.TIMEOUT);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error marking thread as read:', error);
      throw error;
    }
  },
}; 