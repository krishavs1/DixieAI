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
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RenderHtml from 'react-native-render-html';
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
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  
  const [showPlainText, setShowPlainText] = useState(false);
  const [useWebView, setUseWebView] = useState(false);
  const [renderMethod, setRenderMethod] = useState<'auto' | 'webview' | 'native'>('auto');
  const [contentHeight, setContentHeight] = useState(0);
  const [showDebugModal, setShowDebugModal] = useState(false);

  // Reset debug modal state when component mounts
  React.useEffect(() => {
    setShowDebugModal(false);
  }, []);

  // Debug modal state changes
  React.useEffect(() => {
    console.log('Debug modal state changed to:', showDebugModal);
  }, [showDebugModal]);

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

  // Function to export HTML to clipboard
  const exportHtml = async () => {
    try {
      await Clipboard.setStringAsync(html);
      Alert.alert('Success', 'HTML copied to clipboard!');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy HTML to clipboard');
    }
  };

  // Function to save HTML analysis for debugging
  const saveHtmlAnalysis = async () => {
    const analysis = {
      timestamp: new Date().toISOString(),
      htmlLength: html.length,
      analysis: emailAnalysis,
      htmlPreview: html.substring(0, 1000) + (html.length > 1000 ? '...' : ''),
      fullHtml: html
    };
    
    try {
      await Clipboard.setStringAsync(JSON.stringify(analysis, null, 2));
      Alert.alert('Debug Info Copied', 'Full HTML analysis copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy analysis to clipboard');
    }
  };

  // WebView CSS for email styling - aggressive margin/padding removal
  const webViewCSS = `
    /* reset page */
    html, body, .email-container, .email-content {
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
    }

    /* hide any completely empty "stylingblock" wrappers (preheader cruft) */
    .email-content .stylingblock-content-wrapper.camarker-inner:empty {
      display: none !important;
    }

    /* cancel Gmail's built‑in .gmail-content padding */
    .email-content .gmail-content {
      padding: 0 !important;
      margin: 0 !important;
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

        <TouchableOpacity
          style={[styles.controlButton, isDarkMode && styles.controlButtonDark]}
          onPress={() => {
            console.log('Debug button pressed!');
            console.log('Current showDebugModal state:', showDebugModal);
            setShowDebugModal(true);
            console.log('Set showDebugModal to true');
          }}
        >
          <Ionicons 
            name="bug" 
            size={14} 
            color={isDarkMode ? '#8ab4f8' : '#1a73e8'} 
          />
          <Text style={[styles.controlButtonText, isDarkMode && styles.controlButtonTextDark]}>
            Debug
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
      <>
        <View style={[styles.container, style]}>
          {renderControls()}
          <Text style={[styles.plainText, isDarkMode && styles.plainTextDark]}>
            {plainText}
          </Text>
        </View>

        {/* Debug Modal */}
        <Modal
          visible={showDebugModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowDebugModal(false)}
          onShow={() => console.log('Debug modal shown!')}
          onDismiss={() => console.log('Debug modal dismissed!')}
        >
          <SafeAreaView style={[styles.debugModal, isDarkMode && styles.debugModalDark]}>
            <View style={[styles.debugHeader, isDarkMode && styles.debugHeaderDark]}>
              <Text style={[styles.debugTitle, isDarkMode && styles.debugTitleDark]}>
                Email HTML Debug
              </Text>
              <TouchableOpacity
                onPress={() => setShowDebugModal(false)}
                style={styles.debugCloseButton}
              >
                <Ionicons name="close" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.debugContent}>
              {/* Email Analysis */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  Email Analysis
                </Text>
                <Text style={[styles.debugText, isDarkMode && styles.debugTextDark]}>
                  HTML Length: {html.length} characters{'\n'}
                  Complexity Score: {emailAnalysis.complexity}{'\n'}
                  Has Images: {emailAnalysis.hasImages ? 'Yes' : 'No'} ({emailAnalysis.imageCount} images){'\n'}
                  Has Complex Layout: {emailAnalysis.hasComplexLayout ? 'Yes' : 'No'}{'\n'}
                  Has Inline Styles: {emailAnalysis.hasInlineStyles ? 'Yes' : 'No'}{'\n'}
                  Has External CSS: {emailAnalysis.hasExternalCSS ? 'Yes' : 'No'}{'\n'}
                  Current Rendering Method: {shouldUseWebView ? 'WebView' : 'Native'}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  Export Options
                </Text>
                <View style={styles.debugButtons}>
                  <TouchableOpacity
                    style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                    onPress={exportHtml}
                  >
                    <Ionicons name="copy" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                    <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                      Copy HTML
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                    onPress={saveHtmlAnalysis}
                  >
                    <Ionicons name="analytics" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                    <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                      Copy Full Analysis
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* HTML Preview */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  HTML Preview (First 2000 characters)
                </Text>
                <ScrollView
                  style={[styles.htmlPreview, isDarkMode && styles.htmlPreviewDark]}
                  horizontal={true}
                >
                  <Text style={[styles.htmlText, isDarkMode && styles.htmlTextDark]}>
                    {html.substring(0, 2000)}{html.length > 2000 ? '\n\n... (truncated, use Copy HTML for full content)' : ''}
                  </Text>
                </ScrollView>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </>
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
      <>
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

        {/* Debug Modal */}
        <Modal
          visible={showDebugModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowDebugModal(false)}
          onShow={() => console.log('Debug modal shown!')}
          onDismiss={() => console.log('Debug modal dismissed!')}
        >
          <SafeAreaView style={[styles.debugModal, isDarkMode && styles.debugModalDark]}>
            <View style={[styles.debugHeader, isDarkMode && styles.debugHeaderDark]}>
              <Text style={[styles.debugTitle, isDarkMode && styles.debugTitleDark]}>
                Email HTML Debug
              </Text>
              <TouchableOpacity
                onPress={() => setShowDebugModal(false)}
                style={styles.debugCloseButton}
              >
                <Ionicons name="close" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.debugContent}>
              {/* Email Analysis */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  Email Analysis
                </Text>
                <Text style={[styles.debugText, isDarkMode && styles.debugTextDark]}>
                  HTML Length: {html.length} characters{'\n'}
                  Complexity Score: {emailAnalysis.complexity}{'\n'}
                  Has Images: {emailAnalysis.hasImages ? 'Yes' : 'No'} ({emailAnalysis.imageCount} images){'\n'}
                  Has Complex Layout: {emailAnalysis.hasComplexLayout ? 'Yes' : 'No'}{'\n'}
                  Has Inline Styles: {emailAnalysis.hasInlineStyles ? 'Yes' : 'No'}{'\n'}
                  Has External CSS: {emailAnalysis.hasExternalCSS ? 'Yes' : 'No'}{'\n'}
                  Current Rendering Method: {shouldUseWebView ? 'WebView' : 'Native'}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  Export Options
                </Text>
                <View style={styles.debugButtons}>
                  <TouchableOpacity
                    style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                    onPress={exportHtml}
                  >
                    <Ionicons name="copy" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                    <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                      Copy HTML
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                    onPress={saveHtmlAnalysis}
                  >
                    <Ionicons name="analytics" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                    <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                      Copy Full Analysis
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* HTML Preview */}
              <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
                <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                  HTML Preview (First 2000 characters)
                </Text>
                <ScrollView
                  style={[styles.htmlPreview, isDarkMode && styles.htmlPreviewDark]}
                  horizontal={true}
                >
                  <Text style={[styles.htmlText, isDarkMode && styles.htmlTextDark]}>
                    {html.substring(0, 2000)}{html.length > 2000 ? '\n\n... (truncated, use Copy HTML for full content)' : ''}
                  </Text>
                </ScrollView>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </>
    );
  }

    // Render with native HTML renderer
  return (
    <>
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

      {/* Debug Modal */}
      <Modal
        visible={showDebugModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDebugModal(false)}
        onShow={() => console.log('Debug modal shown!')}
        onDismiss={() => console.log('Debug modal dismissed!')}
      >
        <SafeAreaView style={[styles.debugModal, isDarkMode && styles.debugModalDark]}>
          <View style={[styles.debugHeader, isDarkMode && styles.debugHeaderDark]}>
            <Text style={[styles.debugTitle, isDarkMode && styles.debugTitleDark]}>
              Email HTML Debug
            </Text>
            <TouchableOpacity
              onPress={() => setShowDebugModal(false)}
              style={styles.debugCloseButton}
            >
              <Ionicons name="close" size={24} color={isDarkMode ? '#e8eaed' : '#3c4043'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.debugContent}>
            {/* Email Analysis */}
            <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
              <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                Email Analysis
              </Text>
              <Text style={[styles.debugText, isDarkMode && styles.debugTextDark]}>
                HTML Length: {html.length} characters{'\n'}
                Complexity Score: {emailAnalysis.complexity}{'\n'}
                Has Images: {emailAnalysis.hasImages ? 'Yes' : 'No'} ({emailAnalysis.imageCount} images){'\n'}
                Has Complex Layout: {emailAnalysis.hasComplexLayout ? 'Yes' : 'No'}{'\n'}
                Has Inline Styles: {emailAnalysis.hasInlineStyles ? 'Yes' : 'No'}{'\n'}
                Has External CSS: {emailAnalysis.hasExternalCSS ? 'Yes' : 'No'}{'\n'}
                Current Rendering Method: {shouldUseWebView ? 'WebView' : 'Native'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
              <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                Export Options
              </Text>
              <View style={styles.debugButtons}>
                <TouchableOpacity
                  style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                  onPress={exportHtml}
                >
                  <Ionicons name="copy" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                  <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                    Copy HTML
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.debugButton, isDarkMode && styles.debugButtonDark]}
                  onPress={saveHtmlAnalysis}
                >
                  <Ionicons name="analytics" size={16} color={isDarkMode ? '#8ab4f8' : '#1a73e8'} />
                  <Text style={[styles.debugButtonText, isDarkMode && styles.debugButtonTextDark]}>
                    Copy Full Analysis
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* HTML Preview */}
            <View style={[styles.debugSection, isDarkMode && styles.debugSectionDark]}>
              <Text style={[styles.debugSectionTitle, isDarkMode && styles.debugSectionTitleDark]}>
                HTML Preview (First 2000 characters)
              </Text>
              <ScrollView
                style={[styles.htmlPreview, isDarkMode && styles.htmlPreviewDark]}
                horizontal={true}
              >
                <Text style={[styles.htmlText, isDarkMode && styles.htmlTextDark]}>
                  {html.substring(0, 2000)}{html.length > 2000 ? '\n\n... (truncated, use Copy HTML for full content)' : ''}
                </Text>
              </ScrollView>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
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
  debugModal: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  debugModalDark: {
    backgroundColor: '#171717',
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  debugHeaderDark: {
    borderBottomColor: '#333',
  },
  debugTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  debugTitleDark: {
    color: '#e8eaed',
  },
  debugCloseButton: {
    padding: 8,
  },
  debugContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  debugSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
  },
  debugSectionDark: {
    backgroundColor: '#202124',
  },
  debugSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  debugSectionTitleDark: {
    color: '#e8eaed',
  },
  debugText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
    fontFamily: 'System',
  },
  debugTextDark: {
    color: '#d1d5db',
  },
  debugButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flex: 1,
  },
  debugButtonDark: {
    backgroundColor: '#303134',
    borderColor: '#5f6368',
  },
  debugButtonText: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '500',
    marginLeft: 8,
  },
  debugButtonTextDark: {
    color: '#8ab4f8',
  },
  htmlPreview: {
    maxHeight: 300,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  htmlPreviewDark: {
    backgroundColor: '#1f2937',
  },
  htmlText: {
    fontSize: 12,
    fontFamily: 'Courier',
    color: '#374151',
    lineHeight: 16,
  },
  htmlTextDark: {
    color: '#d1d5db',
  },
});

export default EmailRenderer; 