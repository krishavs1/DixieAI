import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  useColorScheme,
  Linking,
} from 'react-native';
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
    /* reset page */
    html, body, .email-container, .email-content {
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
      background-color: transparent !important;
    }

    /* hide any completely empty "stylingblock" wrappers (preheader cruft) */
    .email-content .stylingblock-content-wrapper.camarker-inner:empty {
      display: none !important;
    }

    /* cancel Gmail's built‑in .gmail-content padding */
    .email-content .gmail-content {
      padding: 0 !important;
      margin: 0 !important;
      background-color: transparent !important;
    }

    /* stack the two top cells (Dunkin' logo + points bar) full‑width */
    .email-content td.responsive-td,
    .email-content .displayBlock.text-center,
    .email-content .text-center.paddingBottom10 {
      display: block !important;
      width: 100%   !important;
    }

    /* leave inner presentation tables at their natural width */
    .email-content table[role="presentation"] {
      table-layout: auto !important;
      width:        auto !important;
    }

    /* your existing globals */
    img {
      max-width: 100% !important;
      height: auto    !important;
      display: block  !important;
    }
    td, th {
      padding: 0   !important;
      border: none !important;
    }

    /* Remove any green backgrounds or debug elements */
    * {
      background-color: transparent !important;
    }
    
    /* Ensure content is visible */
    div, p, span, a, table, tr, td {
      background-color: transparent !important;
      color: inherit !important;
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

  // Render with WebView for complex emails
  if (shouldUseWebView) {
    const webViewHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${webViewCSS}</style>
        </head>
        <body style="background-color: transparent; margin: 0; padding: 0;">
          <div class="email-container" style="background-color: transparent;">
            <div class="email-content" style="background-color: transparent;">
              ${html}
            </div>
          </div>
        </body>
      </html>
    `;

    return (
      <View style={[styles.containerWebView, style]}>
                  <WebView
            originWhitelist={['*']}
            source={{ html: webViewHTML }}
            style={[styles.webView, { height: contentHeight || 400 }]}
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={false}
            scalesPageToFit={false}
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
            // 1) hide any truly empty pre‑header blocks
            document.querySelectorAll('.stylingblock-content-wrapper.camarker-inner').forEach(el => {
              if (!el.textContent.trim()) el.style.display = 'none';
            });

            // 2) force those two top cells to stack
            document.querySelectorAll('.responsive-td, .displayBlock.text-center, .text-center.paddingBottom10')
              .forEach(td => {
                td.style.display = 'block';
                td.style.width   = '100%';
              });

            // 3) measure height
            (function measure(){
              const h = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
              );
              window.ReactNativeWebView.postMessage(h.toString());
            })();
            // also re‑measure after images load
            window.addEventListener('load', measure);
            setTimeout(measure, 500);
            
            true;
          `}
        />
      </View>
    );
  }

  // Render with native HTML renderer
  return (
    <View style={[styles.container, style]}>
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
    flex: 1, // Allow it to stretch and fill available space
    backgroundColor: 'transparent',
  },
  webView: {
    width: '100%',
    margin: 0,
    padding: 0,
    backgroundColor: 'transparent',
    flex: 1,
  },
});

export default EmailRenderer; 