/**
 * AI Content Rewriter - Browser Bundle
 * =====================================
 * Optimized exports for browser environments.
 * Excludes Node.js-specific features.
 */

// Main class export
export { ContentRewriter } from "./rewriter.js";

// Types
export type {
  RewriterOptions,
  RewriteCallOptions,
  ContentInput,
  ContentFormat,
  RewriteResult,
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
  checkUniqueness,
  type UniquenessResult,
} from "./utils.js";

// Cost estimation
export { estimateCost, calculateCost } from "./providers/openai.js";

// AI Pattern Masking
export {
  maskAIPatterns,
  maskAIPatternsInHTML,
  type MaskingOptions,
} from "./masker.js";
