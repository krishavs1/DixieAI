import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import EmailRenderer from '../components/EmailRenderer';
import * as Speech from 'expo-speech';
import { emailService } from '../services/emailService';

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
  const [originalMessage, setOriginalMessage] = useState<any>(null);
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [replySource, setReplySource] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showVoiceAgent, setShowVoiceAgent] = useState(false);
  const [agentResponse, setAgentResponse] = useState('');
  const [isAgentProcessing, setIsAgentProcessing] = useState(false);
  
  const { token } = useContext(AuthContext)!;
  const navigation = useNavigation();

  // Voice Recognition Setup
  useEffect(() => {
    // Voice commands are now handled through text input
    return () => {
      // Cleanup if needed
    };
  }, []);

  const onSpeechStart = () => {
    setIsListening(true);
    setVoiceText('');
  };

  const onSpeechEnd = () => {
    setIsListening(false);
  };

  const onSpeechError = (error: any) => {
    setIsListening(false);
    console.error('Speech recognition error:', error);
    Alert.alert('Voice Error', 'Failed to recognize speech. Please try again.');
  };

  const onSpeechResults = (event: any) => {
    const results = event.value;
    if (results && results.length > 0) {
      const recognizedText = results[0];
      setVoiceText(recognizedText);
      processVoiceCommand(recognizedText);
    }
  };

  const onSpeechPartialResults = (event: any) => {
    const results = event.value;
    if (results && results.length > 0) {
      setVoiceText(results[0]);
    }
  };

  const startListening = async () => {
    try {
      setShowVoiceAgent(true);
      setIsListening(true);
      setAgentResponse('');
      speakFeedback('Voice agent ready. How can I help you?');
    } catch (error) {
      console.error('Error starting voice agent:', error);
      Alert.alert('Voice Error', 'Failed to start voice agent.');
    }
  };

  const stopListening = async () => {
    try {
      setShowVoiceAgent(false);
      setIsListening(false);
      setVoiceText('');
      setAgentResponse('');
    } catch (error) {
      console.error('Error stopping voice agent:', error);
    }
  };

  const processVoiceCommand = async (text: string) => {
    const lowerText = text.toLowerCase();
    
   
    if (lowerText.includes('summarize') && lowerText.includes('inbox')) {
      await summarizeInbox();
    } else if (lowerText.includes('close') || lowerText.includes('exit')) {
      stopListening();
      speakFeedback('Closing voice agent');
    } else if (lowerText.includes('help')) {
      setAgentResponse('I can help you with:\n• Summarize inbox\n• Close voice agent\n• Help with commands');
      speakFeedback('Here are the available commands');
    } else {
      setAgentResponse('I heard: "' + text + '"\n\nI can help you summarize your inbox. Try saying "Summarize my inbox"');
      speakFeedback('I can help you summarize your inbox');
    }
  };

  const summarizeInbox = async () => {
    setIsAgentProcessing(true);
    setAgentResponse('Analyzing your inbox...');
    
    try {
      // Call the email service to get inbox data
      const response = await fetch('http://localhost:3000/api/email/threads', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const threads = data.threads || [];
        
        // Analyze inbox
        const unreadCount = threads.filter((t: any) => t.isUnread).length;
        const totalCount = threads.length;
        const recentThreads = threads.slice(0, 5);
        
        const summary = `📧 Inbox Summary:\n\n` +
          `• Total emails: ${totalCount}\n` +
          `• Unread emails: ${unreadCount}\n` +
          `• Recent emails: ${recentThreads.length}\n\n` +
          `Recent emails:\n${recentThreads.map((t: any, i: number) => 
            `${i + 1}. ${t.subject || 'No subject'} (${t.isUnread ? 'Unread' : 'Read'})`
          ).join('\n')}`;
        
        setAgentResponse(summary);
        speakFeedback(`You have ${unreadCount} unread emails out of ${totalCount} total emails`);
      } else {
        setAgentResponse('Sorry, I could not access your inbox at the moment.');
        speakFeedback('Unable to access inbox');
      }
    } catch (error) {
      console.error('Error summarizing inbox:', error);
      setAgentResponse('Sorry, there was an error accessing your inbox.');
      speakFeedback('Error accessing inbox');
    } finally {
      setIsAgentProcessing(false);
    }
  };

  const handleVoiceInputSubmit = () => {
    if (voiceText.trim()) {
      processVoiceCommand(voiceText);
      setVoiceText('');
    }
  };

  const speakFeedback = (message: string) => {
    Speech.speak(message, {
      language: 'en',
      pitch: 1.0,
      rate: 0.9,
    });
  };

  // Helper function to strip HTML tags
  const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  };

  // Helper function to check if content is HTML
  const isHtmlContent = (content: string): boolean => {
    return /<[^>]*>/.test(content);
  };

  // AI Reply Generation Function
  const generateAIReply = async () => {
    if (!originalMessage || isGeneratingReply) return;
    
    setIsGeneratingReply(true);
    
    try {
      // Create a prompt for the AI based on the original message
      const originalContent = originalMessage.body || originalMessage.snippet || originalMessage.plainTextContent || '';
      const strippedContent = stripHtmlTags(originalContent);
      
      const prompt = `You are an AI email assistant. Generate a professional, contextual reply to this email:

Original Email:
From: ${originalMessage.from}
Subject: ${originalMessage.subject}
Content: ${strippedContent}

Please generate a concise, professional reply that:
1. Acknowledges the original message
2. Provides a relevant response
3. Maintains a professional tone
4. Is appropriate for the context

Keep the reply under 100 words and make it sound natural and human-written.`;

      // Call the AI service (you'll need to implement this endpoint)
      const response = await fetch('http://localhost:3000/api/ai/generate-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          context: {
            originalMessage: strippedContent,
            sender: originalMessage.from,
            subject: originalMessage.subject,
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setBody(data.reply || 'Thank you for your email. I will get back to you soon.');
        setReplySource(data.source || null);
        
        // Log the source of the generated reply
        if (data.source) {
          console.log(`Reply generated using: ${data.source}`);
        }
      } else {
        // Fallback to a simple template-based reply
        const fallbackReply = generateFallbackReply(originalMessage);
        setBody(fallbackReply);
        setReplySource('fallback');
      }
    } catch (error) {
      console.error('Error generating AI reply:', error);
      // Fallback to a simple template-based reply
      const fallbackReply = generateFallbackReply(originalMessage);
      setBody(fallbackReply);
      setReplySource('fallback');
    } finally {
      setIsGeneratingReply(false);
    }
  };

  // Fallback reply generator for when AI service is unavailable
  const generateFallbackReply = (message: any): string => {
    const content = message.body || message.snippet || message.plainTextContent || '';
    const strippedContent = stripHtmlTags(content).toLowerCase();
    
    // Simple keyword-based reply generation
    if (strippedContent.includes('thank you') || strippedContent.includes('thanks')) {
      return "You're welcome! Let me know if you need anything else.";
    } else if (strippedContent.includes('meeting') || strippedContent.includes('schedule')) {
      return "Thank you for reaching out. I'll review the details and get back to you shortly.";
    } else if (strippedContent.includes('project') || strippedContent.includes('deadline')) {
      return "Thanks for the update. I'll review this and follow up with any questions.";
    } else if (strippedContent.includes('question') || strippedContent.includes('help')) {
      return "Thank you for your question. I'll look into this and provide a detailed response soon.";
    } else {
      return "Thank you for your email. I've received your message and will respond in detail shortly.";
    }
  };

  // Handle forward data if passed as navigation parameter
  React.useEffect(() => {
    if (route.params?.forwardData) {
      const { forwardData } = route.params;
      setSubject(forwardData.subject || '');
      setBody(forwardData.body || '');
    }
    
    if (route.params?.replyData) {
      const { replyData } = route.params;
      setTo(replyData.to || '');
      setSubject(replyData.subject || '');
      setBody(''); // Start with empty body for reply
      setOriginalMessage(replyData.originalMessage); // Store the original message for quoting
      
      // Debug log to see what data we're getting
      console.log('Reply data received:', replyData);
      console.log('Original message:', replyData.originalMessage);
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
        threadId: route.params?.replyData?.threadId, // Include threadId for replies
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setShowAttachmentMenu(true)} style={styles.headerButton}>
            <Ionicons name="attach" size={24} color="#333" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>
            {route.params?.replyData ? 'Reply' : route.params?.forwardData ? 'Forward' : 'Compose'}
          </Text>
          
          <TouchableOpacity 
            onPress={isListening ? stopListening : startListening} 
            style={[styles.headerButton, isListening && styles.voiceButtonActive]}
          >
            <Ionicons 
              name={isListening ? "mic" : "mic-outline"} 
              size={24} 
              color={isListening ? "#FF4444" : "#333"} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Ionicons name="send" size={24} color="#4285F4" />
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
            
            {/* AI Reply Generation Button */}
            {originalMessage && (
              <TouchableOpacity
                style={[styles.aiButton, isGeneratingReply && styles.aiButtonDisabled]}
                onPress={generateAIReply}
                disabled={isGeneratingReply}
              >
                <Ionicons 
                  name={isGeneratingReply ? "hourglass-outline" : "sparkles"} 
                  size={16} 
                  color={isGeneratingReply ? "#999" : "#4285F4"} 
                />
                <Text style={[styles.aiButtonText, isGeneratingReply && styles.aiButtonTextDisabled]}>
                  {isGeneratingReply ? "Generating..." : "AI Reply"}
                </Text>
              </TouchableOpacity>
            )}
            
            {/* Reply Source Indicator */}
            {replySource && (
              <View style={styles.replySourceContainer}>
                <Ionicons 
                  name={replySource === 'openai' ? "checkmark-circle" : "information-circle"} 
                  size={14} 
                  color={replySource === 'openai' ? "#4CAF50" : "#FF9800"} 
                />
                <Text style={[styles.replySourceText, { color: replySource === 'openai' ? "#4CAF50" : "#FF9800" }]}>
                  {replySource === 'openai' ? 'AI Generated' : 'Template Generated'}
                </Text>
              </View>
            )}
            
            {/* Voice Feedback Display */}
            {isListening && (
              <View style={styles.voiceFeedbackContainer}>
                <Ionicons name="mic" size={20} color="#FF4444" />
                <Text style={styles.voiceFeedbackText}>
                  {voiceText || 'Listening...'}
                </Text>
              </View>
            )}
            
            {/* Quoted Text for Replies */}
            {originalMessage && (
              <View style={styles.quotedTextContainer}>
                <View style={styles.quotedTextHeader}>
                  <Text style={styles.quotedTextHeaderText}>
                    On {originalMessage.date ? new Date(originalMessage.date).toLocaleString() : 'Unknown date'} {originalMessage.from} wrote:
                  </Text>
                </View>
                <View style={styles.quotedTextContent}>
                  {isHtmlContent(originalMessage.body || originalMessage.snippet) ? (
                    <EmailRenderer html={originalMessage.body || originalMessage.snippet} />
                  ) : (
                    <Text style={styles.quotedTextBody}>
                      {originalMessage.body || originalMessage.snippet || originalMessage.plainTextContent || 'Original message content'}
                    </Text>
                  )}
                </View>
              </View>
            )}
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

        {/* Voice Input Modal */}
        <Modal
          visible={showVoiceInput}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowVoiceInput(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.voiceInputModal}>
              <Text style={styles.voiceInputTitle}>Voice Commands</Text>
              <Text style={styles.voiceInputSubtitle}>Type your command or email content:</Text>
              
              <TextInput
                style={styles.voiceInputField}
                value={voiceText}
                onChangeText={setVoiceText}
                placeholder="e.g., 'send email' or 'Hello, this is a test message'"
                placeholderTextColor="#999"
                multiline
                autoFocus
                onSubmitEditing={handleVoiceInputSubmit}
              />
              
              <View style={styles.voiceInputButtons}>
                <TouchableOpacity 
                  style={styles.voiceInputButton}
                  onPress={() => setShowVoiceInput(false)}
                >
                  <Text style={styles.voiceInputButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.voiceInputButton, styles.voiceInputButtonPrimary]}
                  onPress={handleVoiceInputSubmit}
                >
                  <Text style={[styles.voiceInputButtonText, styles.voiceInputButtonTextPrimary]}>
                    Execute
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Voice Agent UI - Bottom Panel */}
        {showVoiceAgent && (
          <View style={styles.voiceAgentContainer}>
            <View style={styles.voiceAgentHeader}>
              <View style={styles.voiceAgentTitleRow}>
                <Ionicons name="mic" size={20} color="#4285F4" />
                <Text style={styles.voiceAgentTitle}>Dixie Voice Agent</Text>
                <TouchableOpacity onPress={stopListening} style={styles.voiceAgentCloseButton}>
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={styles.voiceAgentSubtitle}>
                {isListening ? 'Listening...' : 'Ready to help'}
              </Text>
            </View>
            
            <View style={styles.voiceAgentContent}>
              {agentResponse ? (
                <ScrollView style={styles.agentResponseContainer}>
                  <Text style={styles.agentResponseText}>{agentResponse}</Text>
                </ScrollView>
              ) : (
                <View style={styles.voiceAgentPrompt}>
                  <Text style={styles.voiceAgentPromptText}>
                    Try saying: "Summarize my inbox"
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.voiceAgentInput}>
              <TextInput
                style={styles.voiceAgentInputField}
                value={voiceText}
                onChangeText={setVoiceText}
                placeholder="Type your command here..."
                placeholderTextColor="#999"
                onSubmitEditing={handleVoiceInputSubmit}
              />
              <TouchableOpacity 
                style={styles.voiceAgentSendButton}
                onPress={handleVoiceInputSubmit}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
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
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  headerButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  sendButton: {
    padding: 8,
    borderRadius: 8,
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
    minHeight: 44,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    width: 70,
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
  quotedTextContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  quotedTextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  quotedTextHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  quotedTextContent: {
    paddingLeft: 10,
  },
  quotedTextBody: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
  },
  aiButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.7,
  },
  aiButtonText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '600',
  },
  aiButtonTextDisabled: {
    color: '#999',
  },
  replySourceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  replySourceText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: '500',
  },
  voiceButtonActive: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  voiceFeedbackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  voiceFeedbackText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  voiceHelpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  voiceHelpText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  voiceCommandsModal: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  voiceCommandsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 15,
  },
  voiceCommandsList: {
    width: '100%',
  },
  voiceCommandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  voiceCommandText: {
    marginLeft: 15,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  voiceInputModal: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  voiceInputTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 5,
  },
  voiceInputSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  voiceInputField: {
    width: '100%',
    height: 100,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: '#333',
    textAlignVertical: 'top',
    marginBottom: 15,
  },
  voiceInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  voiceInputButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  voiceInputButtonText: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
  },
  voiceInputButtonPrimary: {
    backgroundColor: '#4285F4',
    borderColor: '#4285F4',
  },
  voiceInputButtonTextPrimary: {
    color: '#fff',
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
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  voiceAgentHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  voiceAgentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  voiceAgentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginLeft: 10,
  },
  voiceAgentCloseButton: {
    padding: 5,
  },
  voiceAgentSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  voiceAgentContent: {
    flex: 1,
    marginBottom: 15,
  },
  agentResponseContainer: {
    maxHeight: 150, // Limit height for scrolling
  },
  agentResponseText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  voiceAgentPrompt: {
    alignItems: 'center',
    padding: 10,
  },
  voiceAgentPromptText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  voiceAgentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  voiceAgentInputField: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 5,
  },
  voiceAgentSendButton: {
    padding: 10,
    borderRadius: 15,
    backgroundColor: '#4285F4',
    marginLeft: 5,
  },
});

export default ComposeScreen; 