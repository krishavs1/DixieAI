import React, { useState, useEffect, useRef, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';

interface Message {
  id: string;
  text: string;
  timestamp: Date;
  isUser: boolean;
  user: {
    id: string;
    name: string;
    avatar?: string;
  };
}

const ChatScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const authContext = useContext(AuthContext);
  
  if (!authContext) {
    throw new Error('ChatScreen must be used within AuthProvider');
  }
  
  const { user } = authContext;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Get thread data from route params
  const { threadId, thread } = route.params as any;

  useEffect(() => {
    // Initialize chat with thread summary
    const initialMessage: Message = {
      id: '1',
      text: `Hi! I'm Dixie, your AI email assistant. I can help you with this email thread about "${thread.subject}". What would you like to know or do?`,
      timestamp: new Date(),
      isUser: false,
      user: {
        id: 'dixie',
        name: 'Dixie AI',
        avatar: '🤖',
      },
    };
    setMessages([initialMessage]);
  }, [thread]);

  const sendMessage = () => {
    if (inputText.trim() === '') return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      timestamp: new Date(),
      isUser: true,
      user: {
        id: user?.id || 'user',
        name: user?.name || 'User',
        avatar: user?.picture,
      },
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    
    // Simulate AI response
    setIsTyping(true);
    setTimeout(() => {
      const userText = userMessage.text.toLowerCase();
      let response = '';
      
      if (userText.includes('summarize')) {
        response = `Here's a summary of the email thread "${thread.subject}": ${thread.snippet} The conversation involves ${thread.from} and appears to be about scheduling and coordination.`;
      } else if (userText.includes('reply')) {
        response = `I can help you draft a reply to ${thread.from}. What would you like to say in response to "${thread.subject}"?`;
      } else {
        response = `I understand you're asking about "${userMessage.text}". Based on the email thread, I can help you with summarizing, replying, or answering specific questions about the content.`;
      }
      
      const aiMessage: Message = {
        id: Date.now().toString(),
        text: response,
        timestamp: new Date(),
        isUser: false,
        user: {
          id: 'dixie',
          name: 'Dixie AI',
          avatar: '🤖',
        },
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleVoiceInput = () => {
    Alert.alert('Voice Input', 'Voice input feature coming soon!');
  };

  const handleQuickAction = (action: string) => {
    setInputText(action);
  };

  const renderMessage = (message: Message) => {
    const isUser = message.isUser;
    
    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.aiMessage,
        ]}
      >
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
            {message.text}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {thread.subject}
          </Text>
          <Text style={styles.headerSubtitle}>
            Chat with Dixie AI
          </Text>
        </View>
        <TouchableOpacity onPress={handleVoiceInput} style={styles.voiceButton}>
          <Ionicons name="mic" size={24} color="#4285F4" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map(renderMessage)}
          {isTyping && (
            <View style={[styles.messageContainer, styles.aiMessage]}>
              <View style={[styles.messageBubble, styles.aiBubble]}>
                <Text style={[styles.messageText, styles.aiText]}>
                  Dixie is typing...
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask Dixie about this email..."
            placeholderTextColor="#9CA3AF"
            multiline
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity 
            onPress={sendMessage}
            style={[styles.sendButton, inputText.trim() ? styles.sendButtonActive : {}]}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color={inputText.trim() ? "#4285F4" : "#9CA3AF"} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => handleQuickAction('Please summarize this email thread')}
        >
          <Ionicons name="document-text" size={16} color="#4285F4" />
          <Text style={styles.quickActionText}>Summarize</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => handleQuickAction('Help me draft a reply to this email')}
        >
          <Ionicons name="arrow-undo" size={16} color="#10B981" />
          <Text style={styles.quickActionText}>Reply</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.quickAction}
          onPress={() => handleQuickAction('Help me schedule a meeting based on this email')}
        >
          <Ionicons name="calendar" size={16} color="#F59E0B" />
          <Text style={styles.quickActionText}>Schedule</Text>
        </TouchableOpacity>
      </View>
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
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  voiceButton: {
    padding: 8,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 16,
  },
  messageContainer: {
    marginBottom: 12,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  aiMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#4285F4',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#1F2937',
  },
  messageTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    padding: 12,
    borderRadius: 20,
  },
  sendButtonActive: {
    backgroundColor: '#EBF4FF',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: '#374151',
    marginLeft: 4,
  },
});

export default ChatScreen; 