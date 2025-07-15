import React, { useState, useContext, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { emailService, EmailThread } from '../services/emailService';
import { showMessage } from 'react-native-flash-message';

const HomeScreen = () => {
  const navigation = useNavigation();
  const authContext = useContext(AuthContext);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (!authContext) {
    throw new Error('HomeScreen must be used within AuthProvider');
  }

  const { user, token, logout } = authContext;

  // Fetch threads on component mount and when token changes
  useEffect(() => {
    if (token) {
      fetchThreads();
    }
  }, [token]);

  const fetchThreads = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedThreads = await emailService.fetchThreads(token);
      setThreads(fetchedThreads);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to fetch emails';
      setError(errorMessage);
      console.error('Error fetching threads:', err);
      
      // Check if it's an authentication error
      if (errorMessage.includes('Authentication failed') || errorMessage.includes('Please log in again')) {
        showMessage({
          message: 'Your session has expired. Please log in again.',
          type: 'warning',
        });
        // Automatically log out the user
        logout();
      } else {
        showMessage({
          message: 'Failed to load emails',
          type: 'danger',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleThreadPress = (thread: EmailThread) => {
    (navigation as any).navigate('EmailDetail', { threadId: thread.id, thread });
  };

  const handleRefresh = () => {
    fetchThreads();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // For now, just filter locally - you can implement server search later
    // if (query.length > 2) {
    //   searchThreads(query);
    // }
  };

  const handleVoiceCommand = () => {
    showMessage({
      message: 'Voice commands coming soon!',
      type: 'info',
    });
  };

  const renderThread = ({ item }: { item: EmailThread }) => (
    <TouchableOpacity
      style={styles.threadItem}
      onPress={() => handleThreadPress(item)}
    >
      <View style={styles.threadHeader}>
        <Text style={styles.threadFrom} numberOfLines={1}>
          {item.from || 'Unknown'}
        </Text>
        <Text style={styles.threadTime}>
          {new Date(item.date).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.threadSubject} numberOfLines={1}>
        {item.subject}
      </Text>
      <Text style={styles.threadSnippet} numberOfLines={2}>
        {item.snippet}
      </Text>
      <View style={styles.threadFooter}>
        <Text style={styles.messageCount}>
          {item.messageCount} message{item.messageCount !== 1 ? 's' : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

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
          <Text style={styles.greeting}>Welcome back, {user?.name || 'User'}!</Text>
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

        {/* Quick Actions */}
      <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleRefresh}>
            <Ionicons name="refresh" size={16} color="#4285F4" />
            <Text style={styles.actionText}>Refresh</Text>
          </TouchableOpacity>
          
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="mail-unread" size={16} color="#4285F4" />
            <Text style={styles.actionText}>
              Threads ({threads.length})
            </Text>
        </TouchableOpacity>
          
        <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="create" size={16} color="#4285F4" />
            <Text style={styles.actionText}>Compose</Text>
        </TouchableOpacity>
        </View>
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
          <Text style={styles.loadingText}>Loading emails...</Text>
        </View>
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
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
  },
  actionText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '500',
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
    fontWeight: '600',
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
    fontWeight: '500',
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
});

export default HomeScreen; 