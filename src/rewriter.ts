/**
 * AI Content Rewriter
 * ===================
 * Main rewriter class following SDK conventions.
 *
 * @example
 * ```typescript
 * const rewriter = new ContentRewriter({
 *   provider: 'openai',
 *   apiKey: 'sk-...',
 *   model: 'gpt-4.1',
 * });
 *
 * // Single variant
 * const result = await rewriter.rewrite(html);
 *
 * // Multiple variants
 * const results = await rewriter.rewrite(html, { variants: 3 });
 * ```
 */

import type {
  ContentInput,
  RewriteResult,
  RewriterOptions,
  RewriteCallOptions,
  RewriteOptions,
  ProviderConfig,
  ProgressCallback,
  ContentFormat,
  RewriterConfig,
} from "./types.js";
import { ValidationError, ProviderError } from "./types.js";
import { DEFAULTS, PROMPTS, type PromptTemplateKey } from "./constants.js";
import {
  detectFormat,
  extractTitleFromHtml,
  extractTitleFromMarkdown,
  extractDescriptionFromHtml,
} from "./utils.js";
import {
  generateVariantsWithOpenAI,
  type OpenAIRewriteResult,
} from "./providers/openai.js";
import { maskAIPatterns, maskAIPatternsInHTML } from "./masker.js";

// =============================================================================
// CONTENT REWRITER CLASS
// =============================================================================

export class ContentRewriter {
  private readonly provider: ProviderConfig;
  private readonly defaultTemperature: number;
  private readonly customPrompts: Record<
    string,
    string | { name: string; prompt: string }
  >;

  /**
   * Create a new ContentRewriter instance.
   *
   * @param options - Configuration options including provider, API key, and model
   *
   * @example
   * ```typescript
   * const rewriter = new ContentRewriter({
   *   provider: 'openai',
   *   apiKey: process.env.OPENAI_API_KEY,
   *   model: 'gpt-4.1', // optional, defaults to gpt-4.1
   * });
   * ```
   */
  constructor(options: RewriterOptions) {
    if (!options.apiKey) {
      throw new ValidationError("API key is required");
    }
    if (!options.provider) {
      throw new ValidationError("Provider type is required");
    }

    this.provider = {
      type: options.provider,
      apiKey: options.apiKey,
      model: options.model || DEFAULTS.MODEL,
      baseUrl: options.baseUrl,
    };

    this.defaultTemperature = options.temperature ?? DEFAULTS.TEMPERATURE;
    this.customPrompts = options.customPrompts || {};
  }

  /**
   * Rewrite content and generate variants.
   *
   * @param input - Content to rewrite (string or ContentInput object)
   * @param options - Optional settings for this specific rewrite
   * @returns Array of rewrite results (one per variant)
   *
   * @example
   * ```typescript
   * // Simple usage
   * const [result] = await rewriter.rewrite('<h1>Title</h1><p>Content</p>');
   *
   * // With options
   * const results = await rewriter.rewrite(html, {
   *   variants: 3,
   *   promptTemplate: 'SEO_OPTIMIZED',
   *   temperature: 0.8,
   * });
   *
   * // With progress tracking
   * const results = await rewriter.rewrite(html, {
   *   variants: 5,
   *   onProgress: (p) => console.log(`${p.currentVariant}/${p.totalVariants}`),
   * });
   * ```
   */
  async rewrite(
    input: ContentInput | string,
    options: RewriteCallOptions = {}
  ): Promise<RewriteResult[]> {
    // Normalize input
    const normalizedInput: ContentInput =
      typeof input === "string" ? { content: input } : input;

    // Validate
    this.validateInput(normalizedInput);
    this.validateOptions(options);

    // Detect format
    const format = normalizedInput.format || detectFormat(normalizedInput.content);

    // Extract metadata if not provided
    const title =
      normalizedInput.title || this.extractTitle(normalizedInput.content, format);
    const description =
      normalizedInput.description ||
      this.extractDescription(normalizedInput.content, format);

    // Resolve prompt
    const prompt = this.resolvePrompt(options);

    // Get settings
    const variantCount = options.variants ?? DEFAULTS.VARIANT_COUNT;
    const temperature = options.temperature ?? this.defaultTemperature;

    // Execute rewrite
    const results = await this.executeRewrite({
      content: normalizedInput.content,
      title,
      description,
      format,
      prompt,
      variantCount,
      temperature,
      onProgress: options.onProgress,
      signal: options.signal,
    });

    // Apply AI pattern masking (default: true)
    const shouldMask = options.maskAIPatterns !== false;
    if (shouldMask) {
      return results.map((result) => ({
        ...result,
        title: maskAIPatterns(result.title),
        description: maskAIPatterns(result.description),
        content:
          format === "html"
            ? maskAIPatternsInHTML(result.content)
            : maskAIPatterns(result.content),
      }));
    }

    return results;
  }

