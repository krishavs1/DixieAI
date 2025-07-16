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
    
    // Auto mode: use WebView for complex emails
    return emailAnalysis.complexity >= 3 || emailAnalysis.imageCount > 2;
  }, [emailAnalysis, renderMethod]);

  // WebView CSS for email styling
  const webViewCSS = `
    html, body {
      margin: 0;
      padding: 16px;
      background-color: ${isDarkMode ? '#202124' : '#ffffff'};
      color: ${isDarkMode ? '#e8eaed' : '#202124'};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
      min-height: 100vh;
      width: 100%;
      overflow-x: hidden;
    }
    
    /* Reset all backgrounds to ensure content is visible */
    * {
      background-color: transparent !important;
    }
    
    /* Ensure body has proper background */
    body {
      background-color: ${isDarkMode ? '#202124' : '#ffffff'} !important;
    }
    
    /* Force all content to fit screen width */
    * {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    
    /* Make tables responsive */
    table {
      width: 100% !important;
      max-width: 100% !important;
    }
    
    /* Force images to scale properly */
    img {
      max-width: 100% !important;
      width: auto !important;
      height: auto !important;
    }
    
    /* Email-specific styling */
    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      background-color: transparent !important;
    }
    
    /* Ensure email content is visible */
    div, p, span, h1, h2, h3, h4, h5, h6 {
      background-color: transparent !important;
      color: ${isDarkMode ? '#e8eaed' : '#202124'} !important;
    }
    
    /* Handle email-specific background colors */
    [style*="background-color"] {
      background-color: inherit !important;
    }
    
    /* Ensure text is visible */
    * {
      color: inherit;
    }
    
    a {
      color: ${isDarkMode ? '#8ab4f8' : '#1a73e8'};
      text-decoration: none;
    }
    
    p {
      margin-bottom: 1em;
    }
    
    blockquote {
      border-left: 4px solid ${isDarkMode ? '#5f6368' : '#dadce0'};
      margin: 1em 0;
      padding-left: 1em;
      font-style: italic;
      color: ${isDarkMode ? '#9aa0a6' : '#5f6368'};
    }
    
    /* Hide table borders for email layout */
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0;
      border: none;
    }
    
    td, th {
      border: none;
      padding: 0;
      text-align: left;
      background: transparent;
    }
    
    /* Remove borders from email-specific table layouts */
    table[role="presentation"] {
      border: none;
    }
    
    table[role="presentation"] td,
    table[role="presentation"] th {
      border: none;
      padding: 0;
    }
    
    /* Hide borders from email wrapper tables */
    .background-base {
      border: none;
    }
    
    .background-base td,
    .background-base th {
      border: none;
      padding: 0;
    }
    
    /* Remove borders from button containers */
    .button-primary,
    .button-tertiary {
      border: none;
    }
    
    /* Clean up email-specific elements */
    [class*="w100pc"] {
      border: none;
    }
    
    [class*="w100pc"] td,
    [class*="w100pc"] th {
      border: none;
      padding: 0;
    }
    
    /* Remove borders from all table elements */
    * {
      border: none !important;
    }
    
    /* Exception: only show borders for actual content tables */
    table:not([role="presentation"]) {
      border: 1px solid ${isDarkMode ? '#5f6368' : '#dadce0'};
    }
    
    table:not([role="presentation"]) td,
    table:not([role="presentation"]) th {
      border: 1px solid ${isDarkMode ? '#5f6368' : '#dadce0'};
      padding: 8px;
    }
    
    /* Dark mode adjustments */
    ${isDarkMode ? `
      * {
        border-color: #5f6368 !important;
      }
    ` : ''}
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <meta charset="utf-8">
          <style>${webViewCSS}</style>
        </head>
        <body>
          <div style="background-color: ${isDarkMode ? '#202124' : '#ffffff'}; color: ${isDarkMode ? '#e8eaed' : '#202124'}; width: 100%; max-width: 100%; overflow-x: hidden;">
            ${html}
          </div>
        </body>
      </html>
    `;

    return (
      <View style={[styles.container, style]}>
        {renderControls()}
        <WebView
          originWhitelist={['*']}
          source={{ html: webViewHTML }}
          style={styles.webView}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
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
            console.log('WebView message:', event.nativeEvent.data);
          }}
          injectedJavaScript={`
            // Debug: log the content
            console.log('WebView content loaded');
            console.log('Body content:', document.body.innerHTML);
            console.log('Body background:', document.body.style.backgroundColor);
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
    flex: 1,
    backgroundColor: 'transparent',
    minHeight: 400,
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