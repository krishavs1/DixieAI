import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import Voice from '@react-native-community/voice';
import Tts from 'react-native-tts';

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { emailService, EmailThread, EmailLabel, EmailCategory, EmailCategoryInfo, EmailFilter, SYSTEM_LABELS } from '../services/emailService';
import { showMessage } from 'react-native-flash-message';
import dayjs from 'dayjs';

const HomeScreen = () => {
  const navigation = useNavigation();
  const authContext = useContext(AuthContext);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [originalThreads, setOriginalThreads] = useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSlow, setIsLoadingSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentCategory, setCurrentCategory] = useState<EmailCategory>('primary');
  const [labels, setLabels] = useState<EmailLabel[]>(SYSTEM_LABELS);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [currentFilter, setCurrentFilter] = useState<EmailFilter>({});
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.8);
  const [selectedVoice, setSelectedVoice] = useState('en-GB'); // British English for more natural sound
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  // Add state for visual feedback
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);
  const [voiceInput, setVoiceInput] = useState('');
  const [showVoiceAgent, setShowVoiceAgent] = useState(false);
  const [listeningAnimation, setListeningAnimation] = useState(false);
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [silenceTimeout, setSilenceTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isVoiceAgentClosed, setIsVoiceAgentClosed] = useState(false);
  const [speechKillSwitch, setSpeechKillSwitch] = useState(false);
  const speechKillSwitchRef = useRef(false);
  const isListeningRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useState(new Animated.Value(-300))[0];
  // Add a ref to store the final recognized text
  const finalRecognizedTextRef = useRef<string>('');
  // State for read & reply functionality
  const [currentThread, setCurrentThread] = useState<any>(null);
  const [currentSender, setCurrentSender] = useState<string>('');
  // State for auto-reply confirmation flow
  const [pendingReply, setPendingReply] = useState<string>('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  


  if (!authContext) {
    throw new Error('HomeScreen must be used within AuthProvider');
  }

  const { user, token, logout } = authContext;

  // Cleanup speech when modal closes
  useEffect(() => {
    if (!showSummaryModal && isSpeaking) {
      stopSpeaking();
    }
  }, [showSummaryModal]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (isSpeaking) {
        stopSpeaking();
      }
    };
  }, []);

  // Initialize voices
  useEffect(() => {
    getAvailableVoices();
  }, []);

  // Welcome message for British voice
  useEffect(() => {
    setTimeout(() => {
      showMessage({
        message: '🇬🇧 British voice set as default - sophisticated and natural!',
        type: 'success',
        duration: 3000,
      });
    }, 1000);
  }, []);

  // Apply filters and categorization to threads
  const applyFiltersAndCategorization = (threadsToProcess: EmailThread[]) => {
    console.log('Applying filters and categorization to', threadsToProcess.length, 'threads');
    
    // Apply categorization
    const categorizedThreads = threadsToProcess.map(thread => {
      const category = emailService.categorizeEmail(thread);
      return {
        ...thread,
        category
      };
    });

    // Filter by current category
    const categoryFiltered = categorizedThreads.filter(thread => 
      thread.category === currentCategory
    );

    // Apply label filters
    const labelFiltered = selectedLabels.length > 0 
      ? categoryFiltered.filter(thread => 
          thread.labels && selectedLabels.some(labelId => thread.labels!.includes(labelId))
        )
      : categoryFiltered;

    // Apply search filter
    const searchFiltered = searchQuery.trim() 
      ? labelFiltered.filter(thread => 
          thread.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          thread.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
          thread.snippet.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : labelFiltered;

    // Sort by date (newest first)
    const sortedThreads = emailService.sortThreads(searchFiltered);
    
    console.log(`Filtered to ${sortedThreads.length} threads in category: ${currentCategory}`);
    setThreads(sortedThreads);
  };

  // Fetch threads on component mount and when token changes
  useEffect(() => {
    if (token) {
      fetchThreads();
    }
  }, [token]);

  // Re-apply filters and categorization when they change
  useEffect(() => {
    if (originalThreads.length > 0) {
      applyFiltersAndCategorization(originalThreads);
    }
  }, [originalThreads, currentCategory, selectedLabels, searchQuery]);

  const fetchThreads = async () => {
    if (!token) return;
    
    setIsLoading(true);
    setIsLoadingSlow(false);
    setError(null);
    
    // Show "slow loading" message after 5 seconds
    const slowLoadingTimer = setTimeout(() => {
      setIsLoadingSlow(true);
    }, 5000);
    
    try {
      const [fetchedThreads, fetchedLabels] = await Promise.all([
        emailService.fetchThreads(token),
        emailService.fetchLabels(token)
      ]);
      
      // Debug logging
      console.log('Fetched threads:', fetchedThreads.map(t => ({
        id: t.id,
        subject: t.subject,
        read: t.read,
        labels: t.labels
      })));
      
      setOriginalThreads(fetchedThreads);
      setLabels(fetchedLabels);
      
      // Apply current categorization and filtering
      applyFiltersAndCategorization(fetchedThreads);
    } catch (err: any) {
      let errorMessage = err.message || 'Failed to fetch emails';
      
      // Provide more user-friendly error messages
      if (errorMessage.includes('Request timed out') || errorMessage.includes('Network request timed out')) {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (errorMessage.includes('Network Error') || errorMessage.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (errorMessage.includes('Authentication failed') || errorMessage.includes('Please log in again')) {
        errorMessage = 'Your session has expired. Please log in again.';
      }
      
      setError(errorMessage);
      console.error('Error fetching threads:', err);
      
      // Check if it's an authentication error
      if (errorMessage.includes('session has expired')) {
        showMessage({
          message: 'Your session has expired. Please log in again.',
          type: 'warning',
        });
        // Automatically log out the user
        logout();
      } else if (errorMessage.includes('timed out') || errorMessage.includes('Network error')) {
        showMessage({
          message: 'Connection timeout. Please try again.',
          type: 'warning',
        });
      } else {
        showMessage({
          message: 'Failed to load emails',
          type: 'danger',
        });
      }
    } finally {
      clearTimeout(slowLoadingTimer);
      setIsLoading(false);
      setIsLoadingSlow(false);
    }
  };

  const handleThreadPress = async (thread: EmailThread) => {
    console.log(`Opening thread ${thread.id}: read=${thread.read}, subject="${thread.subject}"`);
    
    // Mark as read if it's currently unread
    if (thread.read === false && token) {
      try {
        await emailService.markAsRead(token, thread.id);
        console.log(`Successfully marked thread ${thread.id} as read`);
        
        // Update local state immediately for better UX
        setOriginalThreads(prev => {
          const updated = prev.map(t => 
            t.id === thread.id ? { ...t, read: true } : t
          );
          console.log(`Updated thread ${thread.id} in local state: read=${updated.find(t => t.id === thread.id)?.read}`);
          return updated;
        });
      } catch (error) {
        console.error('Error marking thread as read:', error);
        // Continue to navigate even if marking as read fails
      }
    }
    
    (navigation as any).navigate('EmailDetail', { threadId: thread.id, thread });
  };

  const handleThreadLongPress = (thread: EmailThread) => {
    setSelectedThread(thread);
    setShowLabelModal(true);
  };

  const handleDebugEmail = async (thread: EmailThread) => {
    if (!token) return;
    
    try {
      // Fetch the full email content
      const emailContent = await emailService.fetchEmailContent(token, thread.id);
      
      // Copy to clipboard
      await Clipboard.setStringAsync(emailContent);
      
      showMessage({
        message: '📋 Email HTML copied to clipboard!',
        type: 'success',
        duration: 2000,
      });
      
      console.log('Email HTML copied:', emailContent.substring(0, 200) + '...');
    } catch (error) {
      console.error('Error fetching email content:', error);
      showMessage({
        message: '❌ Failed to copy email HTML',
        type: 'danger',
      });
    }
  };

  const handleThreadLabelUpdate = async (threadId: string, labelId: string, add: boolean) => {
    if (!token) return;
    
    try {
      if (add) {
        await emailService.addLabelToThread(token, threadId, labelId);
      } else {
        await emailService.removeLabelFromThread(token, threadId, labelId);
      }
      
      // Update the thread in local state
      setOriginalThreads(prev => prev.map(thread => {
        if (thread.id === threadId) {
          const updatedLabels = add 
            ? [...(thread.labels || []), labelId]
            : (thread.labels || []).filter(id => id !== labelId);
          return { ...thread, labels: updatedLabels };
        }
        return thread;
      }));
      
      showMessage({
        message: add ? 'Label added' : 'Label removed',
        type: 'success',
      });
    } catch (error) {
      showMessage({
        message: 'Failed to update label',
        type: 'danger',
      });
    }
  };

  const handleRefresh = () => {
    fetchThreads();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategoryChange = (category: EmailCategory) => {
    setCurrentCategory(category);
  };

  const handleLabelToggle = (labelId: string) => {
    setSelectedLabels(prev => 
      prev.includes(labelId) 
        ? prev.filter(id => id !== labelId)
        : [...prev, labelId]
    );
  };

  const clearFilters = () => {
    setSelectedLabels([]);
    setSearchQuery('');
  };

  const toggleSidePanel = () => {
    if (showSidePanel) {
      // Close panel
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowSidePanel(false));
    } else {
      // Open panel
      setShowSidePanel(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const selectCategoryFromSidePanel = (category: EmailCategory) => {
    setCurrentCategory(category);
    toggleSidePanel();
  };

  // Get category information
  const getCategoryInfo = (): EmailCategoryInfo[] => {
    const categories: EmailCategory[] = ['primary', 'social', 'promotions', 'updates', 'sent'];
    return categories.map(category => {
      const count = originalThreads.filter(thread => 
        emailService.categorizeEmail(thread) === category
      ).length;
      
      const categoryData = {
        primary: { name: 'Primary', color: '#4285F4', icon: 'mail' },
        social: { name: 'Social', color: '#34A853', icon: 'people' },
        promotions: { name: 'Promotions', color: '#FBBC04', icon: 'pricetag' },
        updates: { name: 'Updates', color: '#EA4335', icon: 'notifications' },
        sent: { name: 'Sent', color: '#34A853', icon: 'send' }
      };
      
      return {
        id: category,
        name: categoryData[category].name,
        color: categoryData[category].color,
        icon: categoryData[category].icon,
        count
      };
    });
  };

  const handleVoiceCommand = () => {
    console.log('🎤 MIC BUTTON PRESSED - Opening voice agent...');
    console.log('Current showVoiceAgent state:', showVoiceAgent);
    
    // Show voice agent on HomeScreen
    try {
      setShowVoiceAgent(true);
      setAgentResponse('Voice agent ready! Tap the mic to start listening.');
      setIsVoiceAgentClosed(false); // Reset the closed flag
      setSpeechKillSwitch(false); // Reset the kill switch
      speechKillSwitchRef.current = false; // Reset kill switch ref
      console.log('✅ Voice agent state set to true');
    } catch (error) {
      console.log('❌ Error showing voice agent:', error);
    showMessage({
        message: 'Error opening voice agent. Please try again.',
        type: 'warning',
      });
    }
  };

  const processVoiceCommand = async (text: string) => {
    console.log('=== PROCESSING VOICE COMMAND ===');
    console.log('Text received:', text);
    console.log('Current voiceText state:', voiceText);
    console.log('Current state - isListening:', isListening, 'isProcessingCommand:', isProcessingCommand);
    
    // Prevent multiple simultaneous command processing
    if (isProcessingCommand) {
      console.log('Already processing a command, ignoring:', text);
      return;
    }
    
    console.log('Setting processing flag to true');
    setIsProcessingCommand(true);
    
    // Don't change the transcript - keep what was said visible
    setAgentResponse('Processing your request...');
    
    const lowerText = text.toLowerCase();
    console.log('Lowercase text:', lowerText);
    
    try {
      // 0. CONFIRMATION COMMAND - if we're awaiting confirmation
      if (awaitingConfirmation && (lowerText.includes('yes') || lowerText.includes('send') || lowerText.includes('okay') || lowerText.includes('ok'))) {
        console.log('✅ DETECTED YES CONFIRMATION - Sending email...');
        await handleSendConfirmedReply();
        return;
      }
      
      if (awaitingConfirmation && (lowerText.includes('no') || lowerText.includes('cancel') || lowerText.includes('don\'t'))) {
        console.log('✅ DETECTED NO CONFIRMATION - Cancelling email...');
        await handleCancelReply();
        return;
      }
      
      // 1. SUMMARIZE COMMAND
      if (lowerText.includes('summarize') || lowerText.includes('summary')) {
        console.log('✅ DETECTED SUMMARIZE COMMAND - Processing...');
        await handleSummarizeCommand();
      }
      
      // 2. READ EMAIL COMMAND - "read email from [name]" or "read the email from [name]"
      else if (lowerText.includes('read') && (lowerText.includes('email from') || lowerText.includes('message from'))) {
        console.log('✅ DETECTED READ EMAIL COMMAND - Processing...');
        await handleReadEmailCommand(text);
      }
      
      // 3. AUTO REPLY COMMAND - "write a reply to that email" (check this FIRST - more specific)
      else if (lowerText.includes('write') && lowerText.includes('reply') && (lowerText.includes('that') || lowerText.includes('this'))) {
        console.log('✅ DETECTED AUTO REPLY COMMAND - Processing...');
        await handleWriteAutoReplyCommand();
      }
      
      // 4. WRITE REPLY COMMAND - "write a reply" or "reply to [name]" (less specific, check after)
      else if (lowerText.includes('write') && (lowerText.includes('reply') || lowerText.includes('respond'))) {
        console.log('✅ DETECTED WRITE REPLY COMMAND - Processing...');
        await handleWriteReplyCommand(text);
      }
      
      // 4. UNKNOWN COMMAND
      else {
        console.log('❌ No recognized command detected in:', text);
        setAgentResponse(`I heard: "${text}". Try saying "summarize my inbox", "read email from [name]", or "write a reply".`);
        speakResponse(`I heard "${text}". Try saying "summarize my inbox", "read email from [name]", or "write a reply".`);
      }
    } catch (error) {
      console.error('❌ Error processing voice command:', error);
      const errorMessage = "Sorry, I had trouble processing that command. Please try again.";
      setAgentResponse(errorMessage);
      speakResponse(errorMessage);
    }
    
    // Reset processing flag after a delay
    setTimeout(() => {
      console.log('Resetting processing flag');
      setIsProcessingCommand(false);
    }, 1000);
    
    console.log('=== END PROCESSING VOICE COMMAND ===');
  };

  // Helper function to speak responses
  const speakResponse = async (text: string) => {
    if (Speech && typeof Speech.speak === 'function') {
      console.log('Speaking response via Speech');
      setIsTtsSpeaking(true);
      setSpeechKillSwitch(false); // Reset kill switch
      
      // Add natural speech patterns and pauses
      const conversationalText = text
        .replace(/\. /g, '... ') // Add pauses after periods
        .replace(/, /g, ', ... ') // Add pauses after commas
        .replace(/ and /g, ' ... and ') // Add pause before "and"
        .replace(/\.$/, '...'); // Add pause at the end
      
      // Wait a moment before speaking
      setTimeout(async () => {
        // Check kill switch before speaking - CHECK REF FIRST
        if (speechKillSwitchRef.current || speechKillSwitch || isVoiceAgentClosed) {
          console.log('🛑 Speech cancelled by kill switch - REF:', speechKillSwitchRef.current, 'STATE:', speechKillSwitch);
          setIsTtsSpeaking(false);
          return;
        }
        
        try {
          await Speech.speak(conversationalText, {
            language: 'en-US',
            pitch: 1.0,
            rate: 1.0,
            onDone: () => {
              console.log('Speech completed successfully');
              setIsTtsSpeaking(false);
            },
            onError: (error: any) => {
              console.error('Speech error:', error);
              setIsTtsSpeaking(false);
            },
            onStart: () => {
              console.log('Speech started successfully');
              // Check kill switch right after speech starts - CHECK REF FIRST
              if (speechKillSwitchRef.current || speechKillSwitch || isVoiceAgentClosed) {
                console.log('🛑 Killing speech immediately after start - REF:', speechKillSwitchRef.current, 'STATE:', speechKillSwitch);
                Speech.stop();
                setIsTtsSpeaking(false);
              }
            },
            onStopped: () => {
              console.log('Speech was stopped');
              setIsTtsSpeaking(false);
            },
          });
        } catch (error) {
          console.error('Error starting speech:', error);
          setIsTtsSpeaking(false);
        }
      }, 500);
    } else {
      console.log('Speech module not available for TTS');
      setIsTtsSpeaking(false);
    }
  };

  // Handle summarize command
  const handleSummarizeCommand = async () => {
    setAgentResponse('Generating inbox summary...');
    
    try {
      console.log('Calling emailService.generateInboxSummary...');
      const summary = await emailService.generateInboxSummary(token);
      console.log('✅ Summary generated successfully:', summary);
      
      setAgentResponse(summary);
      await speakResponse(summary);
      console.log('✅ Summarize command completed successfully');
    } catch (error) {
      console.error('❌ Error generating summary:', error);
      const fallbackSummary = "Hey! I'm having trouble connecting to your email right now, but I can see you want a summary. Try checking your connection and ask me again in a moment!";
      setAgentResponse(fallbackSummary);
      await speakResponse(fallbackSummary);
    }
  };

  // Handle read email command
  const handleReadEmailCommand = async (text: string) => {
    setAgentResponse('Looking for that email...');
    
    try {
      // Extract sender name from the command
      // Patterns: "read email from Bob", "read the email from Bob", "read message from Bob"
      const senderMatch = text.match(/(?:read.*?(?:email|message)\s+from\s+)([a-zA-Z\s]+)/i);
      const senderName = senderMatch ? senderMatch[1].trim() : '';
      
      if (!senderName) {
        const errorMsg = "I didn't catch who you want to read the email from. Try saying 'read email from [name]'.";
        setAgentResponse(errorMsg);
        await speakResponse(errorMsg);
        return;
      }
      
      console.log(`🔍 Looking for email from: ${senderName}`);
      
      // Find the thread from this sender
      const thread = await emailService.findThreadBySender(senderName, token);
      
      // Store the current thread for potential reply
      setCurrentThread(thread);
      setCurrentSender(senderName);
      console.log('✅ Stored thread context for replies:', {
        threadId: thread.id,
        senderName: senderName,
        subject: thread.latestMessage.subject
      });
      
      // Convert HTML email content to clean text using AI
      const cleanBody = await emailService.convertHtmlToText(thread.latestMessage.body, token, thread.latestMessage.subject);
      const emailContent = cleanBody;
      
      setAgentResponse(emailContent);
      await speakResponse(emailContent);
      
      console.log('✅ Read email command completed successfully');
         } catch (error) {
       console.error('❌ Error reading email:', error);
       const errorMsg = (error as Error).message || "Sorry, I couldn't find an email from that person. Try being more specific.";
       setAgentResponse(errorMsg);
       await speakResponse(errorMsg);
     }
  };

  // Handle write reply command
  const handleWriteReplyCommand = async (text: string) => {
    if (!currentThread) {
      const errorMsg = "I need to read an email first before I can write a reply. Try saying 'read email from [name]' first.";
      setAgentResponse(errorMsg);
      await speakResponse(errorMsg);
      return;
    }
    
    setAgentResponse('Generating your reply...');
    
    try {
      // Extract the instruction from the command
      // Patterns: "write a reply telling them...", "write a reply saying...", "reply that..."
      let instruction = '';
      
      if (text.includes('telling')) {
        const match = text.match(/telling.*?(.*)/i);
        instruction = match ? match[1].trim() : '';
      } else if (text.includes('saying')) {
        const match = text.match(/saying.*?(.*)/i);
        instruction = match ? match[1].trim() : '';
      } else if (text.includes('that')) {
        const match = text.match(/reply\s+that\s+(.*)/i);
        instruction = match ? match[1].trim() : '';
      } else {
        // Extract everything after "write a reply"
        const match = text.match(/write.*?reply\s+(.*)/i);
        instruction = match ? match[1].trim() : '';
      }
      
      if (!instruction) {
        const errorMsg = "What would you like the reply to say? Try 'write a reply telling them [your message]'.";
        setAgentResponse(errorMsg);
        await speakResponse(errorMsg);
        return;
      }
      
      console.log(`✍️ Generating reply with instruction: ${instruction}`);
      
      // Generate the reply
      const replyData = await emailService.generateReply({
        threadId: currentThread.id,
        instruction: instruction,
        senderName: currentSender,
        token: token,
      });
      
      setAgentResponse(`Here's your reply: ${replyData.reply}`);
      await speakResponse(replyData.reply);
      
      console.log('✅ Write reply command completed successfully');
         } catch (error) {
       console.error('❌ Error generating reply:', error);
       const errorMsg = (error as Error).message || "Sorry, I had trouble generating that reply. Please try again.";
       setAgentResponse(errorMsg);
       await speakResponse(errorMsg);
     }
  };

  // Handle auto-reply command - generates and asks for confirmation
  const handleWriteAutoReplyCommand = async () => {
    setAgentResponse('Generating a reply...');
    
    console.log('🔍 Auto-reply command triggered');
    console.log('🔍 Current thread state:', currentThread);
    console.log('🔍 Current sender state:', currentSender);
    
    try {
      // Check if we have a current thread to reply to
      if (!currentThread) {
        console.log('❌ No current thread found');
        const errorMsg = "I don't have an email to reply to. Try reading an email first, then ask me to write a reply.";
        setAgentResponse(errorMsg);
        await speakResponse(errorMsg);
        return;
      }
      
      console.log(`🔍 Auto-generating reply for thread: ${currentThread.id}`);
      
      // Generate a contextual reply using AI
      const replyDraft = await emailService.generateContextualReply(currentThread.id, token);
      
      // Store the pending reply
      setPendingReply(replyDraft);
      setAwaitingConfirmation(true);
      
      // Ask for confirmation
      const confirmationMessage = `Your reply says: ${replyDraft}. Can I send it?`;
      setAgentResponse(confirmationMessage);
      await speakResponse(confirmationMessage);
      
      console.log('✅ Auto-reply draft generated, awaiting confirmation');
    } catch (error) {
      console.error('❌ Error generating auto-reply:', error);
      const fallbackReply = "I'm having trouble generating a reply right now. Please try again in a moment.";
      setAgentResponse(fallbackReply);
      await speakResponse(fallbackReply);
         }
   };

  // Handle confirmed send
  const handleSendConfirmedReply = async () => {
    setAgentResponse('Sending your reply...');
    
    try {
      // Send the email using the pending reply
      await emailService.sendReply(currentThread.id, pendingReply, token);
      
      // Reset states
      setPendingReply('');
      setAwaitingConfirmation(false);
      
      const successMsg = "Reply sent successfully!";
      setAgentResponse(successMsg);
      await speakResponse(successMsg);
      
      console.log('✅ Auto-reply sent successfully');
    } catch (error) {
      console.error('❌ Error sending reply:', error);
      const errorMsg = "Sorry, I had trouble sending that reply. Please try again.";
      setAgentResponse(errorMsg);
      await speakResponse(errorMsg);
      
      // Reset states on error too
      setPendingReply('');
      setAwaitingConfirmation(false);
    }
  };

  // Handle cancelled reply
  const handleCancelReply = async () => {
    setPendingReply('');
    setAwaitingConfirmation(false);
    
    const cancelMsg = "Okay, I've cancelled the reply.";
    setAgentResponse(cancelMsg);
    await speakResponse(cancelMsg);
    
    console.log('✅ Auto-reply cancelled by user');
  };

  const handleVoiceInputSubmit = () => {
    console.log('Voice input submit:', voiceInput);
    if (voiceInput.trim()) {
      console.log('Processing text command:', voiceInput);
      processVoiceCommand(voiceInput);
      setVoiceInput('');
    } else {
      console.log('Empty voice input');
    }
  };

  const closeVoiceAgent = () => {
    console.log('🚨 EMERGENCY SHUTDOWN - Closing voice agent and cleaning up...');
    
    // ACTIVATE KILL SWITCH IMMEDIATELY - USE REF FOR INSTANT UPDATE
    speechKillSwitchRef.current = true;
    setSpeechKillSwitch(true);
    setIsVoiceAgentClosed(true);
    
    console.log('🛑 KILL SWITCH ACTIVATED - speechKillSwitchRef.current =', speechKillSwitchRef.current);
    
    // NUCLEAR OPTION - Stop speech multiple ways
    try {
      // Method 1: Direct stop
      Speech.stop();
      console.log('Method 1: Direct Speech.stop() called');
      
      // Method 2: Restart with empty text to interrupt
      Speech.speak('', {
        language: 'en-US',
        pitch: 0.1,
        rate: 10,
        onStart: () => { Speech.stop(); },
        onError: () => { Speech.stop(); },
      });
      console.log('Method 2: Empty speech interruption');
      
      // Method 3: Multiple stops with delays
      setTimeout(() => Speech.stop(), 10);
      setTimeout(() => Speech.stop(), 50);
      setTimeout(() => Speech.stop(), 100);
      setTimeout(() => Speech.stop(), 200);
      setTimeout(() => Speech.stop(), 500);
      
      console.log('Method 3: Multiple delayed stops scheduled');
    } catch (error) {
      console.log('Error in nuclear speech stop:', error);
    }
    
    // AGGRESSIVELY stop voice recognition
    if (Voice && typeof Voice.stop === 'function') {
      try {
        Voice.stop();
        Voice.destroy && Voice.destroy();
        console.log('Voice recognition stopped and destroyed');
      } catch (error) {
        console.log('Error stopping voice recognition:', error);
      }
    }
    
    // Clear any existing silence timeout
    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      setSilenceTimeout(null);
    }
    
    // Reset all voice-related states
    setIsListening(false);
    setListeningAnimation(false);
    setIsProcessingCommand(false);
    setVoiceText('');
    setAgentResponse('');
    setVoiceInput('');
    setIsAgentProcessing(false);
    setIsTtsSpeaking(false);
    
    // Stop any animations
    if (pulseAnim) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
    
    // Update the ref
    isListeningRef.current = false;
    
    // Finally close the modal
    setShowVoiceAgent(false);
    
    console.log('🚨 EMERGENCY SHUTDOWN COMPLETE');
  };

  // Voice recognition event handlers
  const onSpeechStart = (event: any) => {
    console.log('Speech recognition started:', event);
    setVoiceText('Listening...');
    finalRecognizedTextRef.current = ''; // Reset the final text
  };

  const onSpeechEnd = (event: any) => {
    console.log('Speech recognition ended:', event);
    
    // If we have text and speech ended, trigger the silence timeout after a short delay
    if (voiceText && voiceText !== 'Listening...' && !isProcessingCommand) {
      console.log('Speech ended with text, will trigger timeout in 1 second');
      setTimeout(() => {
        if (isListeningRef.current && !isProcessingCommand) {
          console.log('🔥 MANUAL TIMEOUT TRIGGER - Stopping listening after speech end');
          setIsListening(false);
          setListeningAnimation(false);
          pulseAnim.stopAnimation();
          pulseAnim.setValue(1);
          isListeningRef.current = false;
          
          // Stop the Voice module
          if (Voice && typeof Voice.stop === 'function') {
            try {
              Voice.stop();
              console.log('Voice recognition stopped due to manual timeout');
            } catch (error) {
              console.log('Error stopping voice recognition:', error);
            }
          }
          
          // Process the command with the final recognized text from ref
          const finalText = finalRecognizedTextRef.current || voiceText;
          console.log('🔥 Processing FINAL transcript after manual timeout:', finalText);
          if (finalText && finalText !== 'Listening...') {
            processVoiceCommand(finalText);
          }
        }
      }, 1000);
    }
  };

  const onSpeechError = (error: any) => {
    console.log('Speech recognition error:', error);
    setIsListening(false);
    setListeningAnimation(false);
    pulseAnim.stopAnimation();
    
    if (error.error) {
      if (error.error.code === '7') {
        setVoiceText('No speech detected. Try again or type your command.');
        setAgentResponse('No speech was detected. Please try speaking louder or use the text input.');
      } else if (error.error.code === '1') {
        setVoiceText('Speech recognition not available. Please type your command.');
        setAgentResponse('Speech recognition is not available in this environment. Please use the text input.');
      } else {
        setVoiceText(`Speech recognition error: ${error.error.message || 'Unknown error'}`);
        setAgentResponse('There was an error with speech recognition. Please use the text input.');
      }
    } else {
      setVoiceText('Speech recognition failed. Please type your command.');
      setAgentResponse('Speech recognition failed. Please use the text input below.');
    }
  };

  const onSpeechResults = (event: any) => {
    console.log('Speech results received:', event);
    
    // Don't process results if voice agent is closed
    if (isVoiceAgentClosed) {
      console.log('Voice agent is closed, ignoring speech results');
      return;
    }
    
    // Don't process results if we're already processing a command
    if (isProcessingCommand) {
      console.log('Already processing command, ignoring speech results');
      return;
    }
    
    if (event.value && event.value.length > 0) {
      const recognizedText = event.value[0];
      console.log('Recognized text:', recognizedText);
      
      // Update the transcript with the recognized text
      setVoiceText(recognizedText);
      
      // Store the final recognized text in the ref
      finalRecognizedTextRef.current = recognizedText;
      
      // Clear any existing silence timeout
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
      
      // Set a new silence timeout - this will process the FINAL transcript
      const newTimeout = setTimeout(() => {
        if (isListeningRef.current && !isProcessingCommand) {
          console.log('🔥 SILENCE TIMEOUT REACHED - Processing final transcript');
          setIsListening(false);
          setListeningAnimation(false);
          pulseAnim.stopAnimation();
          pulseAnim.setValue(1);
          isListeningRef.current = false;
          
          // Stop the Voice module
          if (Voice && typeof Voice.stop === 'function') {
            try {
              Voice.stop();
              console.log('Voice recognition stopped due to silence timeout');
            } catch (error) {
              console.log('Error stopping voice recognition:', error);
            }
          }
          
          // Process the command with the final recognized text from ref
          const finalText = finalRecognizedTextRef.current;
          console.log('🔥 Processing FINAL transcript after silence timeout:', finalText);
          if (finalText && finalText !== 'Listening...') {
            processVoiceCommand(finalText);
          }
        }
      }, 2500); // 2.5 second silence timeout
      
      setSilenceTimeout(newTimeout);
    }
  };

  const onSpeechPartialResults = (event: any) => {
    // Don't process results if voice agent is closed
    if (isVoiceAgentClosed) {
      return;
    }
    
    const results = event.value;
    if (results && results.length > 0) {
      setVoiceText(results[0]);
    }
  };

  const startListening = async () => {
    try {
      console.log('Starting voice recognition...');
      console.log('Voice module available:', !!Voice);
      
      // Don't start listening if TTS is currently speaking
      if (isTtsSpeaking) {
        console.log('TTS is speaking, not starting voice recognition');
        return;
      }
      
      // Don't start if already listening
      if (isListening) {
        console.log('Already listening, not starting again');
        return;
      }
      
      setIsListening(true);
      setListeningAnimation(true);
      setVoiceText('Listening...');
      setAgentResponse('');
      isListeningRef.current = true;
      
      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Check if Voice is available (native module)
      if (Voice && typeof Voice.start === 'function') {
        console.log('Using native Voice module');
        
        // Make sure to stop any existing recognition first
        try {
          await Voice.stop();
        } catch (e) {
          console.log('No existing recognition to stop');
        }
        
        // Start voice recognition
        await Voice.start('en-US');
      } else {
        console.log('Voice module not available - using fallback');
        setVoiceText('Voice recognition not available. Please type your command.');
        setIsListening(false);
        setListeningAnimation(false);
      }
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      setVoiceText('Error starting voice recognition. Please try again.');
      setIsListening(false);
      setListeningAnimation(false);
    }
  };

  const stopListening = async () => {
    try {
      console.log('Stopping voice recognition...');
      
      // Clear any existing silence timeout
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        setSilenceTimeout(null);
      }
      
      // Stop the animation
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      
      // Update UI state
      setIsListening(false);
      setListeningAnimation(false);
      setVoiceText('Voice recognition stopped');
      isListeningRef.current = false;
      
      // Stop the Voice module
      if (Voice && typeof Voice.stop === 'function') {
        try {
          await Voice.stop();
          console.log('Voice recognition stopped successfully');
        } catch (error) {
          console.log('Error stopping voice recognition:', error);
        }
      }
      
      // Also destroy to clean up completely
      if (Voice && typeof Voice.destroy === 'function') {
        try {
          await Voice.destroy();
          console.log('Voice recognition destroyed');
        } catch (error) {
          console.log('Error destroying voice recognition:', error);
        }
      }
    } catch (error) {
      console.error('Error in stopListening:', error);
      // Force reset state even if there's an error
      setIsListening(false);
      setListeningAnimation(false);
      setVoiceText('Voice recognition stopped');
    }
  };



  // Set up voice recognition event listeners
  useEffect(() => {
    try {
      // Check if Voice module is available
      console.log('Voice module check:', Voice);
      console.log('Voice module type:', typeof Voice);
      console.log('Voice.onSpeechStart exists:', typeof Voice?.onSpeechStart);
      console.log('Voice.start exists:', typeof Voice?.start);
      console.log('Voice.isAvailable exists:', typeof Voice?.isAvailable);
      
      if (Voice && typeof Voice.start === 'function') {
        // Use the correct Voice API with direct property assignment
        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechError = onSpeechError;
        Voice.onSpeechResults = onSpeechResults;
        Voice.onSpeechPartialResults = onSpeechPartialResults;
        console.log('Voice module initialized successfully with direct assignment');
        
        // Request microphone permission
        Voice.isAvailable().then((available: number) => {
          console.log('Voice module available:', available);
        }).catch((error: any) => {
          console.log('Error checking Voice availability:', error);
        });
      } else {
        console.log('Voice module not available');
      }
    } catch (error) {
      console.log('Error setting up Voice module:', error);
    }
    
    // Cleanup function to stop voice recognition when component unmounts
    return () => {
      console.log('Cleaning up Voice module...');
      if (Voice && typeof Voice.stop === 'function') {
        try {
          Voice.stop();
        } catch (error) {
          console.log('Error stopping Voice during cleanup:', error);
        }
      }
      if (Voice && typeof Voice.destroy === 'function') {
        try {
          Voice.destroy();
        } catch (error) {
          console.log('Error destroying Voice during cleanup:', error);
        }
      }
    };
  }, []);

  // Test function to manually add badges for debugging
  const testBadges = () => {
    setOriginalThreads(prev => {
      const updated = prev.map((thread, index) => {
        // Add test badges to first few emails
        if (index === 0) {
          return { ...thread, needsReply: true, isImportant: false };
        } else if (index === 1) {
          return { ...thread, needsReply: false, isImportant: true };
        } else if (index === 2) {
          return { ...thread, needsReply: true, isImportant: true };
        }
        return thread;
      });
      return updated;
    });
    
    showMessage({
      message: 'Test badges added! Check first 3 emails',
      type: 'info',
    });
  };

  // Generate and display inbox summary
  const generateInboxSummary = async () => {
    if (!token) return;
    
    setIsGeneratingSummary(true);
    setShowSummaryModal(true);
    
    try {
      const summary = await emailService.generateInboxSummary(token);
      setSummaryText(summary);
      
      // Auto-speak the summary
      speakSummary(summary);
    } catch (error) {
      console.error('Error generating summary:', error);
      setSummaryText('Sorry, I had trouble analyzing your inbox. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Speak the summary using text-to-speech
  const speakSummary = (text: string) => {
    console.log('Speech function called with text:', text.substring(0, 50) + '...');
    console.log('Current speech state:', { isSpeaking, speechRate, selectedVoice });
    
    if (isSpeaking) {
      console.log('Stopping current speech...');
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    console.log('Starting speech with rate:', speechRate, 'voice:', selectedVoice);
    
    // Add natural speech patterns
    const conversationalText = text
      .replace(/\. /g, '... ')
      .replace(/, /g, ', ... ')
      .replace(/ and /g, ' ... and ')
      .replace(/\.$/, '...');
    
    Speech.speak(conversationalText, {
      language: selectedVoice,
      pitch: 1.0, // Natural pitch for conversational sound
      rate: 0.75, // Slightly slower for more natural pace
      onDone: () => {
        console.log('Speech completed successfully');
        setIsSpeaking(false);
      },
      onError: (error: any) => {
        console.error('Speech error:', error);
        setIsSpeaking(false);
        showMessage({
          message: 'Sorry, I had trouble speaking. Please try again.',
          type: 'danger',
        });
      },
      onStart: () => {
        console.log('Speech started successfully');
      },
      onStopped: () => {
        console.log('Speech was stopped');
        setIsSpeaking(false);
      },
    });
  };

  // Test basic audio (not speech)
  const testBasicAudio = async () => {
    try {
      console.log('Testing basic audio...');
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav' },
        { shouldPlay: true }
      );
      
      await sound.playAsync();
      
      showMessage({
        message: 'Playing test sound - do you hear it?',
        type: 'info',
      });
      
      // Clean up after 3 seconds
      setTimeout(async () => {
        await sound.unloadAsync();
      }, 3000);
      
    } catch (error) {
      console.error('Audio test error:', error);
      showMessage({
        message: 'Audio test failed - try on a physical device',
        type: 'danger',
      });
    }
  };

  // Show speech troubleshooting tips
  const showSpeechTips = () => {
    Alert.alert(
      'Speech Not Working?',
      'Try these steps:\n\n1. Turn up your device volume\n2. Make sure you\'re not on silent mode\n3. Try on a physical device (not simulator)\n4. Check if other apps can play audio\n5. Restart the app if needed',
      [
        { text: 'OK', style: 'default' },
        { text: 'Test Speech', onPress: testSpeech },
      ]
    );
  };

  // Test speech with a simple phrase
  const testSpeech = () => {
    console.log('Testing speech...');
    
    // Try different speech configurations
    const testConfigs = [
      { language: selectedVoice, pitch: 1.0, rate: 0.75 },
      { language: selectedVoice, pitch: 0.95, rate: 0.8 },
      { language: selectedVoice, pitch: 1.05, rate: 0.7 },
    ];
    
    let configIndex = 0;
    
    const tryNextConfig = () => {
      if (configIndex >= testConfigs.length) {
        showMessage({
          message: 'Speech test failed. Check device volume and try again.',
          type: 'danger',
        });
        return;
      }
      
      const config = testConfigs[configIndex];
      console.log(`Trying speech config ${configIndex + 1}:`, config);
      
      Speech.speak(`Test ${configIndex + 1}: Hello, this is Dixie speaking with a more natural voice!`, {
        ...config,
        onDone: () => {
          console.log(`Test ${configIndex + 1} completed`);
          showMessage({
            message: `Speech test ${configIndex + 1} completed - did you hear it?`,
            type: 'success',
          });
        },
        onError: (error: any) => {
          console.error(`Test ${configIndex + 1} error:`, error);
          configIndex++;
          setTimeout(tryNextConfig, 500);
        },
        onStart: () => {
          console.log(`Test ${configIndex + 1} started`);
          showMessage({
            message: `Speech test ${configIndex + 1} started - check your volume!`,
            type: 'info',
          });
        },
      });
    };
    
    tryNextConfig();
  };

  // Stop speaking
  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  // Adjust speech rate
  const adjustSpeechRate = () => {
    const rates = [0.6, 0.8, 1.0, 1.2, 1.4];
    const currentIndex = rates.indexOf(speechRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setSpeechRate(rates[nextIndex]);
    
    showMessage({
      message: `Speech speed: ${rates[nextIndex]}x`,
      type: 'info',
      duration: 1500,
    });
  };

  const classifyEmailsForReply = async () => {
    if (!token || originalThreads.length === 0) return;
    
    try {
      // Get thread IDs for classification (process all threads)
      const threadIds = originalThreads.map(thread => thread.id);
      
      console.log(`Classifying ${threadIds.length} threads for needs reply and important updates...`);
      
      const classifications = await emailService.classifyEmails(token, threadIds);
      
      console.log('Classification results:', classifications);
      
      // Update threads with classification results
      setOriginalThreads(prev => {
        const updated = prev.map(thread => {
          const classification = classifications.find(c => c.threadId === thread.id);
          const updatedThread = {
            ...thread,
            needsReply: classification?.needsReply || false,
            isImportant: classification?.isImportant || false,
          };
          
          // Debug log for threads with badges
          if (updatedThread.needsReply || updatedThread.isImportant) {
            console.log(`Thread ${thread.id} (${thread.subject}): needsReply=${updatedThread.needsReply}, isImportant=${updatedThread.isImportant}`);
          }
          
          return updatedThread;
        });
        return updated;
      });
      
      // Count how many need replies and how many are important
      const needsReplyCount = classifications.filter(c => c.needsReply).length;
      const importantCount = classifications.filter(c => c.isImportant).length;
      
      console.log(`Classification complete: ${needsReplyCount} need replies, ${importantCount} are important`);
      
      showMessage({
        message: `Analyzed ${threadIds.length} emails - ${needsReplyCount} need replies, ${importantCount} are important`,
        type: 'info',
        duration: 4000,
      });
      
    } catch (error) {
      console.error('Error classifying emails:', error);
      showMessage({
        message: 'Failed to analyze emails',
        type: 'danger',
      });
    }
  };

  // Helper: format time/date like Gmail
  const formatThreadTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    ) {
      // Show time in h:mm A
      return dayjs(date).format('h:mm A');
    } else {
      // Show date as M/D/YYYY
      return dayjs(date).format('M/D/YYYY');
    }
  };

  const renderThread = ({ item }: { item: EmailThread }) => {
    // Debug logging for first few items
    if (item.id === '198248d73322a1da' || item.id === '198245f286efc3f0') {
      console.log(`Thread ${item.id}: read=${item.read}, subject="${item.subject}"`);
    }
    
    return (
    <TouchableOpacity
        style={[
          styles.threadItem,
          item.read === false && styles.unreadThread
        ]}
      onPress={() => handleThreadPress(item)}
        onLongPress={() => handleThreadLongPress(item)}
    >
      <View style={styles.threadHeader}>
          <View style={styles.threadFromContainer}>
            <Text style={[
              styles.threadFrom,
              item.read === false ? styles.unreadText : styles.readText
            ]} numberOfLines={1}>
          {item.from || 'Unknown'}
        </Text>
            {item.starred && <Ionicons name="star" size={16} color="#F9AB00" style={styles.starIcon} />}
            {item.important && <Ionicons name="flag" size={16} color="#FF6D01" style={styles.importantIcon} />}
          </View>
          <Text style={[
            styles.threadTime,
            item.read === false ? styles.unreadText : styles.readText
          ]}>
            {formatThreadTime(item.date)}
        </Text>
      </View>
        <Text style={[
          styles.threadSubject,
          item.read === false ? styles.unreadText : styles.readText
        ]} numberOfLines={1}>
        {item.subject}
      </Text>
      <Text style={styles.threadSnippet} numberOfLines={2}>
        {item.snippet}
      </Text>
      <View style={styles.threadFooter}>
          <View style={styles.threadLabels}>
            {item.needsReply && (
              <View style={styles.needsReplyBadge}>
                <Ionicons name="chatbubble-ellipses" size={12} color="#fff" />
                <Text style={styles.needsReplyText}>Reply</Text>
              </View>
            )}
            {item.important && (
              <View style={styles.importantBadge}>
                <Ionicons name="alert-circle" size={12} color="#fff" />
                <Text style={styles.importantBadgeText}>Important</Text>
              </View>
            )}
            {item.labels && item.labels.slice(0, 3).map(labelId => {
              const label = labels.find(l => l.id === labelId);
              return label ? (
                <View key={labelId} style={[styles.threadLabel, { backgroundColor: label.color }]}>
                  <Text style={styles.threadLabelText}>{label.name}</Text>
                </View>
              ) : null;
            })}
            {item.labels && item.labels.length > 3 && (
              <Text style={styles.moreLabelText}>+{item.labels.length - 3}</Text>
            )}
          </View>
      </View>
    </TouchableOpacity>
  );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="mail-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>No emails found</Text>
      <Text style={styles.emptySubtext}>Pull down to refresh</Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={64} color="#ff4444" />
      <Text style={styles.errorText}>Unable to load emails</Text>
      <Text style={styles.errorSubtext}>Please check your internet connection and try again</Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  // Get available voices for better speech
  const getAvailableVoices = async () => {
    try {
      // Expanded voice options with more variety
      const voices = [
        'en-GB', // British English (often sounds more natural)
        'en-US', // Default US English
        'en-AU', // Australian English
        'en-CA', // Canadian English
        'en-IN', // Indian English (clear pronunciation)
        'en-IE', // Irish English (friendly accent)
        'en-ZA', // South African English
        'en-NZ', // New Zealand English
        'en-PH', // Philippine English
        'en-SG', // Singapore English
      ];
      
      setAvailableVoices(voices);
      console.log('Available voices:', voices);
    } catch (error) {
      console.error('Error getting voices:', error);
    }
  };

  // Preview all voices quickly
  const previewAllVoices = () => {
    let voiceIndex = 0;
    
    const previewNextVoice = () => {
      if (voiceIndex >= availableVoices.length) {
        showMessage({
          message: 'Voice preview complete! Tap the person button to select your favorite.',
          type: 'success',
        });
        return;
      }
      
      const voice = availableVoices[voiceIndex];
      const voiceNames = {
        'en-US': 'American',
        'en-GB': 'British',
        'en-AU': 'Australian',
        'en-CA': 'Canadian',
        'en-IN': 'Indian',
        'en-IE': 'Irish',
        'en-ZA': 'South African',
        'en-NZ': 'New Zealand',
        'en-PH': 'Philippine',
        'en-SG': 'Singapore',
      };
      
      const voiceName = voiceNames[voice as keyof typeof voiceNames] || voice;
      
      Speech.speak(`This is the ${voiceName} accent.`, {
        language: voice,
        pitch: 1.1,
        rate: 0.8,
        onDone: () => {
          voiceIndex++;
          setTimeout(previewNextVoice, 500);
        },
      });
    };
    
    showMessage({
      message: 'Starting voice preview...',
      type: 'info',
    });
    
    previewNextVoice();
  };

  // Change voice
  const changeVoice = () => {
    const voices = availableVoices;
    const currentIndex = voices.indexOf(selectedVoice);
    const nextIndex = (currentIndex + 1) % voices.length;
    const newVoice = voices[nextIndex];
    
    setSelectedVoice(newVoice);
    
    // Fun descriptions for each voice
    const voiceDescriptions = {
      'en-US': '🇺🇸 American - Classic and clear',
      'en-GB': '🇬🇧 British - Sophisticated and natural',
      'en-AU': '🇦🇺 Australian - Friendly and laid-back',
      'en-CA': '🇨🇦 Canadian - Polite and clear',
      'en-IN': '🇮🇳 Indian - Warm and articulate',
      'en-IE': '🇮🇪 Irish - Charming and melodic',
      'en-ZA': '🇿🇦 South African - Unique and engaging',
      'en-NZ': '🇳🇿 New Zealand - Kiwi charm',
      'en-PH': '🇵🇭 Philippine - Clear and friendly',
      'en-SG': '🇸🇬 Singapore - International and precise',
    };
    
    const description = voiceDescriptions[newVoice as keyof typeof voiceDescriptions] || newVoice;
    
    showMessage({
      message: `Voice: ${description}`,
      type: 'info',
      duration: 2000,
    });
    
    // Test the new voice with a fun message
    const testMessages = [
      'Hello there! This is Dixie with a new accent!',
      'G\'day! How\'s your inbox looking today?',
      'Top of the morning! Ready to tackle those emails?',
      'Cheers! Let\'s get your inbox sorted!',
      'Brilliant! I\'m here to help with your emails!',
    ];
    
    const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
    
    Speech.speak(randomMessage, {
      language: newVoice,
      pitch: 1.1,
      rate: 0.8,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={toggleSidePanel} style={styles.menuButton}>
            <Ionicons name="menu" size={24} color="#666" />
          </TouchableOpacity>
          <Text style={styles.currentCategory}>
            {currentCategory === 'promotions' ? 'Promotions' : 
             currentCategory === 'primary' ? 'Primary' :
             currentCategory === 'social' ? 'Social' :
             currentCategory === 'updates' ? 'Updates' :
             currentCategory === 'sent' ? 'Sent' : 'Primary'}
          </Text>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#666" />
          </TouchableOpacity>
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search emails..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#999"
          />
          <TouchableOpacity onPress={handleVoiceCommand} style={styles.voiceButton}>
            <Ionicons name="mic" size={20} color="#4285F4" />
          </TouchableOpacity>
        </View>

        {/* Clear Filters Button */}
        {(selectedLabels.length > 0 || searchQuery) && (
          <View style={styles.clearFiltersContainer}>
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
              <Ionicons name="close-circle" size={16} color="#EA4335" />
              <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
        </View>
        )}

      </View>

      {/* Content */}
      <View style={styles.content}>
        {error ? (
          renderError()
        ) : (
      <FlatList
        data={threads}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
            ListEmptyComponent={!isLoading ? renderEmpty : null}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
            }
            contentContainerStyle={threads.length === 0 ? styles.emptyListContainer : undefined}
        showsVerticalScrollIndicator={false}
      />
        )}
      </View>

      {/* Loading Overlay */}
      {isLoading && threads.length === 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>
            {isLoadingSlow ? 'Loading emails... (This may take a moment)' : 'Loading emails...'}
          </Text>
          {isLoadingSlow && (
            <Text style={styles.loadingSubtext}>
              Gmail API can be slow sometimes. Please be patient.
            </Text>
          )}
        </View>
      )}

      {/* Floating Action Button - Compose */}
      <TouchableOpacity style={styles.fab} onPress={() => {
        (navigation as any).navigate('Compose');
      }}>
        <Ionicons name="create" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Voice Agent Modal */}
      <Modal
        visible={showVoiceAgent}
        transparent={true}
        animationType="slide"
        onRequestClose={closeVoiceAgent}
      >
        <View style={styles.voiceAgentOverlay}>
          <View style={styles.voiceAgentContainer}>
            {/* Header */}
            <View style={styles.voiceAgentHeader}>
              <View style={styles.voiceAgentHeaderLeft}>
                <Ionicons name="mic" size={20} color="#333" />
                <Text style={styles.voiceAgentTitle}>Dixie Voice Agent</Text>
              </View>
              <View style={styles.voiceAgentHeaderRight}>
                <TouchableOpacity 
                  onPress={changeVoice}
                  style={styles.voiceButton}
                >
                  <Text style={styles.voiceText}>
                    {selectedVoice === 'en-GB' ? '🇬🇧 British' : 
                     selectedVoice === 'en-US' ? '🇺🇸 American' :
                     selectedVoice === 'en-AU' ? '🇦🇺 Australian' :
                     selectedVoice === 'en-CA' ? '🇨🇦 Canadian' :
                     selectedVoice === 'en-IN' ? '🇮🇳 Indian' :
                     selectedVoice === 'en-IE' ? '🇮🇪 Irish' :
                     selectedVoice === 'en-ZA' ? '🇿🇦 South African' :
                     selectedVoice === 'en-NZ' ? '🇳🇿 New Zealand' :
                     selectedVoice === 'en-PH' ? '🇵🇭 Philippine' :
                     selectedVoice === 'en-SG' ? '🇸🇬 Singapore' : selectedVoice}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={closeVoiceAgent}
                  style={styles.voiceAgentCloseButton}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable Content Area */}
            <ScrollView 
              style={styles.voiceAgentContent}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.voiceAgentContentContainer}
            >
              {/* Listening Status */}
              {isListening && (
                <View style={styles.listeningStatusContainer}>
                  <View style={styles.listeningIndicator}>
                    {listeningAnimation && (
                      <Animated.View 
                        style={[
                          styles.listeningWave,
                          {
                            transform: [{ scale: pulseAnim }]
                          }
                        ]}
                      />
                    )}
                    <Ionicons 
                      name="mic" 
                      size={32} 
                      color={listeningAnimation ? "#ff4444" : "#4285F4"} 
                    />
                  </View>
                  <Text style={styles.listeningText}>
                    {listeningAnimation ? "Listening..." : "Ready to listen"}
                  </Text>
                </View>
              )}

              {/* Voice Transcript */}
              {voiceText && (
                <View style={styles.voiceTranscriptContainer}>
                  <Text style={styles.voiceTranscriptLabel}>Transcript:</Text>
                  <Text style={styles.voiceTranscriptText}>{voiceText}</Text>
                </View>
              )}

              {/* Agent Response */}
              {agentResponse && (
                <View style={styles.agentResponseContainer}>
                  <Text style={styles.agentResponseLabel}>Dixie:</Text>
                  <Text style={styles.agentResponseText}>{agentResponse}</Text>
                </View>
              )}

              {/* Instructions */}
              {!isListening && !voiceText && !agentResponse && (
                <View style={styles.voiceAgentInstructions}>
                  <Text style={styles.voiceAgentInstructionsText}>
                    Voice agent ready! Tap the mic to start listening.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Input Area */}
            <View style={styles.voiceAgentInputContainer}>
              <TouchableOpacity 
                onPress={isListening ? stopListening : startListening}
                style={[
                  styles.voiceAgentMicButton, 
                  isListening && styles.voiceAgentMicButtonListening,
                  listeningAnimation && styles.voiceAgentMicButtonPulsing
                ]}
              >
                <Ionicons 
                  name={isListening ? "stop" : "mic"} 
                  size={24} 
                  color={isListening ? "#fff" : "#4285F4"} 
                />
              </TouchableOpacity>
              
              <TextInput
                style={styles.voiceAgentTextInput}
                placeholder="Type your command here..."
                value={voiceInput}
                onChangeText={setVoiceInput}
                onSubmitEditing={handleVoiceInputSubmit}
                placeholderTextColor="#999"
              />
              <TouchableOpacity 
                onPress={handleVoiceInputSubmit}
                style={styles.voiceAgentSendButton}
                disabled={isAgentProcessing}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Label Management Modal */}
      <Modal
        visible={showLabelModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLabelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Labels</Text>
              <TouchableOpacity onPress={() => setShowLabelModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {selectedThread && (
              <View style={styles.modalBody}>
                <Text style={styles.modalSubject} numberOfLines={2}>
                  {selectedThread.subject}
                </Text>
                <Text style={styles.modalFrom}>From: {selectedThread.from}</Text>
                
                <ScrollView style={styles.labelsList}>
                  {labels.map((label) => {
                    const isSelected = selectedThread.labels?.includes(label.id) || false;
                    return (
                      <TouchableOpacity
                        key={label.id}
                        style={[styles.labelOption, isSelected && styles.selectedLabelOption]}
                        onPress={() => handleThreadLabelUpdate(selectedThread.id, label.id, !isSelected)}
                      >
                        <View style={styles.labelOptionContent}>
                          <View style={[styles.labelColor, { backgroundColor: label.color }]} />
                          <Text style={[styles.labelOptionText, isSelected && styles.selectedLabelOptionText]}>
                            {label.name}
                          </Text>
                        </View>
                        {isSelected && <Ionicons name="checkmark" size={20} color="#4285F4" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Inbox Summary Modal */}
      <Modal
        visible={showSummaryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSummaryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.summaryHeader}>
                <Ionicons name="chatbubble-ellipses" size={24} color="#4285F4" />
                <Text style={styles.modalTitle}>Dixie's Inbox Summary</Text>
              </View>
              <View style={styles.summaryControls}>
                {!isGeneratingSummary && summaryText && (
                  <TouchableOpacity 
                    onPress={() => speakSummary(summaryText)}
                    style={styles.speechButton}
                  >
                    <Ionicons 
                      name={isSpeaking ? "pause" : "volume-high"} 
                      size={20} 
                      color={isSpeaking ? "#FF6D01" : "#4285F4"} 
                    />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity 
                onPress={() => setShowSummaryModal(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              {isGeneratingSummary ? (
                <View style={styles.summaryLoading}>
                  <ActivityIndicator size="large" color="#4285F4" />
                  <Text style={styles.summaryLoadingText}>Dixie is analyzing your inbox...</Text>
                </View>
              ) : (
                <ScrollView style={styles.summaryContent}>
                  {isSpeaking && (
                    <View style={styles.speakingIndicator}>
                      <Ionicons name="volume-high" size={16} color="#4285F4" />
                      <Text style={styles.speakingText}>Dixie is speaking...</Text>
                    </View>
                  )}
                  <Text style={styles.summaryText}>{summaryText}</Text>
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Side Panel */}
      {showSidePanel && (
        <>
          <TouchableOpacity 
            style={styles.sidePanelOverlay} 
            onPress={toggleSidePanel}
            activeOpacity={1}
          />
          <Animated.View 
            style={[
              styles.sidePanel,
              { transform: [{ translateX: slideAnim }] }
            ]}
          >
            <View style={styles.sidePanelHeader}>
              <Text style={styles.sidePanelTitle}>Gmail</Text>
              <Text style={styles.sidePanelUser}>{user?.email || 'User'}</Text>
            </View>
            
            <ScrollView style={styles.sidePanelContent}>
              {/* Categories Section */}
              <View style={styles.sidePanelSection}>
                <Text style={styles.sidePanelSectionTitle}>Categories</Text>
                {getCategoryInfo().map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.sidePanelItem,
                      currentCategory === category.id && styles.sidePanelItemActive
                    ]}
                    onPress={() => selectCategoryFromSidePanel(category.id)}
                  >
                    <View style={styles.sidePanelItemIcon}>
                      <Ionicons 
                        name={category.icon as any} 
                        size={20} 
                        color={currentCategory === category.id ? '#4285F4' : '#6b7280'} 
                      />
                    </View>
                    <Text style={[
                      styles.sidePanelItemText,
                      currentCategory === category.id && styles.sidePanelItemTextActive
                    ]}>
                      {category.name}
                    </Text>
                    {category.count > 0 && (
                      <View style={styles.sidePanelItemBadge}>
                        <Text style={styles.sidePanelItemBadgeText}>
                          {category.count > 99 ? '99+' : category.count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Labels Section */}
              <View style={styles.sidePanelSection}>
                <Text style={styles.sidePanelSectionTitle}>Labels</Text>
                {labels.map((label) => (
                  <TouchableOpacity
                    key={label.id}
                    style={styles.sidePanelItem}
                    onPress={() => {
                      handleLabelToggle(label.id);
                      toggleSidePanel();
                    }}
                  >
                    <View style={styles.sidePanelItemIcon}>
                      <View style={[styles.labelColor, { backgroundColor: label.color }]} />
                    </View>
                    <Text style={styles.sidePanelItemText}>
                      {label.name}
                    </Text>
                    {label.count && label.count > 0 && (
                      <View style={styles.sidePanelItemBadge}>
                        <Text style={styles.sidePanelItemBadgeText}>
                          {label.count > 99 ? '99+' : label.count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Other Options */}
              <View style={styles.sidePanelSection}>
                <Text style={styles.sidePanelSectionTitle}>More</Text>
                <TouchableOpacity style={styles.sidePanelItem}>
                  <View style={styles.sidePanelItemIcon}>
                    <Ionicons name="star-outline" size={20} color="#6b7280" />
                  </View>
                  <Text style={styles.sidePanelItemText}>Starred</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sidePanelItem}>
                  <View style={styles.sidePanelItemIcon}>
                    <Ionicons name="time-outline" size={20} color="#6b7280" />
                  </View>
                  <Text style={styles.sidePanelItemText}>Snoozed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sidePanelItem}>
                  <View style={styles.sidePanelItemIcon}>
                    <Ionicons name="flag-outline" size={20} color="#6b7280" />
                  </View>
                  <Text style={styles.sidePanelItemText}>Important</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sidePanelItem}>
                  <View style={styles.sidePanelItemIcon}>
                    <Ionicons name="send-outline" size={20} color="#6b7280" />
                  </View>
                  <Text style={styles.sidePanelItemText}>Sent</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sidePanelItem}>
                  <View style={styles.sidePanelItemIcon}>
                    <Ionicons name="document-outline" size={20} color="#6b7280" />
                  </View>
                  <Text style={styles.sidePanelItemText}>Drafts</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    padding: 5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },

  testButton: {
    padding: 5,
  },

  content: {
    flex: 1,
  },
  threadItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  threadFrom: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  threadTime: {
    fontSize: 12,
    color: '#666',
    marginLeft: 10,
  },
  threadSubject: {
    fontSize: 14,
    color: '#444',
    marginBottom: 5,
  },
  threadSnippet: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 8,
  },
  threadFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageCount: {
    fontSize: 12,
    color: '#888',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyListContainer: {
    flex: 1,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ff4444',
    marginTop: 15,
    marginBottom: 5,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 245, 245, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  loadingSubtext: {
    marginTop: 5,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  // Sorting and filtering styles
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    marginRight: 8,
  },
  sortText: {
    marginHorizontal: 8,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  clearText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  labelColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  // Thread display styles
  unreadThread: {
    backgroundColor: '#f8f9fa',
    borderLeftWidth: 3,
    borderLeftColor: '#4285F4',
  },
  threadFromContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadText: {
    fontWeight: '600',
    color: '#1f2937',
  },
  readText: {
    fontWeight: '400',
    color: '#666',
  },
  starIcon: {
    marginLeft: 8,
  },
  importantIcon: {
    marginLeft: 4,
  },
  threadLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  threadLabel: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginRight: 4,
  },
  threadLabelText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  moreLabelText: {
    fontSize: 10,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  needsReplyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EA4335', // Red color for reply indicator
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  needsReplyText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  importantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6D01', // A distinct color for important
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  importantBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  modalSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  modalFrom: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  labelsList: {
    maxHeight: 300,
  },
  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  selectedLabelOption: {
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  labelOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelOptionText: {
    fontSize: 14,
    color: '#3c4043',
    marginLeft: 8,
  },
  selectedLabelOptionText: {
    color: '#1a73e8',
    fontWeight: '500',
  },
  // Header styles
  menuButton: {
    padding: 8,
  },
  currentCategory: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
  },
  // Side panel styles
  sidePanelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  sidePanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 300,
    height: '100%',
    backgroundColor: '#fff',
    zIndex: 1001,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  sidePanelHeader: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  sidePanelTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  sidePanelUser: {
    fontSize: 14,
    color: '#6b7280',
  },
  sidePanelContent: {
    flex: 1,
    paddingTop: 20,
  },
  sidePanelSection: {
    marginBottom: 20,
  },
  sidePanelSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sidePanelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sidePanelItemActive: {
    backgroundColor: '#e8f0fe',
    borderRightWidth: 3,
    borderRightColor: '#4285F4',
  },
  sidePanelItemIcon: {
    marginRight: 16,
    width: 20,
    alignItems: 'center',
  },
  sidePanelItemText: {
    fontSize: 16,
    color: '#1f2937',
    flex: 1,
  },
  sidePanelItemTextActive: {
    color: '#4285F4',
    fontWeight: '500',
  },
  sidePanelItemBadge: {
    backgroundColor: '#4285F4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  sidePanelItemBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  // Floating Action Button
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EA4335',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  clearFiltersContainer: {
    paddingHorizontal: 16,
    paddingBottom: 15,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLoading: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  summaryLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  summaryContent: {
    maxHeight: 400,
  },
  summaryText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    textAlign: 'left',
  },
  summaryControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  speechButton: {
    padding: 5,
  },
  speedButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  speedText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingVertical: 10,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
  },
  speakingText: {
    fontSize: 14,
    color: '#4285F4',
    marginLeft: 5,
  },
  voiceButton: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  listeningButton: {
    backgroundColor: '#FFE6E6',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  voiceText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  voiceCommandText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginLeft: 8,
    flex: 1,
  },

  debugButton: {
    padding: 4,
    marginLeft: 8,
  },
  closeButton: {
    padding: 5,
  },
  voiceAgentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 15,
    zIndex: 1000,
  },
  voiceAgentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  voiceAgentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceAgentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voiceAgentTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  voiceAgentCloseButton: {
    padding: 5,
  },
  voiceAgentResponse: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceAgentResponseText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    lineHeight: 22,
  },
  voiceAgentLoading: {
    marginTop: 10,
  },
  voiceAgentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  voiceAgentMicButton: {
    padding: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  voiceAgentMicButtonListening: {
    backgroundColor: '#FF4444',
  },
  voiceAgentMicButtonPulsing: {
    backgroundColor: '#ff4444',
  },
  voiceAgentTextInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginHorizontal: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  voiceAgentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listeningStatusContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  listeningIndicator: {
    position: 'relative',
    marginBottom: 10,
  },
  listeningWave: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF4444',
    opacity: 0.3,
    top: -14,
    left: -14,
  },
  listeningText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  voiceTranscriptContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  voiceTranscriptLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  voiceTranscriptText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  agentResponseContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  agentResponseLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  agentResponseText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  voiceAgentInstructions: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  voiceAgentInstructionsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  voiceAgentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  voiceAgentContent: {
    maxHeight: 300,
    marginBottom: 15,
  },
  voiceAgentContentContainer: {
    paddingBottom: 10,
  },
});

export default HomeScreen; 