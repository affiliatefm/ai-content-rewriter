/**
 * AI Content Rewriter - Browser Bundle
 * =====================================
 * Optimized exports for browser environments.
 * Excludes Node.js-specific features.
 */

// Main exports (same as index)
export { ContentRewriter, rewrite, rewriteOne } from "./rewriter.js";

// Types
export type {
  ContentInput,
  ContentFormat,
  RewriteResult,
  RewriteOptions,
  RewriterConfig,
  ProviderConfig,
  ProviderType,
  RewriteProgress,
  ProgressCallback,
  StreamingResult,
  StreamingCallback,
} from "./types.js";

// Errors
export {
  RewriterError,
  ProviderError,
  ValidationError,
  RateLimitError,
} from "./types.js";

// Constants (useful for UI)
export {
  LIMITS,
  DEFAULTS,
  PROMPTS,
  MODEL_PRICING,
  getModelPricing,
  type PromptTemplateKey,
} from "./constants.js";

// Utilities (for UI helpers)
export {
  detectFormat,
  estimateTokens,
  normalizeArticleContent,
} from "./utils.js";
