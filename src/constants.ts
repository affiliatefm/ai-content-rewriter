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

// Only gpt-4.1 is supported
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1": { input: 5.0, output: 15.0 },
  default: { input: 5.0, output: 15.0 },
};

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING["gpt-4.1"];
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULTS = {
  /** Default model - only gpt-4.1 supported */
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
  PROMPT_TEMPLATE: "DEFAULT",
  /** Max tokens for content generation */
  MAX_TOKENS: 4096,
  /** Max tokens for title/description */
  MAX_TOKENS_META: 500,
} as const;

// =============================================================================
// DEFAULT REWRITE PROMPT
// =============================================================================

export const DEFAULT_REWRITE_PROMPT = `You are a professional copywriter. Your task is to create a COMPLETELY unique rewrite while preserving meaning and SEO value.

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

Return only the rewritten content without any additional formatting or explanation.`;

// =============================================================================
// BUILT-IN PROMPTS (only default + custom)
// =============================================================================

export const PROMPTS = {
  DEFAULT: {
    name: "Default Rewrite",
    prompt: DEFAULT_REWRITE_PROMPT,
  },
  CUSTOM: {
    name: "Custom Prompt",
    prompt: "",
  },
} as const;

export type PromptTemplateKey = keyof typeof PROMPTS;
