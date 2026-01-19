/**
 * AI Content Rewriter Utilities
 * =============================
 * Helper functions for content processing.
 */

import type { ContentFormat } from "./types.js";
import { LIMITS } from "./constants.js";

// =============================================================================
// FORMAT DETECTION
// =============================================================================

/**
 * Auto-detect content format from string.
 */
export function detectFormat(content: string): ContentFormat {
  const trimmed = content.trim();

  // Check for HTML
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return "html";
  }

  // Check for Markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\[.+\]\(.+\)/, // Links
    /^\s*[-*+]\s/m, // Unordered lists
    /^\s*\d+\.\s/m, // Ordered lists
    /```[\s\S]*?```/, // Code blocks
    /`[^`]+`/, // Inline code
    /\*\*[^*]+\*\*/, // Bold
    /_[^_]+_/, // Italic (underscore)
    /\*[^*]+\*/, // Italic (asterisk)
  ];

  for (const pattern of markdownPatterns) {
    if (pattern.test(trimmed)) {
      return "markdown";
    }
  }

  return "text";
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

/**
 * Extract title from HTML content.
 */
export function extractTitleFromHtml(html: string): string {
  // Try H1 first
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return stripHtmlTags(h1Match[1]).trim();
  }

  // Try title tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return stripHtmlTags(titleMatch[1]).trim();
  }

  return "";
}

/**
 * Extract title from Markdown content.
 */
export function extractTitleFromMarkdown(markdown: string): string {
  // Try first H1
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  return "";
}

/**
 * Extract description from HTML content.
 */
export function extractDescriptionFromHtml(html: string): string {
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  );
  if (metaMatch) {
    return metaMatch[1].trim();
  }

  // Try first paragraph
  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch) {
    const text = stripHtmlTags(pMatch[1]).trim();
    return text.slice(0, LIMITS.DESCRIPTION_MAX);
  }

  return "";
}

// =============================================================================
// HTML PROCESSING
// =============================================================================

/**
 * Strip HTML tags from string.
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Normalize spacing around inline HTML tags.
 */
export function normalizeInlineSpacing(html: string): string {
  let result = html;

  const inlineTags = ["a", "strong", "b", "em", "i", "span"];

  // Clean internal whitespace in inline tags
  inlineTags.forEach((tag) => {
    const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, "gi");
    result = result.replace(re, (_m, open, content, close) => {
      const trimmed = content.replace(/\s+/g, " ").trim();
      return `${open}${trimmed}${close}`;
    });
  });

  // Space before inline opening tags if glued
  result = result.replace(
    /([^\s>])(<\/?(?:a|strong|b|em|i|span)\b)/gi,
    "$1 $2"
  );

  // Space after inline closing tags if glued to text or opening tag
  result = result.replace(
    /(<\/(?:a|strong|b|em|i|span)[^>]*>)([^\s<])/gi,
    "$1 $2"
  );

  // Remove spaces right after opening inline tags
  result = result.replace(/(<(?:a|strong|b|em|i|span)\b[^>]*>)\s+/gi, "$1");

  // Remove spaces right before closing inline tags
  result = result.replace(/\s+(<\/(?:a|strong|b|em|i|span)[^>]*>)/gi, "$1");

  // Remove space before punctuation
  result = result.replace(/\s+([,.;:!?])/g, "$1");

  // Ensure single spaces
  result = result.replace(/\s{2,}/g, " ");

  return result.trim();
}

/**
 * Ensure proper spacing around anchor tags.
 */
export function spaceAroundAnchors(html: string): string {
  return html
    .replace(/([^\s<])(<\/?a\b)/gi, "$1 $2")
    .replace(/(<\/a>)([^\s>])/gi, "$1 $2");
}

/**
 * Normalize article content (full pipeline).
 */
export function normalizeArticleContent(html: string): string {
  return normalizeInlineSpacing(spaceAroundAnchors(html));
}

/**
 * Remove markdown code block wrappers from AI response.
 */
export function removeCodeBlockWrappers(content: string): string {
  return content.replace(/^```(?:json|html)?\n?/, "").replace(/\n?```$/, "");
}

// =============================================================================
// TEXT PROCESSING
// =============================================================================

/**
 * Clamp string to min/max length.
 */
export function clampString(
  str: string,
  min: number = 0,
  max: number = Infinity
): string {
  if (str.length < min) {
    return str.padEnd(min, ".");
  }
  return str.slice(0, max);
}

/**
 * Estimate token count from text (rough approximation).
 * ~4 chars per token for English, ~2-3 for other languages.
 * Uses 3.5 as conservative average.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// =============================================================================
// CHUNKING
// =============================================================================

export interface ContentChunk {
  content: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Split large content into processable chunks.
 */
export function splitIntoChunks(
  content: string,
  chunkSize: number,
  overlap: number = 200
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let remaining = content;
  let index = 0;

  while (remaining.length > chunkSize) {
    let cutPoint = chunkSize;

    // Find nearest clean cut point
    const searchEnd = Math.min(cutPoint + 400, remaining.length);
    let bestCut = cutPoint;

    // Priorities: paragraph end > sentence end > tag end > space
    for (let i = cutPoint; i < searchEnd; i++) {
      if (remaining.slice(i, i + 4) === "</p>") {
        bestCut = i + 4;
        break;
      }
      if (
        remaining[i] === "." &&
        i + 1 < remaining.length &&
        /\s/.test(remaining[i + 1])
      ) {
        bestCut = i + 1;
      } else if (remaining[i] === ">" && bestCut === cutPoint) {
        bestCut = i + 1;
      }
    }

    cutPoint = bestCut;
    chunks.push({
      content: remaining.slice(0, cutPoint),
      index,
      isFirst: index === 0,
      isLast: false,
    });

    // Start next chunk with overlap for context
    remaining = remaining.slice(Math.max(0, cutPoint - overlap));
    index++;
  }

  // Add final chunk
  if (remaining.length > 0) {
    chunks.push({
      content: remaining,
      index,
      isFirst: index === 0,
      isLast: true,
    });
  }

  // Mark last chunk
  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

export interface ParsedResponse {
  title: string;
  description: string;
  html: string;
}

/**
 * Parse AI response to extract title, description, and HTML.
 */
export function parseAiResponse(raw: string): ParsedResponse {
  const cleaned = removeCodeBlockWrappers(raw).trim();

  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "").trim(),
      description: String(parsed.description || "").trim(),
      html: String(parsed.html || parsed.content || "").trim(),
    };
  } catch {
    // Fall through to regex parsing
  }

  // Regex extraction for malformed JSON
  const pick = (key: string, src: string): string => {
    const m = src.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return m
      ? m[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .trim()
      : "";
  };

  let title = pick("title", cleaned);
  let description = pick("description", cleaned);
  let html = "";

  // Extract HTML field
  const htmlPos = cleaned.indexOf('"html"');
  if (htmlPos !== -1) {
    const after = cleaned.slice(htmlPos + 6);
    const q1 = after.indexOf('"');
    const q2 = after.lastIndexOf('"');
    if (q1 !== -1 && q2 > q1) {
      html = after
        .slice(q1 + 1, q2)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .trim();
    }
  }

  // Fallback: try to extract from HTML content itself
  if (!title && html) {
    title = extractTitleFromHtml(html);
  }
  if (!description && html) {
    description = extractDescriptionFromHtml(html);
  }

  // Last resort: use cleaned content as HTML
  if (!html) {
    html = cleaned;
  }

  return { title, description, html };
}

// =============================================================================
// UNIQUENESS CALCULATION
// =============================================================================

// Stop words for multiple languages (filtered from uniqueness calculation)
const STOP_WORDS = new Set([
  // English
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "will", "with", "this", "but", "they", "have",
  "had", "what", "when", "where", "who", "which", "why", "how",
  "all", "would", "there", "their", "been", "if", "more", "can",
  "her", "him", "she", "my", "than", "then", "them", "these",
  "so", "some", "up", "out", "about", "into", "just", "not", "no",
  // Russian
  "и", "в", "не", "на", "я", "что", "он", "с", "как", "а", "то", "это",
  "по", "к", "но", "его", "все", "она", "так", "о", "из", "у", "же",
  "ты", "за", "бы", "от", "мы", "до", "вы", "ли", "если", "уже",
  "или", "ни", "да", "во", "под", "нет", "только", "ее", "мне", "было",
  "вот", "от", "меня", "еще", "ему", "теперь", "даже",
  // Spanish
  "el", "la", "de", "que", "y", "a", "en", "un", "ser", "se", "no", "haber",
  "por", "con", "su", "para", "como", "estar", "tener", "le", "lo", "todo",
  "pero", "más", "hacer", "o", "poder", "decir", "este", "ir", "otro",
  "ese", "si", "me", "ya", "ver", "porque", "dar", "cuando", "muy",
  // French
  "le", "de", "un", "être", "et", "à", "il", "avoir", "ne", "je", "son",
  "que", "se", "qui", "ce", "dans", "en", "du", "elle", "au", "pour",
  "pas", "vous", "par", "sur", "faire", "plus", "pouvoir", "aller",
  "mon", "dire", "avec", "tout", "mais", "y", "voir", "bien",
  // German
  "der", "die", "und", "in", "den", "von", "zu", "das", "mit", "sich",
  "des", "auf", "für", "ist", "im", "dem", "nicht", "ein", "eine", "als",
  "auch", "es", "an", "werden", "aus", "er", "hat", "dass", "sie", "nach",
  "wird", "bei", "einer", "um", "am", "sind", "noch", "wie", "einem", "über",
]);

export interface UniquenessResult {
  /** Uniqueness percentage (0-100) */
  uniqueness: number;
  /** Similarity percentage (0-100) */
  similarity: number;
  /** Whether uniqueness is considered low (<85%) */
  isLowUniqueness: boolean;
}

/**
 * Preprocess text for uniqueness calculation.
 */
function preprocessText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Create 3-word shingles from word list.
 */
function createShingles(words: string[]): Set<string> {
  const shingles = new Set<string>();
  if (words.length < 3) {
    if (words.length > 0) shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - 3; i++) {
    shingles.add(words.slice(i, i + 3).join(' '));
  }
  return shingles;
}

/**
 * Calculate Jaccard coefficient between two sets.
 */
function jaccardCoefficient(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 0;
  if (set1.size === 0 || set2.size === 0) return 1;
  
  let intersection = 0;
  for (const s of set1) {
    if (set2.has(s)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

/**
 * Check uniqueness of rewritten content compared to original.
 * Uses 3-word shingles and Jaccard coefficient (eTXT-style algorithm).
 * 
 * @param original - Original content
 * @param rewritten - Rewritten content
 * @returns Uniqueness result with percentage and flags
 * 
 * @example
 * ```typescript
 * const result = checkUniqueness(originalHtml, rewrittenHtml);
 * console.log(`${result.uniqueness}% unique`);
 * if (result.isLowUniqueness) {
 *   console.warn('Consider rewriting again');
 * }
 * ```
 */
export function checkUniqueness(original: string, rewritten: string): UniquenessResult {
  if (!original || !rewritten) {
    return { uniqueness: 0, similarity: 100, isLowUniqueness: true };
  }
  
  const originalWords = preprocessText(original);
  const rewriteWords = preprocessText(rewritten);
  const originalShingles = createShingles(originalWords);
  const rewriteShingles = createShingles(rewriteWords);
  
  const similarity = jaccardCoefficient(originalShingles, rewriteShingles);
  const uniqueness = 1 - similarity;
  
  const uniquenessPercent = Math.round(uniqueness * 100);
  const similarityPercent = Math.round(similarity * 100);
  
  return {
    uniqueness: uniquenessPercent,
    similarity: similarityPercent,
    isLowUniqueness: uniquenessPercent < 85,
  };
}

// =============================================================================
// ASYNC UTILITIES
// =============================================================================

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process items in batches with concurrency limit.
 */
export async function processInBatches<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  batchSize: number,
  delayMs: number = 0
): Promise<R[]> {
  const results = new Array<R>(items.length);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map((item, batchIndex) => {
      const actualIndex = i + batchIndex;
      return processor(item, actualIndex).then((result) => {
        results[actualIndex] = result;
      });
    });

    await Promise.all(batchPromises);

    // Add delay between batches
    if (delayMs > 0 && i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }

  return results;
}
