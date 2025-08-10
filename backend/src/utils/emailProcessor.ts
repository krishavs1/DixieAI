const he = require('he');



export interface ProcessEmailOptions {
  html: string;
  shouldLoadImages: boolean;
  theme?: 'light' | 'dark';
}

export interface ProcessEmailResult {
  processedHtml: string;
  hasBlockedImages: boolean;
  plainTextContent: string;
}

export function processEmailHtml({ html, shouldLoadImages, theme = 'light' }: ProcessEmailOptions): ProcessEmailResult {
  let hasBlockedImages = false;
  let processedHtml = html;
  
  const isDarkTheme = theme === 'dark';

  // Decode HTML entities
  processedHtml = he.decode(processedHtml);

  // Remove DOCTYPE, html, head, and body tags that interfere with react-native-render-html
  processedHtml = processedHtml
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]*>/gi, '');



  // Remove scripts and styles for security
  processedHtml = processedHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove tracking pixels (1x1 images)
  processedHtml = processedHtml
    .replace(/<img[^>]*width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?[^>]*>/gi, '')
    .replace(/<img[^>]*height\s*=\s*["']?1["']?[^>]*width\s*=\s*["']?1["']?[^>]*>/gi, '')
    .replace(/<img[^>]*width\s*=\s*["']?0["']?[^>]*height\s*=\s*["']?0["']?[^>]*>/gi, '')
    .replace(/<img[^>]*height\s*=\s*["']?0["']?[^>]*width\s*=\s*["']?0["']?[^>]*>/gi, '');

  // Remove preheader text (hidden email content)
  processedHtml = processedHtml
    .replace(/<div[^>]*class="preheader"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="preheaderText"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class[^>]*preheader[^>]*>[\s\S]*?<\/div>/gi, '');

  // Convert common email styling patterns to inline styles
  processedHtml = processedHtml
    // Convert background colors
    .replace(/<div[^>]*style="[^"]*background-color:\s*#([0-9a-fA-F]{6})[^"]*"/gi, (match, color) => {
      return match.replace(/style="([^"]*)"/, `style="$1; backgroundColor: #${color}"`);
    })
    // Convert text colors
    .replace(/<div[^>]*style="[^"]*color:\s*#([0-9a-fA-F]{6})[^"]*"/gi, (match, color) => {
      return match.replace(/style="([^"]*)"/, `style="$1; color: #${color}"`);
    })
    // Convert font sizes
    .replace(/<div[^>]*style="[^"]*font-size:\s*(\d+px)[^"]*"/gi, (match, size) => {
      return match.replace(/style="([^"]*)"/, `style="$1; fontSize: ${size}"`);
    })
    // Convert text alignment
    .replace(/<div[^>]*style="[^"]*text-align:\s*(center|left|right)[^"]*"/gi, (match, align) => {
      return match.replace(/style="([^"]*)"/, `style="$1; textAlign: ${align}"`);
    });

  // Remove elements with visibility hidden or display none
  processedHtml = processedHtml
    .replace(/<[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*visibility:\s*hidden[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*font-size:\s*0[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*opacity:\s*0[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '');

  // Preserve quoted text content - don't remove blockquotes or quoted sections
  // Only remove truly hidden content, not quoted text
  processedHtml = processedHtml
    .replace(/<[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*visibility:\s*hidden[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*font-size:\s*0[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    .replace(/<[^>]*style="[^"]*opacity:\s*0[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '');

  // Ensure blockquotes and quoted text are preserved
  processedHtml = processedHtml
    .replace(/<blockquote[^>]*>/gi, '<blockquote style="border-left: 4px solid #dadce0; margin: 8px 0; padding: 0 0 0 12px; color: #5f6368; font-size: 13px; line-height: 1.4;">')
    .replace(/<div[^>]*style="[^"]*border-left[^"]*"[^>]*>/gi, (match) => {
      // Preserve divs with border-left (quoted text indicators)
      return match.replace(/style="([^"]*)"/, 'style="$1; border-left: 4px solid #dadce0; margin: 8px 0; padding: 0 0 0 12px; color: #5f6368; font-size: 13px; line-height: 1.4;"');
    });

  // Process images based on shouldLoadImages setting
  if (!shouldLoadImages) {
    // Block external images but allow inline (base64) images
    processedHtml = processedHtml.replace(/<img([^>]*)src="([^"]*)"([^>]*)>/gi, (match, before, src, after) => {
      if (src.startsWith('data:') || src.startsWith('cid:')) {
        // Allow inline images and content ID references
        return match;
      } else if (src.startsWith('about:') || src.startsWith('javascript:') || src.startsWith('data:application/')) {
        // Block problematic URLs that can cause crashes
        hasBlockedImages = true;
        return `<div class="blocked-image">
          <div class="blocked-image-icon">⚠️</div>
          <div class="blocked-image-text">Image blocked for security</div>
          <div class="blocked-image-source">Unsafe URL scheme</div>
        </div>`;
      } else {
        // Block external images
        hasBlockedImages = true;
        try {
          const hostname = new URL(src).hostname;
          return `<div class="blocked-image">
            <div class="blocked-image-icon">📷</div>
            <div class="blocked-image-text">Image blocked for privacy</div>
            <div class="blocked-image-source">External image from: ${hostname}</div>
          </div>`;
        } catch {
          return `<div class="blocked-image">
            <div class="blocked-image-icon">📷</div>
            <div class="blocked-image-text">Image blocked for privacy</div>
            <div class="blocked-image-source">External image</div>
          </div>`;
        }
      }
    });
  } else {
    // Allow images but still block problematic URLs
    processedHtml = processedHtml.replace(/<img([^>]*)src="([^"]*)"([^>]*)>/gi, (match, before, src, after) => {
      if (src.startsWith('about:') || src.startsWith('javascript:') || src.startsWith('data:application/')) {
        // Block problematic URLs that can cause crashes
        hasBlockedImages = true;
        return `<div class="blocked-image">
          <div class="blocked-image-icon">⚠️</div>
          <div class="blocked-image-text">Image blocked for security</div>
          <div class="blocked-image-source">Unsafe URL scheme</div>
        </div>`;
      } else {
        // Allow all other images (including external ones)
        return match;
      }
    });
  }

  // Add security attributes to all links
  processedHtml = processedHtml.replace(/<a([^>]*)>/gi, (match, attributes) => {
    let newAttributes = attributes;
    
    // Add or update target and rel attributes
    if (!newAttributes.includes('target=')) {
      newAttributes += ' target="_blank"';
    }
    if (!newAttributes.includes('rel=')) {
      newAttributes += ' rel="noopener noreferrer"';
    }
    
    return `<a${newAttributes}>`;
  });

  // Collapse quoted text (Gmail quotes and blockquotes)
  processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    return `<details style="margin-top: 1em; border-left: 2px solid ${isDarkTheme ? '#374151' : '#d1d5db'}; padding-left: 8px;">
      <summary style="cursor: pointer; color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'}; list-style: none; user-select: none;">
        📧 Show quoted text
      </summary>
      <div style="margin-top: 8px;">${content}</div>
    </details>`;
  });

  // Process Gmail quote divs
  processedHtml = processedHtml.replace(/<div[^>]*class="gmail_quote"[^>]*>([\s\S]*?)<\/div>/gi, (match, content) => {
    return `<details style="margin-top: 1em; border-left: 2px solid ${isDarkTheme ? '#374151' : '#d1d5db'}; padding-left: 8px;">
      <summary style="cursor: pointer; color: ${isDarkTheme ? '#9CA3AF' : '#6B7280'}; list-style: none; user-select: none;">
        📧 Show quoted text
      </summary>
      <div style="margin-top: 8px;">${content}</div>
    </details>`;
  });

  // Clean up excessive whitespace but preserve structure
  processedHtml = processedHtml
    .replace(/\n\s*\n/g, '\n') // Remove multiple blank lines
    .replace(/>\s+</g, '><') // Remove whitespace between tags
    .trim();

  // Apply Gmail-exact theme-specific styling
  const themeStyles = `
    <style>
      * {
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', arial, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
        background-color: ${isDarkTheme ? '#202124' : '#ffffff'};
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
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      div {
        font-size: 14px;
        line-height: 1.4;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      span {
        font-size: inherit;
        line-height: inherit;
        color: inherit;
      }
      
      /* Gmail-style links */
      a {
        color: ${isDarkTheme ? '#8ab4f8' : '#1a73e8'};
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
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      h2 {
        font-size: 20px;
        font-weight: 400;
        line-height: 1.3;
        margin: 0 0 14px 0;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      h3 {
        font-size: 16px;
        font-weight: 500;
        line-height: 1.3;
        margin: 0 0 12px 0;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      h4, h5, h6 {
        font-size: 14px;
        font-weight: 500;
        line-height: 1.3;
        margin: 0 0 10px 0;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      /* Gmail-style emphasis */
      strong, b {
        font-weight: 500;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      em, i {
        font-style: italic;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
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
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
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
        border: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        text-align: left;
        vertical-align: top;
        font-size: 14px;
        line-height: 1.4;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      th {
        background-color: ${isDarkTheme ? '#3c4043' : '#f8f9fa'};
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
        border-left: 4px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        margin: 16px 0;
        padding: 0 0 0 16px;
        color: ${isDarkTheme ? '#9aa0a6' : '#5f6368'};
        font-style: italic;
      }
      
      /* Gmail-style quoted text sections */
      details {
        margin: 16px 0;
        border: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        border-radius: 8px;
        overflow: hidden;
      }
      
      summary {
        cursor: pointer;
        padding: 12px 16px;
        background-color: ${isDarkTheme ? '#3c4043' : '#f8f9fa'};
        border: none;
        font-size: 13px;
        font-weight: 500;
        color: ${isDarkTheme ? '#9aa0a6' : '#5f6368'};
        display: flex;
        align-items: center;
        gap: 8px;
        list-style: none;
        user-select: none;
        transition: background-color 0.2s ease;
      }
      
      summary:hover {
        background-color: ${isDarkTheme ? '#48494a' : '#f1f3f4'};
      }
      
      summary::-webkit-details-marker {
        display: none;
      }
      
      details[open] summary {
        border-bottom: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
      }
      
      details > div {
        padding: 16px;
        background-color: ${isDarkTheme ? '#202124' : '#ffffff'};
      }
      
      /* Gmail-style code blocks */
      pre {
        background-color: ${isDarkTheme ? '#3c4043' : '#f8f9fa'};
        border: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        border-radius: 8px;
        padding: 16px;
        overflow-x: auto;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.4;
        margin: 16px 0;
      }
      
      code {
        background-color: ${isDarkTheme ? '#3c4043' : '#f8f9fa'};
        border: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        border-radius: 4px;
        padding: 2px 6px;
        font-family: 'Roboto Mono', 'Courier New', monospace;
        font-size: 13px;
        color: ${isDarkTheme ? '#e8eaed' : '#3c4043'};
      }
      
      /* Gmail-style horizontal rules */
      hr {
        border: none;
        border-top: 1px solid ${isDarkTheme ? '#5f6368' : '#dadce0'};
        margin: 24px 0;
      }
      
      /* Gmail-style image placeholders */
      .blocked-image {
        border: 1px dashed ${isDarkTheme ? '#5f6368' : '#dadce0'};
        border-radius: 8px;
        padding: 16px;
        margin: 8px 0;
        background-color: ${isDarkTheme ? '#3c4043' : '#f8f9fa'};
        text-align: center;
        font-size: 13px;
        color: ${isDarkTheme ? '#9aa0a6' : '#5f6368'};
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
      
      /* Gmail-style spacing adjustments */
      .gmail-content {
        padding: 20px 0;
      }
      
      /* Remove excessive spacing from email HTML */
      br + br {
        display: none;
      }
      
      /* Gmail-style responsive design */
      @media (max-width: 480px) {
        body {
          font-size: 13px;
        }
        
        h1 {
          font-size: 20px;
        }
        
        h2 {
          font-size: 18px;
        }
        
        table {
          font-size: 12px;
        }
        
        td, th {
          padding: 6px 8px;
        }
        
        pre, code {
          font-size: 12px;
        }
      }
    </style>
  `;

  // Wrap content with theme styles and Gmail-style container
  // Add proper spacing between elements
  processedHtml = processedHtml
    .replace(/<\/p>\s*<p>/g, '</p>\n<p>')
    .replace(/<\/div>\s*<div>/g, '</div>\n<div>')
    .replace(/<\/h[1-6]>\s*<h[1-6]>/g, '</h$1>\n<h$2>')
    .replace(/<\/li>\s*<li>/g, '</li>\n<li>');
  
  processedHtml = `${themeStyles}<div class="gmail-content">${processedHtml}</div>`;

  // Generate plain text version
  const plainTextContent = he.decode(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

  return {
    processedHtml,
    hasBlockedImages,
    plainTextContent,
  };
}

