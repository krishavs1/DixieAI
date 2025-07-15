import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import RenderHtml from 'react-native-render-html';
import { AuthContext } from '../context/AuthContext';
import { emailService, DetailedEmailThread, EmailMessage } from '../services/emailService';

const EmailDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const authContext = useContext(AuthContext);
  const { width } = useWindowDimensions();
  
  if (!authContext) {
    throw new Error('EmailDetailScreen must be used within AuthProvider');
  }
  
  const { token } = authContext;
  const { threadId, thread } = route.params as any;
  
  const [emailThread, setEmailThread] = useState<DetailedEmailThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showPlainTextMap, setShowPlainTextMap] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    fetchEmailThread();
  }, [threadId]);

  const fetchEmailThread = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const threadData = await emailService.getThread(token, threadId);
      setEmailThread(threadData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch email thread');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) {
      Alert.alert('Error', 'Please enter a reply message');
      return;
    }

    setIsSending(true);
    try {
      const latestMessage = emailThread?.messages[emailThread.messages.length - 1];
      await emailService.sendEmail(token, {
        to: latestMessage?.from || '',
        subject: `Re: ${latestMessage?.subject || ''}`,
        body: replyText,
        threadId: threadId,
      });
      
      Alert.alert('Success', 'Reply sent successfully!');
      setReplyText('');
      setShowReplyBox(false);
      // Refresh the thread to show the new message
      fetchEmailThread();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send reply');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const stripHtmlTags = (html: string) => {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  };

  const isHtmlContent = (content: string) => {
    return content.includes('<') && content.includes('>');
  };

  const renderMessage = (message: EmailMessage, index: number) => {
    const content = message.body || message.snippet;
    const showPlainText = showPlainTextMap[message.id] || false;
    
    const togglePlainText = () => {
      setShowPlainTextMap(prev => ({
        ...prev,
        [message.id]: !prev[message.id]
      }));
    };
    
    // Clean up HTML content for better rendering
    const cleanHtmlContent = (htmlContent: string) => {
      return htmlContent
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<meta[^>]*>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    return (
      <View key={message.id} style={styles.messageContainer}>
        <View style={styles.messageHeader}>
          <Text style={styles.fromText}>{message.from}</Text>
          <Text style={styles.dateText}>{formatDate(message.date)}</Text>
        </View>
        <Text style={styles.subjectText}>{message.subject}</Text>
        
        {/* Toggle button for HTML vs Plain Text */}
        {isHtmlContent(content) && (
          <TouchableOpacity 
            style={styles.toggleButton}
            onPress={togglePlainText}
          >
            <Text style={styles.toggleButtonText}>
              {showPlainText ? 'Show Formatted' : 'Show Plain Text'}
            </Text>
          </TouchableOpacity>
        )}
        
        <ScrollView style={styles.messageBody}>
          {isHtmlContent(content) && !showPlainText ? (
            <View style={styles.htmlContainer}>
              <RenderHtml
                contentWidth={width - 48}
                source={{ html: cleanHtmlContent(content) }}
                ignoredDomTags={['center', 'font', 'style', 'script', 'meta', 'head', 'title', 'html', 'body']}
                tagsStyles={{
                  div: { marginVertical: 4 },
                  p: { marginVertical: 6, fontSize: 15, lineHeight: 22, color: '#1F2937' },
                  a: { color: '#4285F4', textDecorationLine: 'underline' },
                  span: { color: '#1F2937', fontSize: 15 },
                  strong: { fontWeight: 'bold', color: '#1F2937' },
                  b: { fontWeight: 'bold', color: '#1F2937' },
                  em: { fontStyle: 'italic', color: '#1F2937' },
                  i: { fontStyle: 'italic', color: '#1F2937' },
                  h1: { fontSize: 20, fontWeight: 'bold', marginVertical: 8, color: '#1F2937' },
                  h2: { fontSize: 18, fontWeight: 'bold', marginVertical: 6, color: '#1F2937' },
                  h3: { fontSize: 16, fontWeight: 'bold', marginVertical: 4, color: '#1F2937' },
                  table: { borderWidth: 1, borderColor: '#E5E7EB', marginVertical: 8 },
                  td: { padding: 8, borderWidth: 1, borderColor: '#E5E7EB' },
                  th: { padding: 8, fontWeight: 'bold', borderWidth: 1, borderColor: '#E5E7EB' },
                }}
                baseStyle={{ color: '#1F2937', fontSize: 15, lineHeight: 22 }}
                systemFonts={['System']}
                defaultTextProps={{
                  style: { color: '#1F2937', fontSize: 15, lineHeight: 22 }
                }}
                renderersProps={{
                  div: {
                    enableExperimentalRtl: false,
                  },
                }}
              />
            </View>
          ) : (
            <Text style={styles.bodyText}>
              {isHtmlContent(content) ? stripHtmlTags(content) : content}
            </Text>
          )}
        </ScrollView>
        {index < (emailThread?.messages.length || 0) - 1 && (
          <View style={styles.messageSeparator} />
        )}
      </View>
    );
  };

  const renderReplyBox = () => {
    if (!showReplyBox) return null;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.replyContainer}
      >
        <Text style={styles.replyLabel}>Reply:</Text>
        <TextInput
          style={styles.replyInput}
          value={replyText}
          onChangeText={setReplyText}
          placeholder="Type your reply..."
          multiline
          numberOfLines={4}
        />
        <View style={styles.replyButtons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setShowReplyBox(false);
              setReplyText('');
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, isSending && styles.disabledButton]}
            onPress={handleReply}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Error</Text>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#ff4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchEmailThread}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {thread.subject}
        </Text>
        <TouchableOpacity
          onPress={() => setShowReplyBox(true)}
          style={styles.replyHeaderButton}
        >
          <Ionicons name="arrow-undo" size={24} color="#4285F4" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {emailThread?.messages.map((message, index) => renderMessage(message, index))}
      </ScrollView>

      {renderReplyBox()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  replyHeaderButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageContainer: {
    marginVertical: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fromText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  subjectText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 12,
  },
  toggleButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  messageBody: {
    maxHeight: 300,
  },
  htmlContainer: {
    flex: 1,
    minHeight: 50,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1F2937',
  },
  messageSeparator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  replyContainer: {
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
  },
  replyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  replyInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: 12,
  },
  replyButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default EmailDetailScreen; 