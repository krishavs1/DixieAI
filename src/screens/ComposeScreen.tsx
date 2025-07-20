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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AuthContext } from '../context/AuthContext';
import { emailService } from '../services/emailService';
import { useNavigation } from '@react-navigation/native';

interface Attachment {
  id: string;
  name: string;
  uri: string;
  type: 'image' | 'document';
  size?: number;
}

const ComposeScreen = ({ route }: any) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
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

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
        return false;
      }
    }
    return true;
  };

  const requestCameraPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Sorry, we need camera permissions to make this work!');
        return false;
      }
    }
    return true;
  };

  const handlePhotoPicker = async () => {
    setShowAttachmentMenu(false);
    
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment: Attachment = {
          id: Date.now().toString(),
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          uri: asset.uri,
          type: 'image',
          size: asset.fileSize,
        };
        setAttachments(prev => [...prev, newAttachment]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleCamera = async () => {
    setShowAttachmentMenu(false);
    
    const hasPermission = await requestCameraPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment: Attachment = {
          id: Date.now().toString(),
          name: `camera_${Date.now()}.jpg`,
          uri: asset.uri,
          type: 'image',
          size: asset.fileSize,
        };
        setAttachments(prev => [...prev, newAttachment]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleFilePicker = async () => {
    setShowAttachmentMenu(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment: Attachment = {
          id: Date.now().toString(),
          name: asset.name,
          uri: asset.uri,
          type: 'document',
          size: asset.size,
        };
        setAttachments(prev => [...prev, newAttachment]);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(attachment => attachment.id !== id));
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

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
      // Convert attachments to base64 if they exist
      const emailAttachments = attachments.length > 0 ? await Promise.all(
        attachments.map(async (attachment) => {
          try {
            // For images, we need to read the file and convert to base64
            if (attachment.type === 'image') {
              const response = await fetch(attachment.uri);
              const blob = await response.blob();
              return new Promise<{ name: string; data: string; mimeType: string }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = reader.result as string;
                  // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
                  const base64Data = base64.split(',')[1];
                  resolve({
                    name: attachment.name,
                    data: base64Data,
                    mimeType: 'image/jpeg', // Default to JPEG, could be enhanced to detect actual type
                  });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } else {
              // For documents, we need to read the file
              const response = await fetch(attachment.uri);
              const blob = await response.blob();
              return new Promise<{ name: string; data: string; mimeType: string }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = reader.result as string;
                  const base64Data = base64.split(',')[1];
                  resolve({
                    name: attachment.name,
                    data: base64Data,
                    mimeType: blob.type || 'application/octet-stream',
                  });
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch (error) {
            console.error('Error processing attachment:', error);
            throw new Error(`Failed to process attachment: ${attachment.name}`);
          }
        })
      ) : undefined;

      // Send email with attachments
      await emailService.sendEmail(token, {
        to: to.trim(),
        subject: subject.trim(),
        body: body.trim(),
        attachments: emailAttachments,
      });
      
      const attachmentMessage = attachments.length > 0 
        ? `\n\nEmail sent successfully with ${attachments.length} attachment(s)!`
        : '\n\nEmail sent successfully!';
      
      Alert.alert('Success', `Email sent successfully!${attachmentMessage}`, [
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
    switch (type) {
      case 'Photo':
        handlePhotoPicker();
        break;
      case 'Camera':
        handleCamera();
        break;
      case 'File':
        handleFilePicker();
        break;
    }
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

          {/* Attachments */}
          {attachments.length > 0 && (
            <View style={styles.attachmentsContainer}>
              <Text style={styles.attachmentsTitle}>Attachments ({attachments.length})</Text>
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.attachmentItem}>
                  {attachment.type === 'image' ? (
                    <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
                  ) : (
                    <View style={styles.attachmentIcon}>
                      <Ionicons name="document" size={24} color="#666" />
                    </View>
                  )}
                  <View style={styles.attachmentInfo}>
                    <Text style={styles.attachmentName} numberOfLines={1}>
                      {attachment.name}
                    </Text>
                    {attachment.size && (
                      <Text style={styles.attachmentSize}>
                        {formatFileSize(attachment.size)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeAttachment(attachment.id)}
                    style={styles.removeAttachmentButton}
                  >
                    <Ionicons name="close-circle" size={20} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
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
  attachmentsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  attachmentsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  attachmentImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
    marginRight: 10,
  },
  attachmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  attachmentInfo: {
    flex: 1,
    marginRight: 10,
  },
  attachmentName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  attachmentSize: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  removeAttachmentButton: {
    padding: 5,
  },
});

export default ComposeScreen; 