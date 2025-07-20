import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

import { useNavigation } from '@react-navigation/native';
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
  const slideAnim = useState(new Animated.Value(-300))[0];

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
    // For now, trigger both classification and summary
    classifyEmailsForReply();
    generateInboxSummary();
    
    // TODO: Add voice recognition later
    // showMessage({
    //   message: 'Voice commands coming soon!',
    //   type: 'info',
    // });
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
    console.log('Current speech state:', { isSpeaking, speechRate });
    
    if (isSpeaking) {
      console.log('Stopping current speech...');
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    console.log('Starting speech with rate:', speechRate);
    
    Speech.speak(text, {
      language: 'en-US',
      pitch: 1.0,
      rate: speechRate,
      onDone: () => {
        console.log('Speech completed successfully');
        setIsSpeaking(false);
      },
      onError: (error) => {
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
      { language: 'en-US', pitch: 1.0, rate: 0.8 },
      { language: 'en', pitch: 1.0, rate: 1.0 },
      { language: 'en-US', pitch: 1.2, rate: 0.6 },
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
      
      Speech.speak(`Test ${configIndex + 1}: Hello, this is Dixie speaking.`, {
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
            {item.isImportant && (
              <View style={styles.importantBadge}>
                <Ionicons name="alert-circle" size={12} color="#fff" />
                <Text style={styles.importantBadgeText}>Important</Text>
              </View>
            )}
            {item.labels && item.labels.slice(0, 3).map((labelId) => {
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
            {getCategoryInfo().find(cat => cat.id === currentCategory)?.name || 'Primary'}
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
          <TouchableOpacity onPress={testBadges} style={styles.testButton}>
            <Ionicons name="bug" size={20} color="#FF6D01" />
          </TouchableOpacity>
          <TouchableOpacity onPress={generateInboxSummary} style={styles.summaryButton}>
            <Ionicons name="analytics" size={20} color="#34A853" />
          </TouchableOpacity>
          <TouchableOpacity onPress={testSpeech} style={styles.testButton}>
            <Ionicons name="volume-high" size={20} color="#9C27B0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={showSpeechTips} style={styles.testButton}>
            <Ionicons name="help-circle" size={20} color="#607D8B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={testBasicAudio} style={styles.testButton}>
            <Ionicons name="musical-notes" size={20} color="#FF5722" />
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
                  <>
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
                    <TouchableOpacity 
                      onPress={adjustSpeechRate}
                      style={styles.speedButton}
                    >
                      <Text style={styles.speedText}>{speechRate}x</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity onPress={() => setShowSummaryModal(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
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
  voiceButton: {
    padding: 5,
  },
  testButton: {
    padding: 5,
  },
  summaryButton: {
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
});

export default HomeScreen; 