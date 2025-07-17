import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  useColorScheme,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RenderHtml from 'react-native-render-html';
import { WebView } from 'react-native-webview';

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
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  
  const [showPlainText, setShowPlainText] = useState(false);
  const [useWebView, setUseWebView] = useState(false);
  const [renderMethod, setRenderMethod] = useState<'auto' | 'webview' | 'native'>('auto');
  const [contentHeight, setContentHeight] = useState(0);

  // Analyze email complexity to determine best rendering method
  const emailAnalysis = useMemo(() => {
    const hasImages = html.includes('<img') || html.includes('background-image');
    const hasComplexLayout = html.includes('<table') || html.includes('display:') || html.includes('position:');
    const hasInlineStyles = html.includes('style=');
    const hasExternalCSS = html.includes('<style') || html.includes('@media');
    const imageCount = (html.match(/<img/g) || []).length;
    
    return {
      hasImages,
      hasComplexLayout,
      hasInlineStyles,
      hasExternalCSS,
      imageCount,
      complexity: (hasImages ? 2 : 0) + (hasComplexLayout ? 2 : 0) + (hasInlineStyles ? 1 : 0) + (hasExternalCSS ? 1 : 0) + (imageCount > 3 ? 2 : 0),
    };
  }, [html]);

  // Auto-determine if WebView should be used
  const shouldUseWebView = useMemo(() => {
    if (renderMethod === 'webview') return true;
    if (renderMethod === 'native') return false;
    
    // Auto mode: always use WebView by default for marketing emails
    return true;
  }, [renderMethod]);

  // WebView CSS for email styling - aggressive margin/padding removal
  const webViewCSS = `
    html, body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
    }

    .email-container {
      margin: 0 !important;
      padding: 0 8px !important;
    }

    .email-content {
      margin: 0 !important;
      padding: 0 !important;
    }

    .email-content > * {
      margin: 0 !important;
      padding: 0 !important;
    }

    img {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
    }

    table {
      width: 100% !important;
      table-layout: auto !important;
      border-collapse: collapse !important;
    }

    td, th {
      padding: 0 !important;
      border: none !important;
    }
  `;

  // Native rendering styles (Gmail-like)
  const nativeTagsStyles = {
    body: {
      margin: 0,
      padding: 16,
      backgroundColor: isDarkMode ? '#202124' : '#ffffff',
    },
    p: {
      marginTop: 0,
      marginBottom: 16,
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    div: {
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
      marginBottom: 8,
      borderWidth: 0,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    img: {
      maxWidth: '100%',
      height: 'auto',
      marginTop: 8,
      marginBottom: 8,
      borderRadius: 4,
    },
    span: {
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    a: {
      color: isDarkMode ? '#8ab4f8' : '#1a73e8',
      textDecorationLine: 'none' as const,
      fontSize: 14,
      lineHeight: 20,
    },
    h1: {
      fontSize: 24,
      fontWeight: '400' as const,
      lineHeight: 32,
      marginTop: 0,
      marginBottom: 16,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    h2: {
      fontSize: 20,
      fontWeight: '400' as const,
      lineHeight: 28,
      marginTop: 0,
      marginBottom: 14,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    h3: {
      fontSize: 16,
      fontWeight: '500' as const,
      lineHeight: 24,
      marginTop: 0,
      marginBottom: 12,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    strong: {
      fontWeight: '500' as const,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontSize: 14,
      lineHeight: 20,
    },
    b: {
      fontWeight: '500' as const,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontSize: 14,
      lineHeight: 20,
    },
    em: {
      fontStyle: 'italic' as const,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontSize: 14,
      lineHeight: 20,
    },
    i: {
      fontStyle: 'italic' as const,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontSize: 14,
      lineHeight: 20,
    },
    ul: {
      marginTop: 0,
      marginBottom: 16,
      paddingLeft: 24,
    },
    ol: {
      marginTop: 0,
      marginBottom: 16,
      paddingLeft: 24,
    },
    li: {
      marginBottom: 4,
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
      fontFamily: 'System',
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: isDarkMode ? '#5f6368' : '#dadce0',
      marginTop: 16,
      marginBottom: 16,
      paddingLeft: 16,
      color: isDarkMode ? '#9aa0a6' : '#5f6368',
      fontStyle: 'italic' as const,
      fontSize: 14,
      lineHeight: 20,
    },
    table: {
      width: '100%',
      marginTop: 16,
      marginBottom: 16,
      fontSize: 14,
    },
    td: {
      padding: 8,
      borderWidth: 1,
      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
    },
    th: {
      padding: 8,
      borderWidth: 1,
      borderColor: isDarkMode ? '#5f6368' : '#dadce0',
      backgroundColor: isDarkMode ? '#3c4043' : '#f8f9fa',
      fontWeight: '500' as const,
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
    },
  };

  const handleLinkPress = (url: string) => {
    if (onLinkPress) {
      onLinkPress(url);
    } else {
      Linking.openURL(url);
    }
  };

  const renderControls = () => (
    <View style={styles.controls}>
      <View style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}
          onPress={() => setShowPlainText(!showPlainText)}
        >
          <Ionicons 
            name={showPlainText ? 'code' : 'document-text'} 
            size={14} 
            color={isDarkMode ? '#8ab4f8' : '#1a73e8'} 
          />
          <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextDark]}>
            {showPlainText ? 'Show HTML' : 'Show plain text'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}
          onPress={() => {
            const newMethod = renderMethod === 'auto' ? 'webview' : renderMethod === 'webview' ? 'native' : 'auto';
            setRenderMethod(newMethod);
          }}
        >
          <Ionicons 
            name={shouldUseWebView ? 'globe' : 'phone-portrait'} 
            size={14} 
            color={isDarkMode ? '#8ab4f8' : '#1a73e8'} 
          />
          <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextDark]}>
            {renderMethod === 'auto' ? 'Auto' : renderMethod === 'webview' ? 'WebView' : 'Native'}
          </Text>
        </TouchableOpacity>
      </View>

      {renderMethod === 'auto' && (
        <View style={styles.analysisInfo}>
          <Text style={[styles.analysisText, isDarkMode && styles.analysisTextDark]}>
            Using {shouldUseWebView ? 'WebView' : 'Native'} rendering 
            (Complexity: {emailAnalysis.complexity}, Images: {emailAnalysis.imageCount})
          </Text>
        </View>
      )}
    </View>
  );

  // Show plain text if requested
  if (showPlainText && plainText) {
    return (
      <View style={[styles.container, style]}>
        {renderControls()}
        <Text style={[styles.plainText, isDarkMode && styles.plainTextDark]}>
          {plainText}
        </Text>
      </View>
    );
  }

  // Render with WebView for complex emails
  if (shouldUseWebView) {
    const webViewHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${webViewCSS}</style>
        </head>
        <body>
          <div class="email-container">
            <div class="email-content">
              ${html}
            </div>
          </div>
        </body>
      </html>
    `;

    return (
      <View style={[styles.containerWebView, style]}>
        {renderControls()}
        <WebView
          originWhitelist={['*']}
          source={{ html: webViewHTML }}
          style={[styles.webView, { height: contentHeight || 200 }]}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          showsHorizontalScrollIndicator={false}
          scalesPageToFit={true}
          onShouldStartLoadWithRequest={(event) => {
            if (event.url.startsWith('http')) {
              handleLinkPress(event.url);
              return false;
            }
            return true;
          }}
          onError={(error) => {
            console.error('WebView error:', error);
            // Fallback to native rendering on error
            setRenderMethod('native');
          }}
          onLoadEnd={() => {
            console.log('WebView loaded successfully');
          }}
          onMessage={(event) => {
            const height = Number(event.nativeEvent.data);
            if (!isNaN(height) && height > 0) {
              console.log('Setting content height to:', height);
              setContentHeight(height);
            }
          }}
          injectedJavaScript={`
            console.log('WebView content loaded');
            
            // Measure the actual content height and send it to React Native
            const measureHeight = () => {
              const height = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                document.documentElement.offsetHeight,
                document.body.offsetHeight
              );
              window.ReactNativeWebView.postMessage(height.toString());
            };
            
            // Measure immediately
            measureHeight();
            
            // Also measure after images load
            setTimeout(measureHeight, 100);
            setTimeout(measureHeight, 500);
            
            true;
          `}
        />
      </View>
    );
  }

  // Render with native HTML renderer
  return (
    <View style={[styles.container, style]}>
      {renderControls()}
      <RenderHtml
        contentWidth={width - 32}
        source={{ html }}
        ignoredDomTags={['script', 'meta', 'head', 'title', 'html', 'body']}
        onHTMLLoaded={(error: any) => {
          if (error) {
            console.error('RenderHtml error:', error);
            // Fallback to WebView on error
            setRenderMethod('webview');
          }
        }}
        renderersProps={{
          img: {
            enableExperimentalPercentWidth: true,
          },
          a: {
            onPress: (event: any, url: string) => handleLinkPress(url),
          },
        }}
        defaultViewProps={{
          style: {
            backgroundColor: 'transparent',
          },
        }}
        baseStyle={{
          fontSize: 14,
          lineHeight: 20,
          color: isDarkMode ? '#e8eaed' : '#3c4043',
          fontFamily: 'System',
          backgroundColor: 'transparent',
        }}
        tagsStyles={nativeTagsStyles}
        systemFonts={['System']}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerWebView: {
    flex: 0, // Don't stretch, let content determine size
  },
  controls: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  controlButtonDark: {
    backgroundColor: '#303134',
    borderColor: '#5f6368',
  },
  controlButtonText: {
    fontSize: 13,
    color: '#1a73e8',
    fontWeight: '500',
    marginLeft: 6,
  },
  controlButtonTextDark: {
    color: '#8ab4f8',
  },
  analysisInfo: {
    marginTop: 8,
  },
  analysisText: {
    fontSize: 12,
    color: '#666',
  },
  analysisTextDark: {
    color: '#999',
  },
  webView: {
    width: '100%',
    margin: 0,
    padding: 0,
    backgroundColor: 'transparent',
  },
  plainText: {
    padding: 16,
    fontSize: 14,
    lineHeight: 20,
    color: '#3c4043',
    fontFamily: 'System',
  },
  plainTextDark: {
    color: '#e8eaed',
  },
});

export default EmailRenderer; 