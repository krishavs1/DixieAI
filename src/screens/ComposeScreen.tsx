import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { emailService } from '../services/emailService';
import { useNavigation } from '@react-navigation/native';

const ComposeScreen = ({ route }: any) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  const { token } = useContext(AuthContext)!;
  const navigation = useNavigation();

  // Handle forward data if passed as navigation parameter
  React.useEffect(() => {
    if (route.params?.forwardData) {
      const { forwardData } = route.params;
      setSubject(forwardData.subject || '');
      setBody(forwardData.body || '');
    }
  }, [route.params]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      Alert.alert('Error', 'Please fill in all fields (To, Subject, and Body)');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!token) {
      Alert.alert('Error', 'Authentication required. Please log in again.');
      return;
    }

    setIsSending(true);
    try {
      await emailService.sendEmail(token, {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      
      Alert.alert('Success', 'Email sent successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error('Error sending email:', error);
      const errorMessage = error.message || 'Failed to send email. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    if (to.trim() || subject.trim() || body.trim()) {
      Alert.alert(
        'Discard Draft?',
        'Are you sure you want to discard this email?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() }
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleAttachment = (type: string) => {
    setShowAttachmentMenu(false);
    // TODO: Implement attachment functionality
    Alert.alert('Coming Soon', `${type} attachment functionality will be implemented soon!`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header with Action Buttons */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setShowAttachmentMenu(true)} 
              style={styles.headerButton}
            >
              <Ionicons name="attach" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.headerTitle}>New Message</Text>
          
          <TouchableOpacity 
            onPress={handleSend} 
            style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
            disabled={isSending}
          >
            <Ionicons 
              name="send" 
              size={20} 
              color={isSending ? '#ccc' : '#4285F4'} 
            />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* To Field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>To:</Text>
            <TextInput
              style={styles.textInput}
              value={to}
              onChangeText={setTo}
              placeholder="Recipients"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          {/* Subject Field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Subject:</Text>
            <TextInput
              style={styles.textInput}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor="#999"
              autoCapitalize="sentences"
            />
          </View>

          {/* Body Field */}
          <View style={styles.bodyContainer}>
            <TextInput
              style={styles.bodyInput}
              value={body}
              onChangeText={setBody}
              placeholder="Write your message here..."
              placeholderTextColor="#999"
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </View>
        </ScrollView>

        {/* Attachment Menu Modal */}
        <Modal
          visible={showAttachmentMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAttachmentMenu(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowAttachmentMenu(false)}
          >
            <View style={styles.attachmentMenu}>
              <TouchableOpacity 
                style={styles.attachmentOption}
                onPress={() => handleAttachment('Photo')}
              >
                <Ionicons name="image" size={20} color="#666" />
                <Text style={styles.attachmentText}>Photo</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.attachmentOption}
                onPress={() => handleAttachment('Camera')}
              >
                <Ionicons name="camera" size={20} color="#666" />
                <Text style={styles.attachmentText}>Camera</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.attachmentOption}
                onPress={() => handleAttachment('File')}
              >
                <Ionicons name="document" size={20} color="#666" />
                <Text style={styles.attachmentText}>File</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 2,
    textAlign: 'center',
  },
  sendButton: {
    padding: 8,
    flex: 1,
    alignItems: 'flex-end',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    width: 60,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
  },
  bodyContainer: {
    flex: 1,
    paddingTop: 16,
  },
  bodyInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    minHeight: 200,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentMenu: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    width: '80%',
    alignItems: 'center',
  },
  attachmentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    marginVertical: 5,
  },
  attachmentText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
});

export default ComposeScreen; 