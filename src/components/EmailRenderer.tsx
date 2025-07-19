import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  useColorScheme,
  Linking,
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
  
  const [renderMethod, setRenderMethod] = useState<'auto' | 'webview' | 'native'>('auto');
  const [webViewHeight, setWebViewHeight] = useState(400);



  // Analyze email complexity to determine best rendering method
  const emailAnalysis = useMemo(() => {
    const hasImages = html.includes('<img') || html.includes('background-image');
    const hasComplexLayout = html.includes('<table') || html.includes('display:') || html.includes('position:');
    const hasInlineStyles = html.includes('style=');
    const hasExternalCSS = html.includes('<style') || html.includes('@media');
    const imageCount = (html.match(/<img/g) || []).length;
    
    // Check if this is basically just text content (preserve style blocks)
    const textContent = html.replace(/<[^>]*>/g, '').trim();
    const isBasicallyText = textContent.length > 0 && textContent.length < 500 && !hasImages && imageCount === 0;
    
    return {
      hasImages,
      hasComplexLayout,
      hasInlineStyles,
      hasExternalCSS,
      imageCount,
      isBasicallyText,
      complexity: isBasicallyText ? 0 : (hasImages ? 2 : 0) + (hasComplexLayout ? 2 : 0) + (hasInlineStyles ? 1 : 0) + (hasExternalCSS ? 1 : 0) + (imageCount > 3 ? 2 : 0),
    };
  }, [html]);

  // Auto-determine if WebView should be used
  const shouldUseWebView = useMemo(() => {
    if (renderMethod === 'webview') return true;
    if (renderMethod === 'native') return false;
    // auto-mode: only use WebView if it really is complex HTML
    return emailAnalysis.complexity >= 4;    // tweak threshold to taste
  }, [renderMethod, emailAnalysis]);



  // Minimal WebView CSS - preserve original email design
  const webViewCSS = `
    /* Basic mobile viewport setup */
    html, body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    
    /* Basic responsive image handling */
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    
    /* Basic table responsiveness */
    table {
      max-width: 100% !important;
    }
    
    /* Hide email preheaders */
    [style*="display:none"], 
    [style*="display: none"],
    .preheader,
    [class*="preheader"] {
      display: none !important;
    }
    
    /* Basic box-sizing for mobile */
    * {
      box-sizing: border-box;
    }
    
    /* Dark mode support - let email's styles take precedence */
    @media (prefers-color-scheme: dark) {
      /* Preserve original dark mode adaptations */
    }
  `;

  // Native rendering styles (Gmail-like)
  const nativeTagsStyles = {
    body: {
      margin: 0,
      padding: 0,
      backgroundColor: isDarkMode ? '#202124' : '#ffffff',
      width: '100%',
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





  // Render with WebView for complex emails
  if (shouldUseWebView) {
    const webViewHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
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
      <>
        <View style={[styles.containerWebView, style]}>
          <WebView
            originWhitelist={['*']}
            source={{ html: webViewHTML }}
            style={[styles.webView, { height: webViewHeight }]}
            onMessage={(event) => {
              const height = parseInt(event.nativeEvent.data, 10);
              if (!isNaN(height) && height > 0) {
                console.log('Setting WebView height to:', height);
                setWebViewHeight(Math.max(height + 20, 200));
              }
            }}
            scrollEnabled={true}
            nestedScrollEnabled={true}
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

            injectedJavaScript={`
              // A) Hide any truly empty preheader wrappers (their parent table)
              document.querySelectorAll('.stylingblock-content-wrapper.camarker-inner')
                .forEach(el => {
                  if (!el.textContent.trim()) {
                    const parent = el.closest('.stylingblock-content-wrapper');
                    if (parent) parent.style.display = 'none';
                  }
                });

              // B) Force .hide cells back on‐screen
              document.querySelectorAll('.hide').forEach(el => {
                el.style.display = 'table-cell';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
              });

              // C) Re‐stack the header cells
              document.querySelectorAll('.responsive-td, .displayBlock.text-center, .text-center.paddingBottom10')
                .forEach(td => {
                  td.style.display = 'block';
                  td.style.width   = '100%';
                  td.style.textAlign = 'center';
                });

              // D) Make the main wrapper take full width
              const wrapper = document.querySelector('.fullgmail');
              if (wrapper) {
                wrapper.style.margin = '0';
                wrapper.style.width = '100%';
                wrapper.style.maxWidth = 'none';
                wrapper.style.display = 'block';
              }

              // E) ensure all elements take full width
              document.querySelectorAll('table, div, section, article').forEach(el => {
                el.style.width = '100%';
                el.style.maxWidth = 'none';
                el.style.margin = '0';
              });

              // F) Measure content height and send to React Native
              function measureHeight() {
                const height = Math.max(
                  document.documentElement.scrollHeight,
                  document.body.scrollHeight
                );
                window.ReactNativeWebView.postMessage(height.toString());
              }
              setTimeout(measureHeight, 100);
              setTimeout(measureHeight, 500);
              setTimeout(measureHeight, 1000);

              true;
            `}
          />
        </View>

      </>
    );
  }

    // Render with native HTML renderer (preserve original styles)
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks for security
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '') // Remove head blocks
    .trim();

  return (
    <>
      <View style={[styles.container, style]}>
        <RenderHtml
          contentWidth={width - 32}
          source={{ html: cleanHtml }}
          ignoredDomTags={['script', 'meta', 'head', 'title', 'html', 'body', 'style']}
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

    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerWebView: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default EmailRenderer; 