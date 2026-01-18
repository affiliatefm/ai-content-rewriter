/**
 * AI Content Rewriter
 * ===================
 * AI-powered content rewriting library for ethical affiliate marketing.
 *
 * @example
 * ```typescript
 * import { ContentRewriter } from "@affiliate.fm/ai-content-rewriter";
 *
 * // Create rewriter instance (recommended)
 * const rewriter = new ContentRewriter({
 *   provider: "openai",
 *   apiKey: "sk-...",
 *   model: "gpt-4.1",
 * });
 *
 * // Rewrite content
 * const [result] = await rewriter.rewrite("<h1>Hello</h1><p>World</p>");
 * console.log(result.content);
 *
 * // Multiple variants
 * const results = await rewriter.rewrite(html, { variants: 3 });
 * ```
 */

// Main class export
export { ContentRewriter } from "./rewriter.js";

// Legacy convenience functions (deprecated but supported)
export { rewrite, rewriteOne, createRewriter } from "./rewriter.js";

// Types
export type {
  // New API types
  RewriterOptions,
  RewriteCallOptions,
  // Content types
  ContentInput,
  ContentFormat,
  RewriteResult,
  // Provider types
  ProviderConfig,
  ProviderType,
  // Progress types
  RewriteProgress,
  ProgressCallback,
  StreamingResult,
  StreamingCallback,
  // Legacy types (deprecated)
  RewriteOptions,
  RewriterConfig,
} from "./types.js";

// Errors
export {
  RewriterError,
  ProviderError,
  ValidationError,
  RateLimitError,
} from "./types.js";

// Constants
export {
  LIMITS,
  PROCESSING,
  DEFAULTS,
  PROMPTS,
  MODEL_PRICING,
  getModelPricing,
  type PromptTemplateKey,
} from "./constants.js";

// Utilities (for advanced usage)
export {
  detectFormat,
  extractTitleFromHtml,
  extractTitleFromMarkdown,
  extractDescriptionFromHtml,
  normalizeArticleContent,
  estimateTokens,
  splitIntoChunks,
  parseAiResponse,
  checkUniqueness,
  type UniquenessResult,
} from "./utils.js";

// Cost estimation
export { estimateCost, calculateCost } from "./providers/openai.js";

// Providers (for direct access - advanced)
export {
  rewriteWithOpenAI,
  rewriteLargeContentWithOpenAI,
  generateVariantsWithOpenAI,
  type OpenAIRewriteOptions,
  type OpenAIRewriteResult,
} from "./providers/index.js";

// AI Pattern Masking (anti-detection)
export {
  maskAIPatterns,
  maskAIPatternsInHTML,
  type MaskingOptions,
} from "./masker.js";
