import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from './api';
import { showMessage } from 'react-native-flash-message';

export interface EmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
  isUnread?: boolean;
  timestamp?: string;
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
}

export interface EmailThreadDetail {
  id: string;
  messages: EmailMessage[];
}

// Custom hook to fetch email threads
export const useEmailThreads = (query?: string) => {
  return useQuery({
    queryKey: ['emailThreads', query],
    queryFn: async () => {
      const response = await apiService.getThreads(query);
      return response.threads.map((thread: any) => ({
        ...thread,
        isUnread: Math.random() > 0.5, // Mock unread status for now
        timestamp: formatDate(thread.date),
      }));
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Custom hook to fetch a specific email thread
export const useEmailThread = (threadId: string) => {
  return useQuery({
    queryKey: ['emailThread', threadId],
    queryFn: async () => {
      const response = await apiService.getThread(threadId);
      return response.thread;
    },
    enabled: !!threadId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Custom hook to send email
export const useSendEmail = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: {
      to: string;
      subject: string;
      body: string;
      threadId?: string;
    }) => {
      return await apiService.sendEmail(data);
    },
    onSuccess: (data, variables) => {
      showMessage({
        message: 'Email sent successfully!',
        type: 'success',
      });
      
      // Invalidate and refetch email threads
      queryClient.invalidateQueries({ queryKey: ['emailThreads'] });
      
      // If it's a reply, also invalidate the specific thread
      if (variables.threadId) {
        queryClient.invalidateQueries({ queryKey: ['emailThread', variables.threadId] });
      }
    },
    onError: (error) => {
      console.error('Send email error:', error);
      showMessage({
        message: 'Failed to send email. Please try again.',
        type: 'danger',
      });
    },
  });
};

// Utility function to format dates
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInMinutes < 1440) {
    return `${Math.floor(diffInMinutes / 60)}h ago`;
  } else {
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }
};

// Search emails function
export const useSearchEmails = (query: string) => {
  return useQuery({
    queryKey: ['searchEmails', query],
    queryFn: async () => {
      const response = await apiService.getThreads(query);
      return response.threads.map((thread: any) => ({
        ...thread,
        isUnread: Math.random() > 0.5,
        timestamp: formatDate(thread.date),
      }));
    },
    enabled: !!query && query.length > 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}; 