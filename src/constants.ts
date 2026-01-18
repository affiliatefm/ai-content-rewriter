/**
 * AI Content Rewriter Constants
 * =============================
 * Configuration constants and built-in prompts.
 */

// =============================================================================
// LIMITS
// =============================================================================

export const LIMITS = {
  /** Minimum title length */
  TITLE_MIN: 3,
  /** Maximum title length */
  TITLE_MAX: 200,
  /** Maximum description length */
  DESCRIPTION_MAX: 300,
  /** Maximum HTML content length */
  HTML_MAX: 41999,
  /** Threshold for chunked processing (characters) */
  LARGE_ARTICLE_THRESHOLD: 12000,
  /** Default chunk size for large articles */
  CHUNK_SIZE: 2800,
  /** Maximum rewrites per batch */
  MAX_REWRITES: 30,
  /** Minimum rewrites */
  MIN_REWRITES: 1,
} as const;

// =============================================================================
// PROCESSING
// =============================================================================

export const PROCESSING = {
  /** Maximum concurrent chunk processing */
  MAX_CONCURRENT_CHUNKS: 5,
  /** Delay between chunk batches (ms) */
  CHUNK_BATCH_DELAY_MS: 200,
  /** Maximum retries for failed requests */
  MAX_RETRIES: 5,
  /** Base delay for exponential backoff (ms) */
  RETRY_BASE_DELAY_MS: 1000,
} as const;

// =============================================================================
// MODEL PRICING (USD per 1M tokens)
// =============================================================================

export interface ModelPricing {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // GPT-4.1 series (latest) - prices as of Jan 2026
  "gpt-4.1": { input: 5.0, output: 15.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  // GPT-4o series
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // GPT-4 Turbo
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4-turbo-preview": { input: 10.0, output: 30.0 },
  // GPT-4
  "gpt-4": { input: 30.0, output: 60.0 },
  // GPT-3.5
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Default fallback
  default: { input: 5.0, output: 15.0 },
};

export function getModelPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return pricing;
  }
  return MODEL_PRICING["default"];
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULTS = {
  /** Default model for OpenAI */
  MODEL: "gpt-4.1",
  /** Default temperature (0.9 for creative rewrites) */
  TEMPERATURE: 0.9,
  /** Top P for diversity */
  TOP_P: 0.95,
  /** Frequency penalty to reduce repetition */
  FREQUENCY_PENALTY: 0.3,
  /** Presence penalty to encourage new topics */
  PRESENCE_PENALTY: 0.3,
  /** Default variant count */
  VARIANT_COUNT: 1,
  /** Default prompt template */
  PROMPT_TEMPLATE: "MULTILINGUAL_DEFAULT",
  /** Max tokens for content generation */
  MAX_TOKENS: 4096,
  /** Max tokens for title/description */
  MAX_TOKENS_META: 500,
} as const;

// =============================================================================
// BUILT-IN PROMPTS
// =============================================================================

export const PROMPTS = {
  MULTILINGUAL_DEFAULT: {
    name: "Multilingual Rewrite (Auto-detect)",
    prompt: `You are a professional copywriter. Your task is to create a COMPLETELY unique rewrite while preserving meaning and SEO value.

CRITICAL LANGUAGE RULE:
- ALWAYS write the rewrite in the SAME LANGUAGE as the original content
- If the original is in English, write in English
- If the original is in Russian, write in Russian
- If the original is in any other language, maintain that language
- NEVER translate or change the language unless explicitly requested

IMPORTANT REWRITING RULES:
1. COMPLETELY reformulate every sentence - change structure, word order, and phrasing
2. Title and Description must be COMPLETELY rewritten, not just paraphrased
3. Use synonyms and alternative expressions while preserving meaning accuracy
4. All headings (H1, H2, H3) must be reformulated while maintaining appeal and SEO value
5. Preserve brand mentions and important keywords (as indicated in the text)
6. Vary sentence length and paragraph structure for naturalness
7. Maintain factual accuracy while presenting information differently
8. Preserve HTML structure but change text content by 90-95%
9. DO NOT copy phrases from the original verbatim
10. If you see repeating phrases or patterns - vary them

WRITING STYLE:
- Professional yet accessible
- Engaging and informative
- Natural language without bureaucratic expressions
- Appropriate for the target audience

DO NOT:
- Copy phrases or sentence structures from the original
- Use the same templates for different paragraphs
- Change the language of the content
- Simplify the text to a primitive level

Return only the rewritten content without any additional formatting or explanation.`,
  },

  SEO_FOCUSED: {
    name: "SEO-Focused Rewrite",
    prompt: `You are an SEO expert and professional copywriter. Create a unique rewrite optimized for search engines.

LANGUAGE RULE:
- Maintain the SAME LANGUAGE as the original content

SEO OPTIMIZATION:
1. Preserve and naturally integrate target keywords
2. Optimize title for click-through rate (50-60 characters ideal)
3. Meta description should be compelling and 150-160 characters
4. Use semantic keywords and LSI terms
5. Maintain proper heading hierarchy (H1, H2, H3)
6. Include calls-to-action where appropriate

REWRITING RULES:
1. Complete sentence restructuring - no copied phrases
2. Vary paragraph length for readability
3. Add transitional phrases for flow
4. Maintain factual accuracy
5. Keep HTML structure intact

Return only the rewritten content without any additional formatting or explanation.`,
  },

  CASUAL_TONE: {
    name: "Casual/Conversational Tone",
    prompt: `You are a friendly content writer. Rewrite the content in a casual, conversational tone.

LANGUAGE RULE:
- Keep the SAME LANGUAGE as the original

TONE GUIDELINES:
1. Write as if talking to a friend
2. Use contractions (it's, you're, we'll)
3. Include rhetorical questions
4. Add personality and warmth
5. Keep it relatable and approachable

REWRITING RULES:
1. Completely rephrase all sentences
2. Make complex topics easy to understand
3. Use shorter sentences and paragraphs
4. Add humor where appropriate (but stay professional)
5. Preserve key information and HTML structure

Return only the rewritten content without any additional formatting or explanation.`,
  },

  FORMAL_PROFESSIONAL: {
    name: "Formal/Professional Tone",
    prompt: `You are a professional business writer. Rewrite the content in a formal, authoritative tone.

LANGUAGE RULE:
- Maintain the SAME LANGUAGE as the original

TONE GUIDELINES:
1. Use formal vocabulary and sentence structures
2. Avoid contractions and colloquialisms
3. Maintain objective, third-person perspective where possible
4. Include industry-specific terminology appropriately
5. Project expertise and credibility

REWRITING RULES:
1. Completely restructure all sentences
2. Use precise, unambiguous language
3. Maintain logical flow and organization
4. Support claims with clear reasoning
5. Preserve HTML structure and formatting

Return only the rewritten content without any additional formatting or explanation.`,
  },

  CUSTOM: {
    name: "Custom Prompt",
    prompt: "",
  },
} as const;

export type PromptTemplateKey = keyof typeof PROMPTS;
