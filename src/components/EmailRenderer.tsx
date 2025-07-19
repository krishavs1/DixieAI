import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  useColorScheme,
  Linking,
  Dimensions,
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
  const [contentHeight, setContentHeight] = useState(200); // Smaller default fallback height

  // Analyze email complexity to determine best rendering method
  const emailAnalysis = useMemo(() => {
    const hasImages = html.includes('<img') || html.includes('background-image');
    const hasComplexLayout = html.includes('<table') || html.includes('display:') || html.includes('position:');
    const hasInlineStyles = html.includes('style=');
    const hasExternalCSS = html.includes('<style') || html.includes('@media');
    const imageCount = (html.match(/<img/g) || []).length;
    
    // More sophisticated analysis - check if it's actually simple content
    const isSimpleContent = () => {
      // Remove style tags to check actual content
      const contentWithoutStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      const textContent = contentWithoutStyles.replace(/<[^>]*>/g, '').trim();
      
      // If it's just a few lines of text, it's simple regardless of styling
      const lineCount = textContent.split('\n').filter(line => line.trim().length > 0).length;
      const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
      
      console.log('Content analysis:', { lineCount, wordCount, textContent: textContent.substring(0, 100) });
      
      return lineCount <= 5 && wordCount <= 50;
    };
    
    const isActuallySimple = isSimpleContent();
    
    return {
      hasImages,
      hasComplexLayout: hasComplexLayout && !isActuallySimple,
      hasInlineStyles,
      hasExternalCSS: hasExternalCSS && !isActuallySimple,
      imageCount,
      isActuallySimple,
      complexity: isActuallySimple ? 0 : ((hasImages ? 2 : 0) + (hasComplexLayout ? 2 : 0) + (hasInlineStyles ? 1 : 0) + (hasExternalCSS ? 1 : 0) + (imageCount > 3 ? 2 : 0)),
    };
  }, [html]);

  // Sanitize HTML to remove problematic background colors (e.g., solid green blocks)
  const sanitizedHtml = useMemo(() => {
    let cleaned = html;
    try {
      // Only remove lime/bright-green debugging backgrounds, leave everything else alone
      cleaned = cleaned.replace(/background-color\s*:\s*(?:#00ff00|lime|rgb\(0,\s*255,\s*0\))\s*;?/gi, '');
      // Remove bgcolor attributes on any tag
      cleaned = cleaned.replace(/bgcolor="[^"]*"/gi, '');
      
      // Remove empty divs and spans that might cause spacing
      cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');
      cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');
      cleaned = cleaned.replace(/<p[^>]*>\s*<\/p>/gi, '');
      
      // Remove excessive whitespace and line breaks
      cleaned = cleaned.replace(/\n\s*\n/g, '\n');
      cleaned = cleaned.replace(/\s+$/gm, ''); // Remove trailing whitespace on lines
      
      console.log('Sanitized HTML length:', cleaned.length);
    } catch (err) {
      console.warn('Failed to sanitize email HTML:', err);
    }
    return cleaned;
  }, [html]);

  // Auto-determine if WebView should be used
  const shouldUseWebView = useMemo(() => {
    if (renderMethod === 'webview') return true;
    if (renderMethod === 'native') return false;
    
    // Auto mode: use WebView for all HTML emails since it's working consistently
    const useWebView = true; // Always use WebView for now
    console.log('Email analysis:', emailAnalysis);
    console.log('Should use WebView:', useWebView);
    return useWebView;
  }, [renderMethod, emailAnalysis]);

  // WebView CSS for email styling - Aggressive responsive behavior like Gmail
  const webViewCSS = `
    /* Make the page exactly the screen width and kill horizontal overflow */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      box-sizing: border-box !important;
      background-color: #f8f9fa !important;
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    }

    /* Wrapper for sanitized HTML */
    .email-container {
      width: 100% !important;
      max-width: 100% !important;
      /* Only kill horizontal scroll, let vertical expand */
      overflow-x: hidden !important;
      overflow-y: visible !important;
      box-sizing: border-box !important;
      background: #fff !important;
      margin: 0 auto !important;
      padding: 16px !important;
      border-radius: 8px !important;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1) !important;
      /* Center content and prevent right shift */
      position: relative !important;
      left: 0 !important;
      right: 0 !important;
    }

    /* Remove EVERY hard-coded width/height attribute */
    *[width], *[height] {
      width: auto !important;
      max-width: 100% !important;
      height: auto !important;
    }

    /* Make EVERY table fluid */
    table, td, th {
      table-layout: auto !important;
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse !important;
      box-sizing: border-box !important;
      border: none !important;
      border-spacing: 0 !important;
      margin: 0 auto !important;
      padding: 4px !important;
      text-align: center !important;
    }

    /* Images must shrink to fit */
    img {
      display: block !important;
      width: auto !important;
      max-width: 100% !important;
      height: auto !important;
      margin: 0 auto !important;
    }

    /* Sensible typography - all elements must wrap */
    p, h1, h2, h3, h4, h5, h6, a, span, div {
      box-sizing: border-box !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      max-width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      text-align: center !important;
    }

    /* Typography styling */
    p {
      margin: 0 0 12px 0 !important;
      line-height: 1.5 !important;
      color: #202124 !important;
      font-size: 14px !important;
    }

    h1, h2, h3, h4, h5, h6 {
      margin: 0 0 12px 0 !important;
      line-height: 1.3 !important;
      color: #202124 !important;
    }

    /* Links */
    a {
      color: #1a73e8 !important;
      text-decoration: none !important;
      word-wrap: break-word !important;
    }

    /* Force center alignment for common email elements */
    .text-center, .center, .align-center {
      text-align: center !important;
    }

    /* Clean up empty elements */
    p:empty, div:empty, span:empty {
      display: none !important;
    }

    /* Remove excessive line breaks */
    br + br {
      display: none !important;
    }

    /* Hide preheader content */
    .stylingblock-content-wrapper.camarker-inner:empty {
      display: none !important;
    }

    /* Force relative positioning */
    * {
      position: relative !important;
    }

    /* Override any remaining fixed dimensions */
    [style*="width"], [style*="height"] {
      width: auto !important;
      max-width: 100% !important;
      height: auto !important;
    }

    /* Force all content to be centered */
    * {
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Center images and maintain aspect ratio */
    img {
      margin: 0 auto !important;
      text-align: center !important;
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
      marginBottom: 8, // Add some spacing back
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
      borderCollapse: 'collapse' as const,
      marginTop: 0,
      marginBottom: 0,
      fontSize: 14,
    },
    td: {
      padding: 0,
      borderWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      color: isDarkMode ? '#e8eaed' : '#3c4043',
    },
    th: {
      padding: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
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
    console.log('Using WEBVIEW renderer for HTML:', sanitizedHtml.substring(0, 200) + '...');
    const webViewHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
          <link href="https://fonts.googleapis.com/css?family=Roboto:400,500,700" rel="stylesheet">
          <style>${webViewCSS}</style>
        </head>
        <body>
          <div class="email-container">
            ${sanitizedHtml}
          </div>
        </body>
      </html>
    `;

    return (
      <View style={[styles.containerWebView, style]}>
                  <WebView
            originWhitelist={['*']}
            source={{ html: webViewHTML }}
            style={[styles.webView, { 
              height: contentHeight, 
              width: Dimensions.get('window').width 
            }]}
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
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
              // Ensure minimum height of 150px, add small buffer
              const finalHeight = Math.max(height + 20, 150);
              setContentHeight(finalHeight);
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

              // 3) Remove any green backgrounds or debug elements
              document.querySelectorAll('*').forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.backgroundColor.includes('green') || 
                    computedStyle.backgroundColor.includes('rgb(0, 255, 0)') ||
                    computedStyle.backgroundColor.includes('lime')) {
                  el.style.backgroundColor = 'transparent';
                  console.log('Removed green background from:', el);
                }
              });

              // 4) Clean up any remaining debug elements and borders
              document.querySelectorAll('*').forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.backgroundColor.includes('green') || 
                    computedStyle.backgroundColor.includes('rgb(0, 255, 0)') ||
                    computedStyle.backgroundColor.includes('lime')) {
                  el.style.backgroundColor = 'transparent';
                  console.log('Removed green background from:', el);
                }
                
                // Remove any border attributes
                if (el.hasAttribute('border')) {
                  el.removeAttribute('border');
                }
                if (el.hasAttribute('cellpadding')) {
                  el.removeAttribute('cellpadding');
                }
                if (el.hasAttribute('cellspacing')) {
                  el.removeAttribute('cellspacing');
                }
                
                // AGGRESSIVELY remove ALL width and height attributes
                if (el.hasAttribute('width')) {
                  el.removeAttribute('width');
                  el.style.width = 'auto';
                  el.style.maxWidth = '100%';
                }
                if (el.hasAttribute('height')) {
                  el.removeAttribute('height');
                  el.style.height = 'auto';
                }
                
                // Force responsive behavior on all elements
                el.style.maxWidth = '100%';
                el.style.boxSizing = 'border-box';
                el.style.wordWrap = 'break-word';
                el.style.overflowWrap = 'break-word';
                
                // Special handling for images
                if (el.tagName === 'IMG') {
                  el.style.width = 'auto';
                  el.style.maxWidth = '100%';
                  el.style.height = 'auto';
                  el.style.display = 'block';
                  el.style.margin = '0 auto';
                }
                
                // Special handling for tables
                if (el.tagName === 'TABLE' || el.tagName === 'TD' || el.tagName === 'TH') {
                  el.style.width = '100%';
                  el.style.maxWidth = '100%';
                  el.style.tableLayout = 'auto';
                  el.style.borderCollapse = 'collapse';
                  el.style.margin = '0 auto';
                  el.style.textAlign = 'center';
                }

                // Force centering on all elements
                el.style.marginLeft = 'auto';
                el.style.marginRight = 'auto';
                
                // Special handling for divs and containers
                if (el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'SPAN') {
                  el.style.textAlign = 'center';
                }
              });

              // 5) Measure content height correctly
              (function measure(){
                const container = document.querySelector('.email-container') || document.body;
                const height = container.scrollHeight;
                console.log('Measured container height:', height);
                window.ReactNativeWebView.postMessage(height.toString());
              })();
              
              // Re-measure after images load
              window.addEventListener('load', measure);
              setTimeout(measure, 500);
              setTimeout(measure, 1000);
              
              true;
              
              true;
            `}
        />
      </View>
    );
  }

  // Render with native HTML renderer
  console.log('Using NATIVE renderer for HTML:', sanitizedHtml.substring(0, 200) + '...');
  return (
    <View style={[styles.containerNative, style]}>
      <RenderHtml
        contentWidth={width - 32}
        source={{ html: sanitizedHtml }}
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
    flexGrow: 0, // Shrink to content
  },
  containerNative: {
    flexGrow: 0, // Shrink to content for native renderer
  },
  containerWebView: {
    backgroundColor: 'transparent',
  },
  webView: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});

export default EmailRenderer; 