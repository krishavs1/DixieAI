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
  Animated,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import elevenLabsTTS from '../services/elevenLabsTTS';

import * as Clipboard from 'expo-clipboard';
import Voice from '@react-native-community/voice';


import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { emailService, EmailThread, EmailLabel, EmailCategory, EmailCategoryInfo, SYSTEM_LABELS } from '../services/emailService';

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

  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);


  // Add state for visual feedback
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [agentResponse, setAgentResponse] = useState('');

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
  
  // State for edit mode flow
  const [isEditMode, setIsEditMode] = useState(false);
  const [editHistory, setEditHistory] = useState<string[]>([]);
  const [originalReply, setOriginalReply] = useState<string>('');
  
  // Refs to persist thread context across voice agent sessions
  const currentThreadRef = useRef<any>(null);
  const currentSenderRef = useRef<string>('');
  
  // Wake word detection state
  // NOTE: Wake word "dixie" is ALWAYS active (even during TTS and processing)
  // Commands are ONLY processed when red microphone UI shows "Listening..."
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const wakeWordTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [ignoreNextSpeechResult, setIgnoreNextSpeechResult] = useState(false);
  const wakeWordJustDetectedRef = useRef(false);
  const justStartedListeningRef = useRef(false);
  const commandProcessedRef = useRef(false);

  
  // Global cancellation flag - when true, all processing should stop immediately
  const globalCancellationFlagRef = useRef(false);
  
  // Prevent multiple simultaneous wake word detection calls
  const wakeWordDetectionInProgressRef = useRef(false);
  
  // Ref to track confirmation state more reliably (prevents state loss during re-renders)
  const awaitingConfirmationRef = useRef(false);
  
  // Ref to track pending reply more reliably (prevents state loss during re-renders)
  const pendingReplyRef = useRef('');
  
  // Refs for edit mode state (prevents state loss during re-renders)
  const isEditModeRef = useRef(false);
  const editHistoryRef = useRef<string[]>([]);
  const originalReplyRef = useRef('');
  
  // Timer that lasts 10 seconds after speech completes to detect further speech
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  if (!authContext) {
    throw new Error('HomeScreen must be used within AuthProvider');
  }

  const { user, token, logout } = authContext;

  // Cleanup speech when modal closes
  useEffect(() => {
    if (!showSummaryModal && isTtsSpeaking) {
      stopSpeaking();
    }
  }, [showSummaryModal]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (isTtsSpeaking) {
        stopSpeaking();
      }
    };
  }, []);

  // Start wake word detection when component mounts
  useEffect(() => {
    // Start wake word detection after a short delay to ensure Voice module is ready
    const timer = setTimeout(() => {
      console.log('🎧 Starting initial wake word detection right away');
      startWakeWordDetection();
    }, 0);
    
    return () => clearTimeout(timer);
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
    const categoryFiltered = currentCategory === 'all' 
      ? categorizedThreads 
      : categorizedThreads.filter(thread => 
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



  // Code below to debug emails by copying HTML to clipboard and then seeing how it renders
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
        all: { name: 'All', color: '#4285F4', icon: 'mail' },
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
    
    // If TTS is speaking, interrupt it immediately (same as wake word)
    if (isTtsSpeaking) {
      console.log('🛑 Interrupting TTS for mic button click');
      elevenLabsTTS.stop();
      setIsTtsSpeaking(false);
    }
    
    // If currently processing, interrupt it (same as wake word)
    if (isProcessingCommand) {
      console.log('🛑 Interrupting command processing for mic button click');
      setIsProcessingCommand(false);
      commandProcessedRef.current = false; // Reset command processed flag
    }
    
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

  // Start wake word detection
  const startWakeWordDetection = async () => {
    console.log('🎧 startWakeWordDetection called');
    console.log('🎧 isWakeWordListening:', isWakeWordListening);
    console.log('🎧 Voice available:', !!Voice);
    
    // Prevent multiple simultaneous calls
    if (wakeWordDetectionInProgressRef.current) {
      console.log('🎧 Wake word detection already in progress, skipping');
      return;
    }
    
    
    // Set flag to prevent multiple calls
    wakeWordDetectionInProgressRef.current = true;
    
    // Add a small delay to prevent rapid successive calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Double-check state after delay
    if (isWakeWordListening) {
      console.log('🎧 Still listening after delay, skipping');
      wakeWordDetectionInProgressRef.current = false;
      return;
    }
    
    console.log('🎧 Starting wake word detection...');
    setIsWakeWordListening(true);
    
    try {
      // Stop any existing recognition first
      try {
        await Voice.stop();
        console.log('🎧 Stopped existing recognition before starting');
      } catch (stopError) {
        // Ignore stop errors
      }
      
      // Add a small delay before starting new recognition
      await new Promise(resolve => setTimeout(resolve, 0));
      
      await Voice.start('en-US');
      console.log('✅ Wake word detection started');
    } catch (error) {
      console.error('❌ Error starting wake word detection:', error);
      setIsWakeWordListening(false);
      
      // If it's an "already started" error, try to recover
      if (error && typeof error === 'object' && 'error' in error && 
          error.error && typeof error.error === 'object' && 'message' in error.error &&
          typeof error.error.message === 'string' && error.error.message.includes('already started')) {
        console.log('🎧 Attempting to recover from "already started" error...');
        try {
          await Voice.stop();
          await new Promise(resolve => setTimeout(resolve, 500));
          await Voice.start('en-US');
          console.log('✅ Wake word detection recovered successfully');
          setIsWakeWordListening(true);
        } catch (recoveryError) {
          console.error('❌ Recovery failed:', recoveryError);
        }
      }
    } finally {
      // Always reset the flag
      wakeWordDetectionInProgressRef.current = false;
    }
  };

  // Stop wake word detection
  const stopWakeWordDetection = async () => {
    if (!isWakeWordListening) return;
    
    console.log('🛑 Stopping wake word detection...');
    setIsWakeWordListening(false);
    wakeWordDetectionInProgressRef.current = false; // Reset the flag
    
    try {
      await Voice.stop();
      console.log('✅ Wake word detection stopped');
    } catch (error) {
      console.error('❌ Error stopping wake word detection:', error);
    }
  };

  const processVoiceCommand = async (text: string) => {
    try {
      console.log('=== PROCESSING VOICE COMMAND ===');
      console.log('Text received:', text);
      console.log('Current voiceText state:', voiceText);
      console.log('Current state - isListening:', isListening, 'isProcessingCommand:', isProcessingCommand);
      console.log('Current thread state at start:', currentThread);
      console.log('Current sender state at start:', currentSender);
      
      // Check for global cancellation flag first
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Command processing cancelled by global flag');
        commandProcessedRef.current = false; // Reset flag so next command can be processed
        return;
      }
      
      // Allow duplicate commands - reset the flag for each new command
      commandProcessedRef.current = false;
      console.log('🔄 Reset commandProcessedRef for new command:', text);
      
      // Prevent multiple simultaneous command processing
      if (isProcessingCommand) {
        console.log('Already processing a command, ignoring:', text);
        return;
      }
      
      // Set command processed flag
      commandProcessedRef.current = true;
      console.log('🚫 Set commandProcessedRef to true');
      
      const lowerText = text.toLowerCase();
      console.log('Lowercase text:', lowerText);
      
      // Use setTimeout instead of requestAnimationFrame for better device compatibility
      setTimeout(async () => {
        try {
          console.log('Setting processing flag to true');
          setIsProcessingCommand(true);
          
          // KEEP WAKE WORD DETECTION ACTIVE during command processing
          // This allows interruption with "Dixie" during processing
          console.log('🎧 Keeping wake word detection active during command processing...');
          
          // Stop active listening and show processing UI
          console.log('🛑 Stopping active listening for command processing...');
          await stopListening();
          
          // Clear the listening UI and show processing state
          setVoiceText('');
          setAgentResponse('Processing your request...');
          
          // Start pulsing animation for processing state
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.2,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1.0,
                duration: 1000,
                useNativeDriver: true,
              }),
            ])
          ).start();
          
          // Ensure wake word detection is active during processing
          // Add a small delay to prevent Dixie from picking up its own voice
          if (!isWakeWordListening) {
            console.log('🎧 Starting wake word detection during processing...');
            setTimeout(() => {
              startWakeWordDetection();
            }, 1000); // 1 second delay to avoid self-triggering
          }
          
          // Process the command
          try {
           
            // Check both state and ref for confirmation
            const isAwaitingConfirmation = awaitingConfirmation || awaitingConfirmationRef.current;
            const hasPendingReply = pendingReply || pendingReplyRef.current;
            
            if (isAwaitingConfirmation && (lowerText.includes('yes') || lowerText.includes('send') || lowerText.includes('okay') || lowerText.includes('ok'))) {
              console.log('✅ DETECTED YES CONFIRMATION - Sending email...');
              await handleSendConfirmedReply();
              return;
            }
            
            // Fallback: If we have a pending reply but confirmation state is lost, still allow confirmation
            if (hasPendingReply && (lowerText.includes('yes') || lowerText.includes('send') || lowerText.includes('okay') || lowerText.includes('ok'))) {
              console.log('✅ DETECTED YES CONFIRMATION (fallback) - Sending email...');
              setAwaitingConfirmation(true); // Restore the state
              awaitingConfirmationRef.current = true; // Restore the ref
              await handleSendConfirmedReply();
              return;
            }
            
            // SIMPLE CONFIRMATION FLOW:
            // 1. Send it - if they say "send it", "yes", "okay", etc.
            // 2. Cancel - if they say "cancel", "no", "don't send", etc.
            // 3. Everything else - pass to LLM to regenerate the reply
            
            if (isAwaitingConfirmation) {
              // Check for send confirmation
              if (lowerText.includes('send') || lowerText.includes('yes') || lowerText.includes('okay') || lowerText.includes('ok') || lowerText.includes('go ahead')) {
                console.log('✅ DETECTED SEND CONFIRMATION - Sending email...');
                await handleSendConfirmedReply();
                return;
              }
              
              // Check for cancellation
              if (lowerText.includes('cancel') || lowerText.includes('no') || lowerText.includes('don\'t send') || lowerText.includes('stop')) {
                console.log('✅ DETECTED CANCELLATION - Cancelling email...');
                await handleCancelReply();
                return;
              }
              
              // Everything else - treat as edit request
              console.log('✏️ DETECTED EDIT REQUEST - Regenerating reply...');
              await handleEditRequest(text);
              return;
            }
            
            // Fallback: If we have a pending reply but confirmation state is lost
            if (hasPendingReply) {
              // Check for send confirmation
              if (lowerText.includes('send') || lowerText.includes('yes') || lowerText.includes('okay') || lowerText.includes('ok') || lowerText.includes('go ahead')) {
                console.log('✅ DETECTED SEND CONFIRMATION (fallback) - Sending email...');
                setAwaitingConfirmation(true);
                awaitingConfirmationRef.current = true;
                await handleSendConfirmedReply();
                return;
              }
              
              // Check for cancellation
              if (lowerText.includes('cancel') || lowerText.includes('no') || lowerText.includes('don\'t send') || lowerText.includes('stop')) {
                console.log('✅ DETECTED CANCELLATION (fallback) - Cancelling email...');
                setAwaitingConfirmation(true);
                awaitingConfirmationRef.current = true;
                await handleCancelReply();
                return;
              }
              
              // Everything else - treat as edit request
              console.log('✏️ DETECTED EDIT REQUEST (fallback) - Regenerating reply...');
              setAwaitingConfirmation(true);
              awaitingConfirmationRef.current = true;
              await handleEditRequest(text);
              return;
            }
            
            // EDIT MODE HANDLING - Check if we're in edit mode and handle edit requests
            const isInEditMode = isEditMode || isEditModeRef.current;
            if (isInEditMode && isAwaitingConfirmation) {
              console.log('✏️ DETECTED EDIT MODE - Processing edit request...');
              await handleEditRequest(text);
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
            
            // 3. AUTO REPLY COMMAND - "write a reply to that email" or "reply to that email" (check this FIRST - more specific)
            else if ((lowerText.includes('write') && lowerText.includes('reply') && (lowerText.includes('that') || lowerText.includes('this'))) ||
                     (lowerText.includes('reply') && (lowerText.includes('that') || lowerText.includes('this')) && !lowerText.includes('write'))) {
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
          console.log('Resetting processing flag');
          setIsProcessingCommand(false);
          // Reset command processed flag so new commands can be processed
          commandProcessedRef.current = false;
          console.log('🔄 Reset commandProcessedRef to false - ready for next command');
          
          // Reset global cancellation flag
          globalCancellationFlagRef.current = false;
          
          // Stop the processing animation
          pulseAnim.stopAnimation();
          pulseAnim.setValue(1);
          
          // Keep voice agent open and ready for next command
          // Only set "Ready for your next command..." if the response is still a processing message
          // This prevents overwriting actual responses like summaries, email content, etc.
          const currentResponse = agentResponse;
          if (currentResponse === 'Processing your request...' || currentResponse === 'Generating inbox summary...' || currentResponse === 'Looking for that email...') {
            setAgentResponse('Ready for your next command...');
          }
          // Also restart active listening if voice agent is still open
          if (showVoiceAgent && !isVoiceAgentClosed) {
            console.log('🎤 Restarting active listening after command completion...');
            startListening();
          }
          
        } catch (error) {
          console.error('❌ Error in processVoiceCommand:', error);
          // Reset flags on error
          setIsProcessingCommand(false);
          commandProcessedRef.current = false;
        }
      }, 100);
      
      console.log('=== END PROCESSING VOICE COMMAND ===');
    } catch (error) {
      console.error('❌ CRITICAL ERROR in processVoiceCommand:', error);
      // Reset all flags on critical error
      setIsProcessingCommand(false);
      commandProcessedRef.current = false;
    }
  };

  // Helper function to speak responses using ElevenLabs
  const speakResponse = async (text: string) => {
      console.log('🎤 SPEAK RESPONSE CALLED - Text:', text.substring(0, 50) + '...');
      console.log('🎤 Current state - showVoiceAgent:', showVoiceAgent, 'isVoiceAgentClosed:', isVoiceAgentClosed);
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
        // Check kill switch and global cancellation flag before speaking - CHECK REF FIRST
        if (speechKillSwitchRef.current || speechKillSwitch || isVoiceAgentClosed || globalCancellationFlagRef.current) {
          console.log('🛑 Speech cancelled by kill switch or global cancellation - REF:', speechKillSwitchRef.current, 'STATE:', speechKillSwitch, 'GLOBAL:', globalCancellationFlagRef.current);
          setIsTtsSpeaking(false);
          return;
        }
        
        try {
          await elevenLabsTTS.speak(conversationalText, {
            onDone: () => {
              console.log('🎤 SPEECH DONE — entering follow‑up listening window');
              setIsTtsSpeaking(false);
            
              // 1) Start active listening so user can speak right away:
              startListening();
            
              // 2) Schedule auto‑stop after 10 s if nobody talks:
              if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
              followUpTimerRef.current = setTimeout(() => {
                console.log('⏲️ Follow‑up window expired — stopping listening');
                stopListening();
                followUpTimerRef.current = null;
              }, 10_000);
            },
            onError: (error: any) => {
              console.error('Speech error:', error);
              setIsTtsSpeaking(false);
            },
            onStart: () => {
              console.log('🎤 SPEECH STARTED SUCCESSFULLY');
              console.log('🎤 Kill switch check - REF:', speechKillSwitchRef.current, 'STATE:', speechKillSwitch, 'isVoiceAgentClosed:', isVoiceAgentClosed, 'GLOBAL:', globalCancellationFlagRef.current);
              // Check kill switch and global cancellation right after speech starts - CHECK REF FIRST
              if (speechKillSwitchRef.current || speechKillSwitch || isVoiceAgentClosed || globalCancellationFlagRef.current) {
                console.log('🛑 Killing speech immediately after start - REF:', speechKillSwitchRef.current, 'STATE:', speechKillSwitch, 'GLOBAL:', globalCancellationFlagRef.current);
                elevenLabsTTS.stop();
                setIsTtsSpeaking(false);
              }
            },

          });
        } catch (error) {
          console.error('Error starting ElevenLabs TTS:', error);
          setIsTtsSpeaking(false);
        }
      }, 500);
  };

  // Handle summarize command
  const handleSummarizeCommand = async () => {
    try {
      // Check for cancellation before starting
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation cancelled before starting');
        return;
      }
      
      setAgentResponse('Generating inbox summary...');
      
      // Check for cancellation before making API call
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation cancelled before API call');
        return;
      }
      
      console.log('📞 Calling emailService.generateInboxSummary...');
      const summary = await emailService.generateInboxSummary(token, globalCancellationFlagRef);
      console.log('✅ Summary generated successfully:', summary);
      
      // Check if cancelled before proceeding
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation was cancelled by wake word - NOT SPEAKING');
        return;
      }
      
      // Check again before setting response
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation was cancelled before setting response');
        return;
      }
      
      // Show cache status in response
      const cacheStatus = summary.includes('[CACHED]') ? ' (cached)' : '';
      const displaySummary = summary.replace('[CACHED]', '');
      
      setAgentResponse(displaySummary);
      
      // Check again before speaking
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation was cancelled before speaking - NOT SPEAKING');
        return;
      }
      
      await speakResponse(displaySummary);
      console.log('✅ Summarize command completed successfully');
    } catch (error) {
      // Check if cancelled before showing error
      if (globalCancellationFlagRef.current) {
        console.log('🛑 Summary generation was cancelled during error handling');
        return;
      }
      
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
      
      // Store the current thread for potential reply (both state and ref)
      setCurrentThread(thread);
      setCurrentSender(senderName);
      currentThreadRef.current = thread;
      currentSenderRef.current = senderName;
      console.log('✅ Stored thread context for replies:', {
        threadId: thread.id,
        senderName: senderName,
        subject: thread.latestMessage.subject
      });
      console.log('✅ Set currentThread state to:', thread);
      console.log('✅ Set currentSender state to:', senderName);
      console.log('✅ Set currentThreadRef to:', thread);
      console.log('✅ Set currentSenderRef to:', senderName);
      
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
        token: token,
      });
      
      setAgentResponse(`Here's your reply:\n\n${replyData.reply}`);
      await speakResponse(`Here's your reply: ${replyData.reply}`);
      
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
    console.log('🔍 Current thread ref:', currentThreadRef.current);
    console.log('🔍 Current sender ref:', currentSenderRef.current);
    console.log('🔍 Current thread ID:', currentThread?.id || currentThreadRef.current?.id);
    console.log('🔍 Current thread subject:', currentThread?.latestMessage?.subject || currentThreadRef.current?.latestMessage?.subject);
    console.log('🔍 Current thread from:', currentThread?.latestMessage?.from || currentThreadRef.current?.latestMessage?.from);
    
    try {
      // Check if we have a current thread to reply to (try state first, then ref)
      const threadToUse = currentThread || currentThreadRef.current;
      if (!threadToUse) {
        console.log('❌ No current thread found in state or ref');
        const errorMsg = "I don't have an email to reply to. Try reading an email first, then ask me to write a reply.";
        setAgentResponse(errorMsg);
        await speakResponse(errorMsg);
        return;
      }
      
      console.log(`🔍 Auto-generating reply for thread: ${threadToUse.id}`);
      
      // Generate a contextual reply using AI
      const replyDraft = await emailService.generateContextualReply(threadToUse.id, token);
      
      // Store the pending reply and set up edit mode
      setPendingReply(replyDraft);
      pendingReplyRef.current = replyDraft; // Also set the ref for reliability
      setOriginalReply(replyDraft);
      originalReplyRef.current = replyDraft;
      setAwaitingConfirmation(true);
      awaitingConfirmationRef.current = true; // Also set the ref for reliability
      setIsEditMode(true);
      isEditModeRef.current = true;
      
      // Ask for edits instead of confirmation
      const editMessage = `Here's your reply:\n\n${replyDraft}\n\nDo you have any edits?`;
      setAgentResponse(editMessage);
      await speakResponse(`Here's your reply: ${replyDraft}. Do you have any edits?`);
      
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
    console.log('🚀 SENDING CONFIRMED REPLY - Starting...');
    console.log('🔍 Pending reply:', pendingReply);
    console.log('🔍 Pending reply ref:', pendingReplyRef.current);
    console.log('🔍 Thread to use:', currentThread || currentThreadRef.current);
    
    setAgentResponse('Sending your reply...');
    
    try {
      // Send the email using the pending reply (use ref as fallback if state is lost)
      const threadToUse = currentThread || currentThreadRef.current;
      const replyToSend = pendingReply || pendingReplyRef.current;
      
      if (!replyToSend) {
        throw new Error('No reply content available');
      }
      
      console.log('🔍 Sending reply to thread:', threadToUse.id);
      console.log('🔍 Reply content length:', replyToSend.length);
      await emailService.sendReply(threadToUse.id, replyToSend, token);
      
      // Reset states
      setPendingReply('');
      pendingReplyRef.current = ''; // Also reset the ref
      setAwaitingConfirmation(false);
      awaitingConfirmationRef.current = false; // Also reset the ref
      
      // Reset edit mode state
      setIsEditMode(false);
      isEditModeRef.current = false;
      setEditHistory([]);
      editHistoryRef.current = [];
      setOriginalReply('');
      originalReplyRef.current = '';
      
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

  // Handle edit requests and send commands
  const handleEditRequest = async (text: string) => {
    console.log('✏️ HANDLING EDIT REQUEST - Text:', text);
    
    const lowerText = text.toLowerCase();
    
    // Check if user wants to send the email (more specific)
    if (lowerText.includes('send it') || lowerText === 'send' || lowerText === 'yes' || lowerText === 'okay' || lowerText === 'ok' || lowerText.includes('go ahead')) {
      console.log('✅ DETECTED SEND COMMAND - Sending email...');
      await handleSendConfirmedReply();
      return;
    }
    
    // Check if user wants to cancel (more specific)
    if (lowerText === 'cancel' || lowerText === 'no' || lowerText === 'stop' || lowerText.includes('don\'t send') || lowerText.includes('cancel the')) {
      console.log('❌ DETECTED CANCEL COMMAND - Cancelling reply...');
      await handleCancelReply();
      return;
    }
    
    // User provided edit feedback - regenerate the reply
    console.log('✏️ DETECTED EDIT FEEDBACK - Regenerating reply...');
    
    try {
      setAgentResponse('Generating updated reply...');
      
      // Get the current reply to edit
      const currentReply = pendingReply || pendingReplyRef.current;
      if (!currentReply) {
        throw new Error('No reply content available for editing');
      }
      
      // Add this edit to history
      const newEditHistory = [...editHistory, text];
      setEditHistory(newEditHistory);
      editHistoryRef.current = newEditHistory;
      
      // Generate updated reply with edit feedback
      const threadToUse = currentThread || currentThreadRef.current;
      if (!threadToUse) {
        throw new Error('No thread context available');
      }
      
      // Use the new edit-aware API
      const updatedReply = await emailService.editReply(
        threadToUse.id, 
        currentReply,
        text,
        token
      );
      
      // Update the pending reply
      setPendingReply(updatedReply);
      pendingReplyRef.current = updatedReply;
      
      // Ask for more edits
      const editMessage = `Here's your updated reply:\n\n${updatedReply}\n\nDo you have any edits?`;
      setAgentResponse(editMessage);
      await speakResponse(`Here's your updated reply: ${updatedReply}. Do you have any edits?`);
      
      console.log('✅ Reply updated with edit feedback');
    } catch (error) {
      console.error('❌ Error handling edit request:', error);
      const errorMsg = "Sorry, I had trouble updating that reply. Please try again.";
      setAgentResponse(errorMsg);
      await speakResponse(errorMsg);
    }
  };

  // Handle cancelled reply
  const handleCancelReply = async () => {
    setPendingReply('');
    pendingReplyRef.current = ''; // Also reset the ref
    setAwaitingConfirmation(false);
    awaitingConfirmationRef.current = false; // Also reset the ref
    
    // Reset edit mode state
    setIsEditMode(false);
    isEditModeRef.current = false;
    setEditHistory([]);
    editHistoryRef.current = [];
    setOriginalReply('');
    originalReplyRef.current = '';
    
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
      elevenLabsTTS.stop();
      console.log('Method 1: Direct elevenLabsTTS.stop() called');
      
      // Method 2: Restart with empty text to interrupt
      elevenLabsTTS.speak('', {
        onStart: () => { elevenLabsTTS.stop(); },
        onError: () => { elevenLabsTTS.stop(); },
      });
      console.log('Method 2: Empty speech interruption');
      
      // Method 3: Multiple stops with delays
      setTimeout(() => elevenLabsTTS.stop(), 10);
      setTimeout(() => elevenLabsTTS.stop(), 50);
      setTimeout(() => elevenLabsTTS.stop(), 100);
      setTimeout(() => elevenLabsTTS.stop(), 200);
      setTimeout(() => elevenLabsTTS.stop(), 500);
      
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
    
    // Reset wake word detection flag
    wakeWordJustDetectedRef.current = false;
    
    // Reset command processed flag
    commandProcessedRef.current = false;
    
    
    
    // Restart background listening after closing voice agent
    setTimeout(() => {
      console.log('🎧 Restarting background listening after voice agent closed...');
      startBackgroundListening();
    }, 1500); // Increased delay to ensure voice agent is fully closed
    
    console.log('🚨 EMERGENCY SHUTDOWN COMPLETE');
  };

  const onSpeechStart = (event: any) => {
    console.log('Speech recognition started:', event);
    // If we were in that "10 s follow‑up" window, cancel the auto–stop
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    setVoiceText('Listening...');
    finalRecognizedTextRef.current = ''; // Reset the final text
  };

  // Wake word detection handler
  const onWakeWordResults = async (event: any) => {
    console.log('🎧 WAKE WORD RESULTS RECEIVED:', event);
    const results = event.value || [];
    const text = results[0]?.toLowerCase() || '';
    
    console.log('🔍 Wake word check - text:', text);
    console.log('🔍 Wake word check - isWakeWordListening:', isWakeWordListening);
    
    // ALWAYS process wake words, even during command processing
    // This allows interruption with "Dixie" at any time
    
    // Check for "dixie"
    if (
      text.includes('dixie') ||
      text.includes('dixey') ||
      text.includes('taxi')
    ) {
      console.log('🎯 WAKE WORD DETECTED! Opening voice agent...');
      
      // If TTS is speaking, interrupt it immediately
      if (isTtsSpeaking) {
        console.log('🛑 Interrupting TTS for wake word');
        elevenLabsTTS.stop();
        setIsTtsSpeaking(false);
      }
      
      // If currently processing, interrupt it IMMEDIATELY
      if (isProcessingCommand) {
        console.log('🛑 EMERGENCY INTERRUPTION - Stopping all processing for wake word');
        setIsProcessingCommand(false);
        commandProcessedRef.current = false; // Reset command processed flag
        
        // Set global cancellation flag to stop all processing
        globalCancellationFlagRef.current = true;
        console.log('🛑 Set global cancellation flag to true');
        
        // IMMEDIATELY stop any ongoing TTS
        if (isTtsSpeaking) {
          console.log('🛑 EMERGENCY STOP - Stopping TTS immediately');
          elevenLabsTTS.stop();
          setIsTtsSpeaking(false);
        }
        
        // Set speech kill switch to prevent any new TTS
        setSpeechKillSwitch(true);
        speechKillSwitchRef.current = true;
        console.log('🛑 EMERGENCY STOP - Set speech kill switch to true');
        
        // Clear any pending responses, but preserve meaningful responses like summaries
        const currentResponse = agentResponse;
        if (!currentResponse || 
            currentResponse === 'Processing your request...' || 
            currentResponse === 'Generating inbox summary...' || 
            currentResponse === 'Looking for that email...' ||
            currentResponse === 'Ready for your next command...') {
          setAgentResponse('');
        }
        setVoiceText('');
        
        // Stop any ongoing API calls by setting a flag that prevents new ones
        console.log('🛑 EMERGENCY STOP - Preventing any new API calls');
        return; // Exit immediately to prevent any further processing
      }
      
      // Stop wake word detection
      stopWakeWordDetection();
      
              // Open voice agent and start listening immediately
        setShowVoiceAgent(true);
        setAgentResponse('Voice agent ready! Listening...');
        setIsVoiceAgentClosed(false);
        setSpeechKillSwitch(false);
        speechKillSwitchRef.current = false;
        
        // Reset flags for new session (but keep wake word flag for a bit to prevent immediate re-triggering)
        globalCancellationFlagRef.current = false;
        commandProcessedRef.current = false;
        console.log('🔄 Reset processing flags for new session');
        
        // Reset wake word flag after a delay to prevent immediate re-triggering
        setTimeout(() => {
          wakeWordJustDetectedRef.current = false;
          console.log('🔄 Reset wake word flag after delay');
        }, 2000); // 2 second delay
      
      // Start listening immediately after wake word detection
      setTimeout(async () => {
        // Say "ready" first, then start listening
        // Check if we're still in the same wake word session to prevent duplicates
        if (wakeWordJustDetectedRef.current && showVoiceAgent) {
          await speakResponse('Ready');
          startListening();
        }
      }, 0);
      
      // Restart wake word detection after a delay
      setTimeout(() => {
        if (!showVoiceAgent) {
          startWakeWordDetection();
        }
      }, 5000);
    }
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

  // Reset all voice agent flags
  const resetVoiceAgentFlags = () => {
    console.log('🔄 Resetting all voice agent flags...');
    wakeWordDetectionInProgressRef.current = false;
    wakeWordJustDetectedRef.current = false;
    justStartedListeningRef.current = false;
    commandProcessedRef.current = false;
    globalCancellationFlagRef.current = false;
    speechKillSwitchRef.current = false;
    setIsWakeWordListening(false);
    setIsListening(false);
    setListeningAnimation(false);
    
    // DON'T close voice agent if we're awaiting confirmation
    // This prevents the UI from disappearing when user wants to say "yes"
    const isAwaitingConfirmation = awaitingConfirmation || awaitingConfirmationRef.current;
    if (!isAwaitingConfirmation) {
      setShowVoiceAgent(false);
 // Reset the ref when closing the UI
    } else {
      console.log('🔄 Keeping voice agent open - awaiting confirmation');
    }
    
    setVoiceText('');
    
    // Only clear agent response if it's not a meaningful response (like a summary or email content)
    const currentResponse = agentResponse;
    if (!currentResponse || 
        currentResponse === 'Processing your request...' || 
        currentResponse === 'Generating inbox summary...' || 
        currentResponse === 'Looking for that email...' ||
        currentResponse === 'Ready for your next command...') {
      setAgentResponse('');
    }
    
    // DON'T reset confirmation state - preserve awaitingConfirmation and pendingReply
    // This allows "yes" commands to work after speech recognition errors
    console.log('🔄 Preserving confirmation state - awaitingConfirmation:', awaitingConfirmation, 'ref:', awaitingConfirmationRef.current, 'pendingReply:', pendingReply ? 'exists' : 'none', 'pendingReplyRef:', pendingReplyRef.current ? 'exists' : 'none');
    
    setIsProcessingCommand(false);
    setIsTtsSpeaking(false);
  };

  const onSpeechError = (error: any) => {
    console.log('Speech recognition error:', error);
    const code = error.error?.code;
    const msg = error.error?.message || '';
  
    // 1) Ignore "no speech detected" (1110)
    if (code === '1110' || msg.includes('No speech detected')) {
      console.log('No speech detected—keeping listening UI active.');
      return;
    }
  
    // 2) Ignore "already started" errors and retry wake‑word detection
    if (msg.includes('already started') || msg.includes('Speech recognition already started')) {
      console.log('Ignoring "already started" error and retrying wake‑word detection...');
      // clear the in‑progress flag so startWakeWordDetection can run again
      wakeWordDetectionInProgressRef.current = false;
      setIsWakeWordListening(false);
      setTimeout(() => startWakeWordDetection(), 1000);
      return;
    }
  
    // 3) All other errors: tear down the listening UI
    setIsListening(false);
    setListeningAnimation(false);
    pulseAnim.stopAnimation();
  
    // Show user‑friendly fallback
    setVoiceText('Speech recognition failed. Please try again.');
    setAgentResponse('There was an error with speech recognition. Please use the text input.');
  };
  
  const onSpeechResults = (event: any) => {
    try {
      console.log('Speech results received:', event);
      console.log('🔍 Speech results - isWakeWordListening:', isWakeWordListening);
      console.log('🔍 Speech results - showVoiceAgent:', showVoiceAgent);
    
    // If we're in wake word detection mode, use wake word handler
    if (isWakeWordListening) {
      console.log('🎧 Routing to wake word handler...');
      onWakeWordResults(event);
      return;
    }
    
    // ALWAYS check for wake word "dixie" regardless of state
    // This allows interruption during TTS and processing
    const results = event.value || [];
    const text = results[0]?.toLowerCase() || '';
    
    // ALWAYS process wake words, even during command processing
    // This allows interruption with "Dixie" at any time
    // REMOVED wakeWordJustDetectedRef check to allow immediate interruption
    
    if (text.includes('dixie') || text.includes('dixey') || text.includes('taxi')) {
      // Prevent multiple simultaneous wake word detections
      if (wakeWordJustDetectedRef.current) {
        console.log('🛑 Wake word already detected, ignoring duplicate');
        return;
      }
      
      console.log('🎯 WAKE WORD DETECTED! Starting listening...');
      wakeWordJustDetectedRef.current = true;
      
      // If TTS is speaking, interrupt it immediately
      if (isTtsSpeaking) {
        console.log('🛑 Interrupting TTS for new wake word');
        elevenLabsTTS.stop();
        setIsTtsSpeaking(false);
      }
      
      // If currently processing, interrupt it IMMEDIATELY
      if (isProcessingCommand) {
        console.log('🛑 EMERGENCY INTERRUPTION - Stopping all processing for wake word');
        setIsProcessingCommand(false);
        commandProcessedRef.current = false; // Reset command processed flag
        
        // Set global cancellation flag to stop all processing
        globalCancellationFlagRef.current = true;
        console.log('🛑 Set global cancellation flag to true');
        
        // IMMEDIATELY stop any ongoing TTS
        if (isTtsSpeaking) {
          console.log('🛑 EMERGENCY STOP - Stopping TTS immediately');
          elevenLabsTTS.stop();
          setIsTtsSpeaking(false);
        }
        
        // Set speech kill switch to prevent any new TTS
        setSpeechKillSwitch(true);
        speechKillSwitchRef.current = true;
        console.log('🛑 EMERGENCY STOP - Set speech kill switch to true');
        
        // Clear any pending responses, but preserve meaningful responses like summaries
        const currentResponse = agentResponse;
        if (!currentResponse || 
            currentResponse === 'Processing your request...' || 
            currentResponse === 'Generating inbox summary...' || 
            currentResponse === 'Looking for that email...' ||
            currentResponse === 'Ready for your next command...') {
          setAgentResponse('');
        }
        setVoiceText('');
        
        // Stop any ongoing API calls by setting a flag that prevents new ones
        console.log('🛑 EMERGENCY STOP - Preventing any new API calls');
      }
      
      // Handle wake word detection - either open voice agent or restart listening
      if (!showVoiceAgent) {
        // Voice agent is closed - open it and start listening
        console.log('🎯 Wake word detected - opening voice agent and starting listening...');
        
        // Stop background listening first
        stopBackgroundListening();
        
        // Set flag to ignore the next speech result (which will be the wake word)
        setIgnoreNextSpeechResult(true);
        console.log('🚫 Set ignoreNextSpeechResult to true');
        
        // Open voice agent immediately and set all flags
        console.log('🎯 Setting showVoiceAgent to true...');
        setShowVoiceAgent(true);

        setAgentResponse('Voice agent ready! Starting listening...');
        setIsVoiceAgentClosed(false);
        setSpeechKillSwitch(false);
        speechKillSwitchRef.current = false;
        
        // Debug: Log the state after setting
        setTimeout(() => {
          console.log('🎯 Debug - showVoiceAgent state after setting:', showVoiceAgent);
  
        }, 100);
      } else {
        // Voice agent is already open - just restart listening
        console.log('🎯 Wake word detected - voice agent already open, restarting listening...');
        
        // Stop any current listening
        stopListening();
        
        // Set flag to ignore the next speech result (which will be the wake word)
        setIgnoreNextSpeechResult(true);
        console.log('🚫 Set ignoreNextSpeechResult to true');
        
        // Set agent response
        setAgentResponse('Restarting listening...');
      }
        
                  // Automatically start listening after a short delay
          setTimeout(() => {
            console.log('🎤 Auto-starting listening after wake word...');
            
            // Ensure any existing speech recognition is stopped first
            if (Voice && typeof Voice.stop === 'function') {
              try {
                Voice.stop();
                console.log('🎤 Stopped any existing speech recognition before starting');
              } catch (error) {
                console.log('🎤 Error stopping existing speech recognition:', error);
              }
            }
            
            // Play a "Ready!" sound and start listening when it completes
            if (typeof elevenLabsTTS.speak === 'function') {
              console.log('🎤 Speaking "Ready!" before starting to listen...');
              setIsTtsSpeaking(true);
              
              elevenLabsTTS.speak('Ready!', {
                onDone: () => {
                  console.log('🎤 "Ready!" completed, starting to listen...');
                  setIsTtsSpeaking(false);
                  // Add a small delay to ensure speech is fully stopped
                  setTimeout(() => {
                    startListening();
                  }, 200);
                },
                onError: (error: any) => {
                  console.error('Speech error:', error);
                  setIsTtsSpeaking(false);
                  // Add a small delay to ensure speech is fully stopped
                  setTimeout(() => {
                    startListening();
                  }, 200);
                },
                onStart: () => {
                  console.log('🎤 "Ready!" started speaking...');
                },
              });
            } else {
              // Fallback if speech is not available
              console.log('🎤 Speech not available, starting to listen immediately...');
              startListening();
            }
            
          }, 1000); // Increased delay to ensure background listening is fully stopped
      
      // Reset wake word detection flag after a delay to allow future detections
      setTimeout(() => {
        wakeWordJustDetectedRef.current = false;
        console.log('🔄 Reset wake word detection flag - ready for next detection');
      }, 3000);
      
      return;
    }
    
    // ONLY process commands when the red microphone is showing "Listening..."
    // This ensures commands are only processed when the user sees the listening UI
    if (!isListeningRef.current) {
      console.log('Not actively listening (red microphone not showing), ignoring speech results');
      return;
    }
    
    // Don't process results if we're already processing a command
    if (isProcessingCommand) {
      console.log('Already processing command, ignoring speech results');
      return;
    }
    
    // Don't process results if wake word was just detected
    if (wakeWordJustDetectedRef.current) {
      console.log('🚫 Wake word just detected, ignoring speech results until listening starts');
      return;
    }
    
    // Check if we should ignore this speech result (wake word)
    if (ignoreNextSpeechResult) {
      console.log('🚫 Ignoring speech result (wake word):', event.value);
      console.log('🚫 Current ignoreNextSpeechResult state:', ignoreNextSpeechResult);
      setIgnoreNextSpeechResult(false);
      console.log('🚫 Reset ignoreNextSpeechResult to false');
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
        if (isListeningRef.current && !isProcessingCommand && !justStartedListeningRef.current) {
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
          if (finalText && finalText !== 'Listening...' && finalText.trim() !== '') {
            processVoiceCommand(finalText);
          } else {
            console.log('🔥 No valid text to process, just stopping listening');
            startWakeWordDetection();
          }
        }
      }, 7000); // Increased to 7 second silence timeout
      
      setSilenceTimeout(newTimeout);
    }
    } catch (error) {
      console.error('Error in onSpeechResults:', error);
      // Don't crash the app, just log the error
    }
  };

  const onSpeechPartialResults = (event: any) => {
    // ONLY update partial results when actively listening (red microphone showing)
    if (!isListeningRef.current) {
      return;
    }
    
    const results = event.value;
    if (results && results.length > 0) {
      setVoiceText(results[0]);
    }
  };

  const startListening = async () => {
    try {
      console.log('🎤 MIC BUTTON CLICKED - Starting voice recognition...');
      console.log('Voice module available:', !!Voice);
      
      // If TTS is speaking, interrupt it immediately (same as wake word)
      if (isTtsSpeaking) {
        console.log('🛑 Interrupting TTS for mic button click');
        elevenLabsTTS.stop();
        setIsTtsSpeaking(false);
      }
      
      // If currently processing, interrupt it (same as wake word)
      if (isProcessingCommand) {
        console.log('🛑 Interrupting command processing for mic button click');
        setIsProcessingCommand(false);
        commandProcessedRef.current = false; // Reset command processed flag
        
        // Set global cancellation flag to stop all processing
        globalCancellationFlagRef.current = true;
        console.log('🛑 Set global cancellation flag to true');
      }
      
      // Don't start if already listening
      if (isListening) {
        console.log('Already listening, not starting again');
        return;
      }
      
      // Stop background listening first to avoid conflicts
      console.log('🛑 Stopping background listening before starting active listening...');
      await stopBackgroundListening();
      
      // Longer delay to ensure background listening is fully stopped and Voice module is ready
      await new Promise(resolve => setTimeout(resolve, 0));
      
      setIsListening(true);
      setListeningAnimation(true);
      setVoiceText('Listening...');
      setAgentResponse('');
      isListeningRef.current = true;
      justStartedListeningRef.current = true;
      
      // Clear the just started flag after 2 seconds
      setTimeout(() => {
        justStartedListeningRef.current = false;
        console.log('🎤 Cleared justStartedListeningRef flag');
      }, 2000);
      
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
          console.log('Stopped existing recognition');
        } catch (e) {
          console.log('No existing recognition to stop');
        }
        
        // Small delay to ensure Voice module is ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Start voice recognition with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            await Voice.start('en-US');
            console.log('Voice recognition started successfully');
            break;
          } catch (error) {
            retryCount++;
            console.log(`Voice start attempt ${retryCount} failed:`, error);
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 300));
            } else {
              throw error;
            }
          }
        }
      
      // Reset wake word flag now that we're actively listening
      wakeWordJustDetectedRef.current = false;
      setIsProcessingCommand(false); // Reset processing flag
      console.log('🎤 Reset wakeWordJustDetectedRef to false - now actively listening');
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
          console.log('Voice recognition stopped');
        } catch (error) {
          console.log('Error stopping voice recognition:', error);
        }
      }
      
      // If voice agent is still open, start wake word detection
      if (showVoiceAgent && !isVoiceAgentClosed) {
        console.log('🎧 Voice agent still open, starting wake word detection...');
        setTimeout(() => {
          startWakeWordDetection();
        }, 500);
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
      
      // Reset all flags
      wakeWordDetectionInProgressRef.current = false;
      wakeWordJustDetectedRef.current = false;
      justStartedListeningRef.current = false;
      commandProcessedRef.current = false;
      globalCancellationFlagRef.current = false;
      speechKillSwitchRef.current = false;
      
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

  // Start background listening for wake words when component mounts
  useEffect(() => {
    console.log('🎧 Component mounted, setting up background listening...');
    // Start background listening after a longer delay for device stability
    const timer = setTimeout(() => {
      console.log('🎧 Timer fired, starting background listening...');
      try {
        startBackgroundListening();
      } catch (error) {
        console.error('Error starting background listening on mount:', error);
      }
    }, 0); // Increased delay for device stability
    
    return () => {
      console.log('🎧 Component unmounting, cleaning up background listening...');
      clearTimeout(timer);
      try {
        stopBackgroundListening();
      } catch (error) {
        console.error('Error stopping background listening on unmount:', error);
      }
    };
  }, []);

  // Start background listening for wake words
  const startBackgroundListening = async () => {
    console.log('🎧 startBackgroundListening called');
    console.log('🎧 Voice available:', !!Voice);
    
    if (!Voice) {
      console.log('🎧 Voice module not available for background listening');
      return;
    }
    
    try {
      console.log('🎧 Starting background listening...');
      
      // Use the proper wake word detection function instead of direct Voice.start
      await startWakeWordDetection();
      console.log('✅ Background listening started');
    } catch (error) {
      console.error('❌ Error starting background listening:', error);
      // Don't crash the app, just log the error
    }
  };

  // Stop background listening
  const stopBackgroundListening = async () => {
    console.log('🛑 Stopping background listening...');
    
    try {
      // Only stop if we're actually in background listening mode
      if (isWakeWordListening) {
        await stopWakeWordDetection();
        console.log('✅ Background listening stopped');
      } else {
        console.log('🛑 Background listening not active, skipping stop');
      }
    } catch (error) {
      console.error('❌ Error stopping background listening:', error);
      // Don't show this error to the user - it's expected sometimes
    }
  };

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
    try {
      setIsGeneratingSummary(true);
      setSummaryText('');
      
      const token = authContext?.token;
      if (!token) {
        showMessage({
          message: 'Error',
          description: 'Not authenticated',
          type: 'danger',
        });
        return;
      }

      const summary = await emailService.generateInboxSummary(token);
      setSummaryText(summary);
      setShowSummaryModal(true);
    } catch (error) {
      console.error('Error generating summary:', error);
      showMessage({
        message: 'Error',
        description: 'Failed to generate summary',
        type: 'danger',
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const processEmailsWithAI = async () => {
    try {
      setIsLoading(true);
      
      const token = authContext?.token;
      if (!token) {
        showMessage({
          message: 'Error',
          description: 'Not authenticated',
          type: 'danger',
        });
        return;
      }

      showMessage({
        message: 'Processing Emails',
        description: 'AI is analyzing your emails...',
        type: 'info',
      });

      // Call the new endpoint to process and label emails
      const response = await fetch(`https://dixieai.onrender.com/api/email/process-user-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accessToken: token
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        showMessage({
          message: 'Success!',
          description: `Processed ${result.processed} emails. Summary: ${result.summary.needsReply} need reply, ${result.summary.important} important updates`,
          type: 'success',
        });
        
        // Log the results for debugging
        console.log('Email processing results:', result);
        
        // You can store these results or use them for instant summaries
        // For now, just show the summary
        setSummaryText(`Email Analysis Complete!\n\nYou have:\n• ${result.summary.needsReply} emails that need your reply\n• ${result.summary.important} important updates\n• ${result.summary.marketing} marketing emails\n• ${result.summary.receipts} receipts\n• ${result.summary.other} other emails`);
        setShowSummaryModal(true);
      } else {
        throw new Error('Failed to process emails');
      }
    } catch (error) {
      console.error('Error processing emails:', error);
      showMessage({
        message: 'Error',
        description: 'Failed to process emails with AI',
        type: 'danger',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Speak the summary using text-to-speech (now consolidated with speakResponse)
  const speakSummary = (text: string) => {
    console.log('🎤 SPEAK SUMMARY CALLED - Text:', text.substring(0, 50) + '...');
    
    if (isTtsSpeaking) {
      console.log('🛑 Stopping current speech...');
      elevenLabsTTS.stop();
      setIsTtsSpeaking(false);
      return;
    }

    // Use the consolidated speakResponse function
    speakResponse(text);
  };



  // Stop speaking
  const stopSpeaking = () => {
    elevenLabsTTS.stop();
    setIsTtsSpeaking(false);
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
    if (!dateString) return 'No date';
    
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date string:', dateString);
      return 'Invalid Date';
    }
    
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
          <TouchableOpacity onPress={processEmailsWithAI} style={styles.aiButton} disabled={isLoading}>
            <Ionicons name="sparkles" size={24} color={isLoading ? "#ccc" : "#4285F4"} />
          </TouchableOpacity>
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
          {isWakeWordListening && (
            <View style={styles.wakeWordIndicator}>
              <Ionicons name="ear" size={12} color="#34A853" />
              <Text style={styles.wakeWordText}>Listening</Text>
            </View>
          )}
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
              {/* Processing Status */}
              {isProcessingCommand && (
                <View style={styles.listeningStatusContainer}>
                  <View style={styles.listeningIndicator}>
                    <Animated.View 
                      style={[
                        styles.listeningWave,
                        {
                          transform: [{ scale: pulseAnim }]
                        }
                      ]}
                    />
                    <Ionicons 
                      name="sync" 
                      size={32} 
                      color="#ff8800" 
                    />
                  </View>
                  <Text style={styles.listeningText}>
                    Processing your request...
                  </Text>
                </View>
              )}

              {/* Listening Status */}
              {isListening && !isProcessingCommand && (
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
                disabled={isProcessingCommand}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
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
                      name={isTtsSpeaking ? "pause" : "volume-high"} 
                      size={20} 
                      color={isTtsSpeaking ? "#FF6D01" : "#4285F4"} 
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
                  {isTtsSpeaking && (
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
  aiButton: {
    padding: 5,
    marginRight: 8,
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
  wakeWordIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  wakeWordText: {
    fontSize: 10,
    color: '#34A853',
    marginLeft: 4,
    fontWeight: '500',
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