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
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import RenderHtml from 'react-native-render-html';
import { AuthContext } from '../context/AuthContext';
import { emailService, DetailedEmailThread, EmailMessage } from '../services/emailService';
import { API_CONFIG } from '../config/api';

const EmailDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const authContext = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  
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
  const [showImagesMap, setShowImagesMap] = useState<{[key: string]: boolean}>({});
  const [processedContentMap, setProcessedContentMap] = useState<{[key: string]: string}>({});
  const [expandedMessages, setExpandedMessages] = useState<{[key: string]: boolean}>({});
  
  const isDarkMode = colorScheme === 'dark';

  useEffect(() => {
    fetchEmailThread();
  }, [threadId]);

  const fetchEmailThread = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const threadData = await emailService.getThread(token, threadId);
      setEmailThread(threadData);
      // Auto-expand the last message
      if (threadData && threadData.messages.length > 0) {
        const lastMessageId = threadData.messages[threadData.messages.length - 1].id;
        setExpandedMessages(prev => ({ ...prev, [lastMessageId]: true }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch email thread');
    } finally {
      setIsLoading(false);
    }
  };

  const processEmailContent = async (messageId: string, rawBody: string, shouldLoadImages: boolean) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/email/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: rawBody,
          shouldLoadImages,
          theme: isDarkMode ? 'dark' : 'light',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process email content');
      }

      const result = await response.json();
      return result.processedHtml;
    } catch (error) {
      console.error('Error processing email content:', error);
      return rawBody; // Fallback to raw content
    }
  };

  const toggleImages = async (messageId: string, rawBody: string) => {
    const currentShowImages = showImagesMap[messageId] || false;
    const newShowImages = !currentShowImages;
    
    setShowImagesMap(prev => ({
      ...prev,
      [messageId]: newShowImages
    }));

    // Process content with new image setting
    const processedContent = await processEmailContent(messageId, rawBody, newShowImages);
    setProcessedContentMap(prev => ({
      ...prev,
      [messageId]: processedContent
    }));
  };

  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
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
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const stripHtmlTags = (html: string) => {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  };

  const isHtmlContent = (content: string) => {
    return content.includes('<') && content.includes('>');
  };

  const getInitials = (name: string) => {
    const names = name.trim().split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const renderMessageHeader = (message: EmailMessage, index: number, isExpanded: boolean) => {
    const isLastMessage = index === (emailThread?.messages.length || 0) - 1;
    
    return (
      <View style={[styles.messageHeader, isDarkMode && styles.messageHeaderDark]}>
        <TouchableOpacity 
          style={styles.messageHeaderContent}
          onPress={() => toggleMessageExpansion(message.id)}
          activeOpacity={0.7}
        >
          <View style={styles.messageHeaderLeft}>
            <View style={[styles.avatar, isDarkMode && styles.avatarDark]}>
              <Text style={[styles.avatarText, isDarkMode && styles.avatarTextDark]}>
                {getInitials(message.from)}
              </Text>
            </View>
            <View style={styles.messageHeaderInfo}>
              <View style={styles.messageHeaderTopRow}>
                <Text style={[styles.fromText, isDarkMode && styles.fromTextDark]} numberOfLines={1}>
                  {message.from}
                </Text>
                <Text style={[styles.dateText, isDarkMode && styles.dateTextDark]}>
                  {formatDate(message.date)}
                </Text>
              </View>
              {!isExpanded && (
                <Text style={[styles.snippetText, isDarkMode && styles.snippetTextDark]} numberOfLines={1}>
                  {stripHtmlTags(message.snippet || message.body || '')}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.messageHeaderRight}>
            {!isExpanded && (
              <Ionicons 
                name="chevron-down" 
                size={16} 
                color={isDarkMode ? '#9aa0a6' : '#5f6368'} 
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMessageControls = (message: EmailMessage) => {
    const showPlainText = showPlainTextMap[message.id] || false;
    const showImages = showImagesMap[message.id] || false;
    const content = processedContentMap[message.id] || message.body || message.snippet;
    const rawBody = message.rawBody || message.body;
    
    const togglePlainText = () => {
      setShowPlainTextMap(prev => ({
        ...prev,
        [message.id]: !prev[message.id]
      }));
    };
    
    return (
      <View style={styles.messageControls}>
        {isHtmlContent(content) && (
          <TouchableOpacity 
            style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}
            onPress={togglePlainText}
          >
            <Ionicons 
              name={showPlainText ? 'code' : 'document-text'} 
              size={14} 
              color={isDarkMode ? '#8ab4f8' : '#1a73e8'} 
            />
            <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextDark]}>
              {showPlainText ? 'Show HTML' : 'Show plain text'}
            </Text>
          </TouchableOpacity>
        )}
        
        {message.hasBlockedImages && (
          <TouchableOpacity 
            style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}
            onPress={() => toggleImages(message.id, rawBody)}
          >
            <Ionicons 
              name={showImages ? 'eye-off' : 'eye'} 
              size={14} 
              color={isDarkMode ? '#8ab4f8' : '#1a73e8'} 
            />
            <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextDark]}>
              {showImages ? 'Hide images' : 'Show images'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMessage = (message: EmailMessage, index: number) => {
    const isExpanded = expandedMessages[message.id] || false;
    const showPlainText = showPlainTextMap[message.id] || false;
    const processedContent = processedContentMap[message.id];
    
    // Use processed content if available, otherwise fall back to the backend-processed body
    const content = processedContent || message.body || message.snippet;
    
    return (
      <View key={message.id} style={[styles.messageContainer, isDarkMode && styles.messageContainerDark]}>
        {renderMessageHeader(message, index, isExpanded)}
        
        {isExpanded && (
          <View style={styles.messageContent}>
            <View style={styles.messageSubject}>
              <Text style={[styles.subjectText, isDarkMode && styles.subjectTextDark]}>
                {message.subject}
              </Text>
            </View>
            
            {renderMessageControls(message)}
            
            <View style={styles.messageBody}>
              {isHtmlContent(content) && !showPlainText ? (
                <View style={{ minHeight: 100 }}>
                  <RenderHtml
                  contentWidth={width - 32}
                  source={{ html: content }}
                  ignoredDomTags={['script', 'meta', 'head', 'title', 'html', 'body']}
                  onHTMLLoaded={(error: any) => {
                    console.log('HTML loaded');
                  }}
                  renderersProps={{
                    img: {
                      enableExperimentalPercentWidth: true,
                    },
                  }}
                  defaultViewProps={{
                    style: {
                      backgroundColor: 'transparent',
                    },
                  }}
                  baseStyle={{
                    fontSize: 14,
                    lineHeight: 20,
                    color: isDarkMode ? '#e8eaed' : '#3c4043',
                    fontFamily: 'System',
                    backgroundColor: 'transparent',
                  }}
                  tagsStyles={{
                    // Gmail-style body
                    body: {
                      margin: 0,
                      padding: 0,
                      backgroundColor: 'transparent',
                    },
                    // Gmail-style paragraphs
                    p: {
                      marginTop: 0,
                      marginBottom: 16,
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    // Gmail-style divs - remove default borders
                    div: {
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                      marginBottom: 8,
                      borderWidth: 0,
                      borderColor: 'transparent',
                      backgroundColor: 'transparent',
                    },
                    // Gmail-style images
                    img: {
                      maxWidth: '100%',
                      height: 'auto',
                      marginTop: 8,
                      marginBottom: 8,
                      borderRadius: 4,
                    },
                    // Gmail-style spans
                    span: {
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    // Gmail-style links
                    a: {
                      color: isDarkMode ? '#8ab4f8' : '#1a73e8',
                      textDecorationLine: 'none',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    // Gmail-style headers
                    h1: {
                      fontSize: 24,
                      fontWeight: '400',
                      lineHeight: 32,
                      marginTop: 0,
                      marginBottom: 16,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    h2: {
                      fontSize: 20,
                      fontWeight: '400',
                      lineHeight: 28,
                      marginTop: 0,
                      marginBottom: 14,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    h3: {
                      fontSize: 16,
                      fontWeight: '500',
                      lineHeight: 24,
                      marginTop: 0,
                      marginBottom: 12,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    h4: {
                      fontSize: 14,
                      fontWeight: '500',
                      lineHeight: 20,
                      marginTop: 0,
                      marginBottom: 10,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    // Gmail-style emphasis
                    strong: {
                      fontWeight: '500',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    b: {
                      fontWeight: '500',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    em: {
                      fontStyle: 'italic',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    i: {
                      fontStyle: 'italic',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    // Gmail-style lists
                    ul: {
                      marginTop: 0,
                      marginBottom: 16,
                      paddingLeft: 24,
                    },
                    ol: {
                      marginTop: 0,
                      marginBottom: 16,
                      paddingLeft: 24,
                    },
                    li: {
                      marginBottom: 4,
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                      fontFamily: 'System',
                    },
                    // Gmail-style blockquotes
                    blockquote: {
                      borderLeftWidth: 4,
                      borderLeftColor: isDarkMode ? '#5f6368' : '#dadce0',
                      marginTop: 16,
                      marginBottom: 16,
                      paddingLeft: 16,
                      color: isDarkMode ? '#9aa0a6' : '#5f6368',
                      fontStyle: 'italic',
                      fontSize: 14,
                      lineHeight: 20,
                    },
                    // Gmail-style tables
                    table: {
                      width: '100%',
                      marginTop: 16,
                      marginBottom: 16,
                      fontSize: 14,
                    },
                    td: {
                      padding: 8,
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                    },
                    th: {
                      padding: 8,
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
                      fontWeight: '500',
                      fontSize: 14,
                      lineHeight: 20,
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                    },
                    // Gmail-style code
                    pre: {
                      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      borderRadius: 8,
                      padding: 16,
                      marginTop: 16,
                      marginBottom: 16,
                      fontSize: 13,
                      lineHeight: 18,
                      fontFamily: 'System',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                    },
                    code: {
                      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      borderRadius: 4,
                      padding: 2,
                      fontSize: 13,
                      fontFamily: 'System',
                      color: isDarkMode ? '#e8eaed' : '#3c4043',
                    },
                    // Gmail-style horizontal rules
                    hr: {
                      borderWidth: 0,
                      borderTopWidth: 1,
                      borderTopColor: isDarkMode ? '#5f6368' : '#dadce0',
                      marginTop: 24,
                      marginBottom: 24,
                    },
                    // Gmail-style details/summary (for quoted text)
                    details: {
                      marginTop: 16,
                      marginBottom: 16,
                      borderWidth: 1,
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      borderRadius: 8,
                    },
                    summary: {
                      padding: 12,
                      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
                      fontSize: 13,
                      fontWeight: '500',
                      color: isDarkMode ? '#9aa0a6' : '#5f6368',
                      borderBottomWidth: 1,
                      borderBottomColor: isDarkMode ? '#5f6368' : '#dadce0',
                    },
                    // Blocked image placeholders
                    '.blocked-image': {
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
                      borderRadius: 8,
                      padding: 16,
                      marginTop: 8,
                      marginBottom: 8,
                      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
                      alignItems: 'center',
                    },
                  }}
                  systemFonts={['System']}
                />
                </View>
              ) : (
                <Text style={[styles.bodyText, isDarkMode && styles.bodyTextDark]}>
                  {showPlainText ? (message.plainTextContent || stripHtmlTags(content)) : content}
                </Text>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderReplyBox = () => {
    if (!showReplyBox) return null;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.replyContainer, isDarkMode && styles.replyContainerDark]}
      >
        <Text style={[styles.replyLabel, isDarkMode && styles.replyLabelDark]}>Reply</Text>
        <TextInput
          style={[styles.replyInput, isDarkMode && styles.replyInputDark]}
          value={replyText}
          onChangeText={setReplyText}
          placeholder="Type your reply..."
          placeholderTextColor={isDarkMode ? '#9aa0a6' : '#5f6368'}
          multiline
          numberOfLines={4}
        />
        <View style={styles.replyButtons}>
          <TouchableOpacity
            style={[styles.cancelButton, isDarkMode && styles.cancelButtonDark]}
            onPress={() => {
              setShowReplyBox(false);
              setReplyText('');
            }}
          >
            <Text style={[styles.cancelButtonText, isDarkMode && styles.cancelButtonTextDark]}>Cancel</Text>
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
      <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]}>
        <View style={[styles.header, isDarkMode && styles.headerDark]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDarkMode && styles.headerTitleDark]}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]}>
        <View style={[styles.header, isDarkMode && styles.headerDark]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDarkMode && styles.headerTitleDark]}>Error</Text>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color="#ea4335" />
          <Text style={[styles.errorText, isDarkMode && styles.errorTextDark]}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchEmailThread}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDarkMode && styles.containerDark]}>
      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDarkMode && styles.headerTitleDark]} numberOfLines={1}>
          {thread.subject}
        </Text>
        <TouchableOpacity
          onPress={() => setShowReplyBox(true)}
          style={styles.replyHeaderButton}
        >
          <Ionicons name="arrow-undo" size={24} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={[styles.content, isDarkMode && styles.contentDark]}>
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
  containerDark: {
    backgroundColor: '#171717',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerDark: {
    backgroundColor: '#202124',
    borderBottomColor: '#5F6368',
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
  headerTitleDark: {
    color: '#E8EAED',
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
    color: '#ea4335',
    textAlign: 'center',
    marginTop: 16,
  },
  errorTextDark: {
    color: '#ea4335',
  },
  retryButton: {
    backgroundColor: '#1a73e8',
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
    backgroundColor: '#F8F9FA',
  },
  contentDark: {
    backgroundColor: '#171717',
  },
  messageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageContainerDark: {
    backgroundColor: '#202124',
    shadowColor: '#000',
  },
  messageHeader: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  messageHeaderDark: {
    backgroundColor: '#202124',
  },
  messageHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  messageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarDark: {
    backgroundColor: '#8ab4f8',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  avatarTextDark: {
    color: '#202124',
  },
  messageHeaderInfo: {
    flex: 1,
  },
  messageHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  fromText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3c4043',
    flex: 1,
    marginRight: 8,
  },
  fromTextDark: {
    color: '#e8eaed',
  },
  dateText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '400',
  },
  dateTextDark: {
    color: '#9aa0a6',
  },
  snippetText: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
  },
  snippetTextDark: {
    color: '#9aa0a6',
  },
  messageHeaderRight: {
    padding: 4,
  },
  messageContent: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  messageSubject: {
    marginBottom: 16,
  },
  subjectText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#3c4043',
    lineHeight: 22,
  },
  subjectTextDark: {
    color: '#e8eaed',
  },
  messageControls: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  controlButtonDark: {
    backgroundColor: '#303134',
    borderColor: '#5f6368',
  },
  controlButtonText: {
    fontSize: 13,
    color: '#1a73e8',
    fontWeight: '500',
    marginLeft: 6,
  },
  controlButtonTextDark: {
    color: '#8ab4f8',
  },
  messageBody: {
    minHeight: 50,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#3c4043',
  },
  bodyTextDark: {
    color: '#e8eaed',
  },
  replyContainer: {
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
    padding: 16,
  },
  replyContainerDark: {
    backgroundColor: '#202124',
    borderTopColor: '#5f6368',
  },
  replyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3c4043',
    marginBottom: 12,
  },
  replyLabelDark: {
    color: '#e8eaed',
  },
  replyInput: {
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    padding: 16,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: 12,
    color: '#3c4043',
  },
  replyInputDark: {
    backgroundColor: '#303134',
    borderColor: '#5f6368',
    color: '#e8eaed',
  },
  replyButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  cancelButtonDark: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '500',
  },
  cancelButtonTextDark: {
    color: '#8ab4f8',
  },
  sendButton: {
    backgroundColor: '#1a73e8',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  disabledButton: {
    backgroundColor: '#9aa0a6',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default EmailDetailScreen; 