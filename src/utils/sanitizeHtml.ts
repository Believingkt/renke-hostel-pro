import DOMPurify from 'dompurify';

interface SanitizeConfig {
  ALLOWED_TAGS?: string[];
  ALLOWED_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param dirty - The untrusted HTML string
 * @param options - Optional DOMPurify configuration
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(dirty: string | null | undefined, options?: SanitizeConfig): string {
  if (!dirty) return '';
  
  // Default config allows common HTML tags but removes dangerous ones
  const defaultConfig: SanitizeConfig = {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'ul', 'ol', 'li',
      'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
      'a', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'pre', 'code',
      'img',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'title', 'width', 'height',
      'class', 'style',
    ],
    ALLOW_DATA_ATTR: false,
  };

  const config = { ...defaultConfig, ...options };
  
  // Sanitize the HTML and ensure it returns a string
  let clean = DOMPurify.sanitize(dirty, { ...config, RETURN_TRUSTED_TYPE: false }) as string;
  
  // Add target="_blank" and rel="noopener noreferrer" to all links
  clean = clean.replace(/<a\s/g, '<a target="_blank" rel="noopener noreferrer" ');
  
  return clean;
}

/**
 * Create props for dangerouslySetInnerHTML with sanitized content
 * @param dirty - The untrusted HTML string
 * @returns Object with __html property containing sanitized HTML
 */
export function createSanitizedHtml(dirty: string | null | undefined): { __html: string } {
  return { __html: sanitizeHtml(dirty) };
}

/**
 * Sanitize AI-generated text content to prevent XSS attacks
 * This is more restrictive than sanitizeHtml - only allows plain text
 * Removes all HTML tags and returns escaped text content
 * @param dirty - The AI-generated text content
 * @returns Sanitized plain text safe for display
 */
export function sanitizeAIContent(dirty: string | null | undefined): string {
  if (!dirty) return '';
  
  // Remove all HTML tags - AI responses should be plain text only
  const sanitized = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: [], // No attributes allowed
    KEEP_CONTENT: true, // Keep the text content
    RETURN_TRUSTED_TYPE: false,
  }) as string;
  
  return sanitized;
}
