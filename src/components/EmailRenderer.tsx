import React, { useState } from 'react';
import {
  View,
  Dimensions,
  useColorScheme,
  Linking,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';

interface EmailRendererProps {
  html: string;
  plainText?: string;
  onLinkPress?: (url: string) => void;
  style?: any;
}

const EmailRenderer: React.FC<EmailRendererProps> = ({
  html,
  plainText,
  onLinkPress,
  style,
}) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const [height, setHeight] = useState(400);
  const screenWidth = Dimensions.get('window').width;

  const handleLinkPress = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url);
    }
  };

  const handleDebugPress = async () => {
    try {
      await Clipboard.setStringAsync(html);
      Alert.alert(
        'Debug Info Copied! 📋',
        `HTML content copied to clipboard!\n\nLength: ${html.length} characters\nHeight: ${height}px`,
        [{ text: 'OK', style: 'default' }]
      );
      console.log('=== EMAIL HTML DEBUG ===');
      console.log('Length:', html.length);
      console.log('Height:', height);
      console.log('HTML Preview:', html.substring(0, 500) + '...');
      console.log('========================');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      Alert.alert('Error', 'Failed to copy HTML to clipboard');
    }
  };

  // MINIMAL approach: Just make it responsive, keep ALL original styling
  const sanitizedHtml = html
    // Remove ALL width constraints that cause horizontal overflow
    .replace(/(min-width|max-width|width):\s*\d+px;?/gi, '')
    .replace(/\s(width|height)="\d+"/gi, '')
    // Remove inline width styles in style attributes
    .replace(/style="([^"]*?)width:\s*\d+px;?([^"]*)"/gi, 'style="$1$2"')
    .replace(/style="([^"]*?)min-width:\s*\d+px;?([^"]*)"/gi, 'style="$1$2"')
    .replace(/style="([^"]*?)max-width:\s*\d+px;?([^"]*)"/gi, 'style="$1$2"')
    // ONLY fix invisible grey text
    .replace(/color:\s*#f[78]f[78]f[78];?/gi, 'color: inherit;');

  // Wrap up the HTML with minimal, non-destructive CSS
  const wrappedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            overflow-x: hidden;
            background: ${isDarkMode ? '#171717' : '#f8f9fa'};
          }

          .wrapper {
            margin: 0;
            padding: 12px;
            background: ${isDarkMode ? '#202124' : '#fff'};
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            text-align: center;
            display: block;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            box-sizing: border-box;
          }

          /* AGGRESSIVE responsive fixes to fit screen and center content */
          .wrapper table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            border: none !important;
            margin: 0 auto !important;
            text-align: center !important;
          }
          .wrapper td, .wrapper th {
            border: none !important;
            max-width: none !important;
            width: auto !important;
            text-align: center !important;
            margin: 0 auto !important;
          }
          .wrapper img {
            max-width: 100% !important;
            width: auto !important;
            height: auto !important;
            margin: 0 auto !important;
            display: block !important;
          }
          
          /* Force all elements to fit screen width and center */
          .wrapper * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          
          /* Center all content */
          .wrapper div, .wrapper p, .wrapper span {
            text-align: center !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          
          /* ONLY override invisible grey text */
          .wrapper [style*="color:#f7f7f7"],
          .wrapper [style*="color:#f8f8f8"] {
            color: ${isDarkMode ? '#e8eaed' : '#202124'} !important;
          }
          
          /* Override only invisible grey text */
          .wrapper [style*="color:#f7f7f7"],
          .wrapper [style*="color:#f8f8f8"] {
            color: ${isDarkMode ? '#e8eaed' : '#202124'} !important;
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          ${sanitizedHtml}
        </div>
        <script>
          function measure() {
            const h = Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight
            );
            window.ReactNativeWebView.postMessage(h.toString());
          }
          window.addEventListener('load', measure);
          setTimeout(measure, 500);
          setTimeout(measure, 1000);
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[{ width: '100%', height }, style]}>
      {/* Debug Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 6,
          zIndex: 1000,
          borderWidth: 1,
          borderColor: isDarkMode ? '#555' : '#ddd',
        }}
        onPress={handleDebugPress}
      >
        <Text style={{
          fontSize: 12,
          color: isDarkMode ? '#fff' : '#333',
          fontWeight: '500',
        }}>
          🐛 Debug
        </Text>
      </TouchableOpacity>

      <WebView
        originWhitelist={['*']}
        source={{ html: wrappedHtml }}
        style={{ flex: 1 }}
        scrollEnabled={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={true}
        bounces={false}
        overScrollMode="never"
        scalesPageToFit={true}
        onMessage={(event) => {
          const h = parseInt(event.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0) {
            console.log('Setting height to:', h);
            setHeight(Math.max(h + 20, 150));
          }
        }}
        onShouldStartLoadWithRequest={(event) => {
          if (event.url.startsWith('http')) {
            handleLinkPress(event.url);
            return false;
          }
          return true;
        }}
        onError={(error) => {
          console.error('WebView error:', error);
        }}
        onLoadEnd={() => {
          console.log('WebView loaded successfully');
        }}
      />
    </View>
  );
};

export default EmailRenderer;