export function stripHtmlTags(html: string): string {
  return he.decode(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

export function extractEmailBody(payload: any): string {
  // Extract HTML body from Gmail API message payload
  let body = '';
  
  if (payload?.body?.data) {
    // Simple message body
    body = Buffer.from(payload.body.data, 'base64').toString();
  } else if (payload?.parts) {
    // Multipart message - prioritize HTML over plain text
    const htmlPart = payload.parts.find((part: any) => part.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      body = Buffer.from(htmlPart.body.data, 'base64').toString();
    } else {
      // Fall back to plain text
      const textPart = payload.parts.find((part: any) => part.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString();
      }
    }
    
    // If we still don't have content, recursively check nested parts
    if (!body) {
      body = extractEmailBodyRecursive(payload.parts);
    }
  }
  
  return body;
}

function extractEmailBodyRecursive(parts: any[]): string {
  let body = '';
  
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      body = Buffer.from(part.body.data, 'base64').toString();
      break;
    } else if (part.mimeType === 'text/plain' && part.body?.data && !body) {
      // Use plain text as fallback
      body = Buffer.from(part.body.data, 'base64').toString();
    } else if (part.parts) {
      // Recursively check nested parts
      const nestedBody = extractEmailBodyRecursive(part.parts);
      if (nestedBody && !body) {
        body = nestedBody;
      }
    }
  }
  
  return body;
}

export function findInlineImages(payload: any): Array<{id: string, contentId: string, data: string}> {
  const inlineImages: Array<{id: string, contentId: string, data: string}> = [];
  
  if (payload?.parts) {
    payload.parts.forEach((part: any) => {
      const contentDisposition = part.headers?.find((h: any) => h.name?.toLowerCase() === 'content-disposition')?.value || '';
      const contentId = part.headers?.find((h: any) => h.name?.toLowerCase() === 'content-id')?.value;
      
      if (contentDisposition.toLowerCase().includes('inline') && contentId && part.body?.attachmentId) {
        inlineImages.push({
          id: part.body.attachmentId,
          contentId: contentId.replace(/[<>]/g, ''),
          data: part.body.data || '',
        });
      }
    });
  }
  
  return inlineImages;
}

export function processInlineImages(html: string, attachmentMap: Map<string, string>): string {
  let processedHtml = html;
  
  // Replace cid: references with base64 data
  attachmentMap.forEach((data, contentId) => {
    const cidRegex = new RegExp(`cid:${contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    processedHtml = processedHtml.replace(cidRegex, data);
  });
  
  return processedHtml;
} 