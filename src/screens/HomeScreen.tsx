import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';

// Mock data for now
const mockThreads = [
  {
    id: '1',
    subject: 'Meeting tomorrow at 2 PM',
    from: 'john@company.com',
    snippet: 'Hey, just confirming our meeting tomorrow at 2 PM in the conference room...',
    timestamp: '2h ago',
    isUnread: true,
  },
  {
    id: '2',
    subject: 'Project update required',
    from: 'sarah@company.com',
    snippet: 'Hi team, we need to update the project timeline based on the new requirements...',
    timestamp: '4h ago',
    isUnread: false,
  },
  {
    id: '3',
    subject: 'Invoice #12345',
    from: 'billing@service.com',
    snippet: 'Your monthly invoice is ready. Please find the details attached...',
    timestamp: '1d ago',
    isUnread: true,
  },
];

const HomeScreen = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [threads] = useState(mockThreads);

  const handleThreadPress = (thread: any) => {
    navigation.navigate('Chat', { threadId: thread.id, thread });
  };

  const handleVoiceCommand = () => {
    // TODO: Implement voice command functionality
    console.log('Voice command pressed');
  };

  const renderThread = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.threadItem, item.isUnread && styles.unreadThread]}
      onPress={() => handleThreadPress(item)}
    >
      <View style={styles.threadHeader}>
        <Text style={styles.threadFrom} numberOfLines={1}>
          {item.from}
        </Text>
        <Text style={styles.threadTime}>{item.timestamp}</Text>
      </View>
      <Text style={styles.threadSubject} numberOfLines={1}>
        {item.subject}
      </Text>
      <Text style={styles.threadSnippet} numberOfLines={2}>
        {item.snippet}
      </Text>
    </TouchableOpacity>
  );

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
            onChangeText={setSearchQuery}
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
          <Text style={styles.actionText}>Unread (2)</Text>
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

      <FlatList
        data={threads}
        renderItem={renderThread}
        keyExtractor={(item) => item.id}
        style={styles.threadsList}
        showsVerticalScrollIndicator={false}
      />
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
});

export default HomeScreen; 