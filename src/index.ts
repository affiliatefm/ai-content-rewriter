/**
 * AI Content Rewriter
 * ===================
 * AI-powered content rewriting library for ethical affiliate marketing.
 *
 * @example
 * ```typescript
 * import { rewrite, ContentRewriter } from "@affiliate.fm/ai-content-rewriter";
 *
 * // Quick usage
 * const results = await rewrite(
 *   { content: "<h1>Hello</h1><p>World</p>" },
 *   {
 *     provider: { type: "openai", apiKey: "sk-..." },
 *     variantCount: 3,
 *   }
 * );
 *
 * // Class-based usage with config
 * const rewriter = new ContentRewriter({
 *   defaultProvider: { type: "openai", model: "gpt-4.1" },
 * });
 * const results = await rewriter.rewrite(content, options);
 * ```
 */

// Main exports
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
} from "./utils.js";

// Providers (for direct access)
export {
  rewriteWithOpenAI,
  rewriteLargeContentWithOpenAI,
  generateVariantsWithOpenAI,
  type OpenAIRewriteOptions,
  type OpenAIRewriteResult,
} from "./providers/index.js";