  /**
   * Rewrite content and return a single result (first variant).
   * Convenience method for when you only need one variant.
   *
   * @param input - Content to rewrite
   * @param options - Optional settings (variants is ignored, always 1)
   * @returns Single rewrite result
   *
   * @example
   * ```typescript
   * const result = await rewriter.rewriteOne(html);
   * console.log(result.content);
   * ```
   */
  async rewriteOne(
    input: ContentInput | string,
    options: Omit<RewriteCallOptions, "variants"> = {}
  ): Promise<RewriteResult> {
    const results = await this.rewrite(input, { ...options, variants: 1 });
    if (results.length === 0) {
      throw new ProviderError("No results returned from provider", this.provider.type);
    }
    return results[0];
  }

  /**
   * Get all available prompt templates.
   */
  getPromptTemplates(): Record<string, { name: string; prompt: string }> {
    const templates: Record<string, { name: string; prompt: string }> = {};

    // Built-in prompts
    for (const [key, value] of Object.entries(PROMPTS)) {
      if (typeof value === "string") {
        templates[key] = { name: key, prompt: value };
      } else {
        templates[key] = value;
      }
    }

    // Custom prompts
    for (const [key, value] of Object.entries(this.customPrompts)) {
      if (typeof value === "string") {
        templates[key] = { name: key, prompt: value };
      } else {
        templates[key] = value;
      }
    }

    return templates;
  }

