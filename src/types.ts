/**
 * AI Content Rewriter Types
 * =========================
 * Core type definitions for the rewriter library.
 */

// =============================================================================
// CONTENT TYPES
// =============================================================================

export type ContentFormat = "html" | "markdown" | "text";

export interface ContentInput {
  /** Main content to rewrite (HTML, Markdown, or plain text) */
  content: string;
  /** Page title (optional, will be extracted from content if not provided) */
  title?: string;
  /** Meta description (optional) */
  description?: string;
  /** Content format (auto-detected if not specified) */
  format?: ContentFormat;
}

export interface RewriteResult {
  /** Rewritten content */
  content: string;
  /** Rewritten title */
  title: string;
  /** Rewritten description */
  description: string;
  /** Cost of this rewrite in USD (if available) */
  cost?: number;
  /** Original format that was detected/used */
  format: ContentFormat;
}

// =============================================================================
// PROVIDER TYPES
// =============================================================================

export type ProviderType = "openai" | "anthropic" | "custom";

export interface ProviderConfig {
  /** Provider type */
  type: ProviderType;
  /** API key for the provider */
  apiKey: string;
  /** Model to use (e.g., "gpt-4.1", "claude-3-opus") */
  model?: string;
  /** Base URL for custom providers or proxies */
  baseUrl?: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

// =============================================================================
// REWRITE OPTIONS
// =============================================================================

export interface RewriteOptions {
  /** Provider configuration */
  provider: ProviderConfig;
  /** Custom prompt (uses built-in if not specified) */
  prompt?: string;
  /** Prompt template key from built-in templates */
  promptTemplate?: string;
  /** Number of variants to generate (default: 1) */
  variantCount?: number;
  /** Temperature for generation (0-2, default: 0.9) */
  temperature?: number;
  /** Progress callback for tracking generation */
  onProgress?: ProgressCallback;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Apply AI pattern masking to results (default: true) */
  maskAIPatterns?: boolean;
}

// =============================================================================
// PROGRESS TRACKING
// =============================================================================

export interface RewriteProgress {
  /** Current phase of rewriting */
  phase: "preparing" | "generating" | "processing" | "done";
  /** Current variant being generated (1-based) */
  currentVariant: number;
  /** Total variants to generate */
  totalVariants: number;
  /** For large content: current chunk (1-based) */
  currentChunk?: number;
  /** For large content: total chunks */
  totalChunks?: number;
  /** Human-readable status message */
  message: string;
  /** Accumulated cost so far */
  costSoFar?: number;
}

export type ProgressCallback = (progress: RewriteProgress) => void;

// =============================================================================
// STREAMING SUPPORT
// =============================================================================

export interface StreamingResult {
  /** Partial or complete result */
  result: Partial<RewriteResult>;
  /** Whether this is the final result */
  isFinal: boolean;
  /** Variant index (0-based) */
  variantIndex: number;
}

export type StreamingCallback = (result: StreamingResult) => void;

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface RewriterConfig {
  /** Default provider configuration */
  defaultProvider?: Partial<ProviderConfig>;
  /** Default options for all rewrites */
  defaultOptions?: Partial<RewriteOptions>;
  /** Custom prompt templates */
  customPrompts?: Record<string, string>;
}

// =============================================================================
// ERRORS
// =============================================================================

export class RewriterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "RewriterError";
  }
}

export class ProviderError extends RewriterError {
  constructor(
    message: string,
    public readonly provider: ProviderType,
    details?: unknown
  ) {
    super(message, "PROVIDER_ERROR", details);
    this.name = "ProviderError";
  }
}

export class ValidationError extends RewriterError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class RateLimitError extends ProviderError {
  constructor(provider: ProviderType, public readonly retryAfter?: number) {
    super("Rate limit exceeded", provider, { retryAfter });
    this.name = "RateLimitError";
  }
}
