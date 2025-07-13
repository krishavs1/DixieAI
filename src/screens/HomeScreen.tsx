import React, { useState } from 'react';
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
import { useAuthStore } from '../store/authStore';
import { useEmailThreads, useSearchEmails, EmailThread } from '../services/emailService';
import { showMessage } from 'react-native-flash-message';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Fetch email threads
  const { 
    data: threads = [], 
    isLoading, 
    error, 
    refetch 
  } = useEmailThreads();

  // Search emails
  const { 
    data: searchResults = [], 
    isLoading: isSearchLoading 
  } = useSearchEmails(searchQuery);

  // Use search results if searching, otherwise use regular threads
  const displayThreads = isSearching ? searchResults : threads;

  const handleThreadPress = (thread: EmailThread) => {
    (navigation as any).navigate('Chat', { threadId: thread.id, thread });
  };

  const handleVoiceCommand = () => {
    // TODO: Implement voice command functionality
    console.log('Voice command pressed');
    showMessage({
      message: 'Voice commands coming soon!',
      type: 'info',
    });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearching(query.length > 2);
  };

  const handleRefresh = () => {
    refetch();
  };

  const renderThread = ({ item }: { item: EmailThread }) => (
    <TouchableOpacity
      style={[styles.threadItem, item.isUnread && styles.unreadThread]}
      onPress={() => handleThreadPress(item)}
    >
      <View style={styles.threadHeader}>
        <Text style={styles.threadFrom} numberOfLines={1}>
          {item.from}
        </Text>
        <Text style={styles.threadTime}>{item.timestamp || item.date}</Text>
      </View>
      <Text style={styles.threadSubject} numberOfLines={1}>
        {item.subject}
      </Text>
      <Text style={styles.threadSnippet} numberOfLines={2}>
        {item.snippet}
      </Text>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="mail-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>
        {isSearching ? 'No search results' : 'No emails found'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isSearching 
          ? 'Try a different search term' 
          : 'Check your internet connection and try again'
        }
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="warning-outline" size={64} color="#EF4444" />
      <Text style={styles.errorTitle}>Unable to load emails</Text>
      <Text style={styles.errorSubtitle}>
        Please check your internet connection and try again
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  if (error && !threads.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.welcomeText}>
              Welcome back, {user?.name?.split(' ')[0]}!
            </Text>
            <TouchableOpacity onPress={logout} style={styles.logoutButton}>
              <Ionicons name="exit-outline" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
        {renderError()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.welcomeText}>
            Welcome back, {user?.name?.split(' ')[0]}!
          </Text>
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Ionicons name="exit-outline" size={24} color="#666" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Ask Dixie anything about your emails..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity onPress={handleVoiceCommand} style={styles.voiceButton}>
            <Ionicons name="mic" size={20} color="#4285F4" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="mail-unread" size={16} color="#4285F4" />
          <Text style={styles.actionText}>
            Unread ({threads.filter((t: EmailThread) => t.isUnread).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Text style={styles.actionText}>Starred</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="time" size={16} color="#10B981" />
          <Text style={styles.actionText}>Snoozed</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !threads.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>Loading your emails...</Text>
        </View>
      ) : (
        <FlatList
          data={displayThreads}
          renderItem={renderThread}
          keyExtractor={(item) => item.id}
          style={styles.threadsList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={renderEmpty}
        />
      )}

      {(isSearchLoading && isSearching) && (
        <View style={styles.searchLoadingContainer}>
          <ActivityIndicator size="small" color="#4285F4" />
          <Text style={styles.searchLoadingText}>Searching...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  logoutButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  voiceButton: {
    padding: 4,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 6,
  },
  threadsList: {
    flex: 1,
  },
  threadItem: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  unreadThread: {
    backgroundColor: '#F8FAFF',
  },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  threadFrom: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  threadTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  threadSubject: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 4,
  },
  threadSnippet: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchLoadingContainer: {
    position: 'absolute',
    top: 120,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchLoadingText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 6,
  },
});

export default HomeScreen; 