  /**
   * Get current provider configuration.
   */
  getProvider(): Readonly<ProviderConfig> {
    return { ...this.provider };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private validateInput(input: ContentInput): void {
    if (!input.content || typeof input.content !== "string") {
      throw new ValidationError("Content is required and must be a string");
    }
    if (input.content.trim().length === 0) {
      throw new ValidationError("Content cannot be empty");
    }
  }

  private validateOptions(options: RewriteCallOptions): void {
    if (options.variants !== undefined && (options.variants < 1 || options.variants > 30)) {
      throw new ValidationError("Variants must be between 1 and 30");
    }
    if (
      options.temperature !== undefined &&
      (options.temperature < 0 || options.temperature > 2)
    ) {
      throw new ValidationError("Temperature must be between 0 and 2");
    }
  }

  private extractTitle(content: string, format: ContentFormat): string {
    switch (format) {
      case "html":
        return extractTitleFromHtml(content);
      case "markdown":
        return extractTitleFromMarkdown(content);
      default:
        const firstLine = content.split("\n")[0]?.trim() || "";
        return firstLine.slice(0, 200);
    }
  }

  private extractDescription(content: string, format: ContentFormat): string {
    switch (format) {
      case "html":
        return extractDescriptionFromHtml(content);
      case "markdown":
      case "text":
        const lines = content.split("\n").slice(1);
        const text = lines.join(" ").trim().slice(0, 160);
        return text;
      default:
        return "";
    }
  }

  private resolvePrompt(options: RewriteCallOptions): string {
    // Custom prompt takes priority
    if (options.prompt) {
      return options.prompt;
    }

    // Use template
    const templateKey = options.promptTemplate || DEFAULTS.PROMPT_TEMPLATE;

    const builtInTemplate = PROMPTS[templateKey as PromptTemplateKey];
    const customTemplate = this.customPrompts[templateKey];
    const template = builtInTemplate || customTemplate;

    if (!template) {
      throw new ValidationError(`Unknown prompt template: ${templateKey}`);
    }

    if (typeof template === "string") {
      return template;
    }

    return template.prompt;
  }

  private async executeRewrite(params: {
    content: string;
    title: string;
    description: string;
    format: ContentFormat;
    prompt: string;
    variantCount: number;
    temperature: number;
    onProgress?: ProgressCallback;
    signal?: AbortSignal;
  }): Promise<RewriteResult[]> {
    const { format, onProgress, signal, ...rewriteParams } = params;

    switch (this.provider.type) {
      case "openai":
        return this.executeOpenAIRewrite(rewriteParams, format, onProgress, signal);

      case "anthropic":
        throw new ProviderError("Anthropic provider is not yet implemented", "anthropic");

      case "custom":
        throw new ProviderError("Custom provider requires implementation", "custom");

      default:
        throw new ValidationError(`Unknown provider type: ${this.provider.type}`);
    }
  }

  private async executeOpenAIRewrite(
    params: {
      content: string;
      title: string;
      description: string;
      prompt: string;
      variantCount: number;
      temperature: number;
    },
    format: ContentFormat,
    onProgress?: ProgressCallback,
    signal?: AbortSignal
  ): Promise<RewriteResult[]> {
    const results: RewriteResult[] = [];

    const openAIResults = await generateVariantsWithOpenAI(this.provider, {
      content: params.content,
      title: params.title,
      description: params.description,
      prompt: params.prompt,
      variantCount: params.variantCount,
      temperature: params.temperature,
      onProgress,
      signal,
      onVariantComplete: (result: OpenAIRewriteResult, index: number) => {
        results[index] = {
          content: result.html,
          title: result.title,
          description: result.description,
          cost: result.cost,
          format,
        };
      },
    });

    return openAIResults.map((result) => ({
      content: result.html,
      title: result.title,
      description: result.description,
      cost: result.cost,
      format,
    }));
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS (for quick usage without instantiation)
// =============================================================================

/**
 * Quick rewrite function for simple one-off usage.
 * Creates a temporary ContentRewriter instance.
 *
 * @example
 * ```typescript
 * const results = await rewrite(html, {
 *   provider: { type: 'openai', apiKey: 'sk-...' },
 *   variants: 3,
 * });
 * ```
 *
 * @deprecated Prefer using ContentRewriter class for better control and reusability.
 */
export async function rewrite(
  input: ContentInput | string,
  options: RewriteOptions
): Promise<RewriteResult[]> {
  const rewriter = new ContentRewriter({
    provider: options.provider.type,
    apiKey: options.provider.apiKey,
    model: options.provider.model,
    baseUrl: options.provider.baseUrl,
    temperature: options.temperature,
  });

  return rewriter.rewrite(typeof input === "string" ? { content: input } : input, {
    prompt: options.prompt,
    promptTemplate: options.promptTemplate,
    variants: options.variantCount,
    temperature: options.temperature,
    onProgress: options.onProgress,
    signal: options.signal,
    maskAIPatterns: options.maskAIPatterns,
  });
}

/**
 * Quick single rewrite (returns first variant).
 *
 * @deprecated Prefer using ContentRewriter.rewriteOne() for better control.
 */
export async function rewriteOne(
  input: ContentInput | string,
  options: RewriteOptions
): Promise<RewriteResult> {
  const results = await rewrite(input, { ...options, variantCount: 1 });
  if (results.length === 0) {
    throw new ProviderError("No results returned from provider", options.provider.type);
  }
  return results[0];
}

// =============================================================================
// LEGACY CLASS SUPPORT
// =============================================================================

/**
 * Legacy factory function for backward compatibility.
 * @deprecated Use `new ContentRewriter(options)` instead.
 */
export function createRewriter(config: RewriterConfig): ContentRewriter {
  if (!config.defaultProvider?.type || !config.defaultProvider?.apiKey) {
    throw new ValidationError(
      "Legacy createRewriter requires defaultProvider with type and apiKey"
    );
  }

  return new ContentRewriter({
    provider: config.defaultProvider.type,
    apiKey: config.defaultProvider.apiKey,
    model: config.defaultProvider.model,
    baseUrl: config.defaultProvider.baseUrl,
    temperature: config.defaultOptions?.temperature,
    customPrompts: config.customPrompts,
  });
}
