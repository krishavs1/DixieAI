import React, { useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Your master "Gmail-style" CSS (applied to every email)
const GMAIL_CSS = `
* {
  box-sizing: border-box;
}

body {
  font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', arial, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: #3c4043;
  background-color: #ffffff;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* Gmail-style typography */
p {
  margin: 0 0 1em 0;
  font-size: 14px;
  line-height: 1.4;
  color: #3c4043;
}

div, span {
  font-size: 14px;
  line-height: 1.4;
  color: #3c4043;
}

/* Gmail-style links */
a {
  color: #1a73e8;
  text-decoration: none;
  cursor: pointer;
}
a:hover {
  text-decoration: underline;
}

/* Gmail-style headers */
h1 {
  font-size: 24px;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 16px 0;
  color: #3c4043;
}
h2 {
  font-size: 20px;
  font-weight: 400;
  line-height: 1.3;
  margin: 0 0 14px 0;
  color: #3c4043;
}
h3 {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.3;
  margin: 0 0 12px 0;
  color: #3c4043;
}
h4, h5, h6 {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  margin: 0 0 10px 0;
  color: #3c4043;
}

/* Gmail-style emphasis */
strong, b {
  font-weight: 500;
  color: #3c4043;
}
em, i {
  font-style: italic;
  color: #3c4043;
}

/* Gmail-style lists */
ul, ol {
  margin: 0 0 1em 0;
  padding-left: 24px;
}
li {
  margin-bottom: 0.25em;
  font-size: 14px;
  line-height: 1.4;
  color: #3c4043;
}

/* Gmail-style tables */
table {
  border-collapse: collapse;
  width: 100%;
  max-width: 100%;
  margin: 16px 0;
  font-size: 14px;
}
td, th {
  padding: 8px 12px;
  border: 1px solid #dadce0;
  text-align: left;
  vertical-align: top;
  font-size: 14px;
  line-height: 1.4;
  color: #3c4043;
}
th {
  background-color: #f8f9fa;
  font-weight: 500;
}

/* Gmail-style images */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 8px 0;
  border-radius: 8px;
}

/* Gmail-style blockquotes */
blockquote {
  border-left: 4px solid #dadce0;
  margin: 16px 0;
  padding: 0 0 0 16px;
  color: #5f6368;
  font-style: italic;
}

/* Gmail-style quoted sections */
details {
  margin: 16px 0;
  border: 1px solid #dadce0;
  border-radius: 8px;
  overflow: hidden;
}
summary {
  cursor: pointer;
  padding: 12px 16px;
  background-color: #f8f9fa;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: #5f6368;
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  user-select: none;
  transition: background-color 0.2s ease;
}
summary:hover {
  background-color: #f1f3f4;
}
summary::-webkit-details-marker {
  display: none;
}
details[open] summary {
  border-bottom: 1px solid #dadce0;
}
details > div {
  padding: 16px;
  background-color: #ffffff;
}

/* Gmail-style code blocks */
pre {
  background-color: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.4;
  margin: 16px 0;
}
code {
  background-color: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 4px;
  padding: 2px 6px;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 13px;
  color: #3c4043;
}

/* Gmail-style horizontal rules */
hr {
  border: none;
  border-top: 1px solid #dadce0;
  margin: 24px 0;
}

/* Gmail-style image placeholders */
.blocked-image {
  border: 1px dashed #dadce0;
  border-radius: 8px;
  padding: 16px;
  margin: 8px 0;
  background-color: #f8f9fa;
  text-align: center;
  font-size: 13px;
  color: #5f6368;
}
.blocked-image-icon {
  font-size: 24px;
  margin-bottom: 8px;
  display: block;
}
.blocked-image-text {
  font-weight: 500;
  margin-bottom: 4px;
}
.blocked-image-source {
  font-size: 12px;
  opacity: 0.8;
}

/* Gmail-style spacing */
.gmail-content {
  padding: 20px 0;
}

/* Remove double <br> gaps */
br + br {
  display: none;
}

/* Responsive tweaks */
@media (max-width: 480px) {
  body { font-size: 13px; }
  h1 { font-size: 20px; }
  h2 { font-size: 18px; }
  table { font-size: 12px; }
  td, th { padding: 6px 8px; }
  pre, code { font-size: 12px; }
}

/* ===== GMAIL EMAIL RESET RULES ===== */
/* 1. Strip every border */
table, td, th {
  border: none !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
table[border] { 
  border: none !important; 
}

/* 2. Enforce fluid widths */
table { 
  width: auto !important; 
  max-width: 100% !important; 
  table-layout: auto !important; 
}
img {
  max-width: 100% !important;
  height: auto !important;
  display: block !important;
}

/* 3. Remove extra gutters on wrappers */
.gmail-content,
.gmail-content table,
.wrapper, .container, .email-wrapper {
  padding: 0 !important;
  margin: 0 auto !important;
  width: auto !important;
  max-width: 100% !important;
}

/* Additional email-specific resets */
*[style*="border"] {
  border: none !important;
}
*[style*="padding"] {
  padding: 0 !important;
}
*[style*="margin"] {
  margin: 0 !important;
}
*[style*="width: 600px"],
*[style*="width: 650px"],
*[style*="width: 700px"] {
  width: auto !important;
  max-width: 100% !important;
}
`;

// JS snippet injected to measure content height
const MEASURE_JS = `
(function() {
  function sendHeight() {
    const h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    window.ReactNativeWebView.postMessage(h);
  }
  window.addEventListener('load', sendHeight);
  setTimeout(sendHeight, 500);
})();
true;
`;

interface EmailRendererProps {
  html: string; // raw email HTML (body/content)
}

export default function EmailRenderer({ html }: EmailRendererProps) {
  const [height, setHeight] = useState(0);
  const webviewRef = useRef<WebView>(null);

  // Debug log to confirm new code is running
  console.log('🎯 NEW EmailRenderer loaded! HTML length:', html?.length || 0);

  // Strip out any existing <style> blocks in the raw HTML
  const sanitized = html.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Wrap in a minimal document + our Gmail CSS
  const wrappedHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${GMAIL_CSS}</style>
      </head>
      <body>
        <div class="gmail-content">
          ${sanitized}
        </div>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {height === 0 && (
        <ActivityIndicator style={StyleSheet.absoluteFill} size="large" />
      )}
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html: wrappedHTML }}
        style={[styles.webview, { height }]}
        injectedJavaScript={MEASURE_JS}
        onMessage={e => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0) setHeight(h);
        }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        automaticallyAdjustContentInsets={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#fff',
  },
  webview: {
    width: SCREEN_WIDTH - 20,
    marginHorizontal: 10,
    backgroundColor: '#fff',
  },
});
