/**
 * AI Content Rewriter
 * ===================
 * Main rewriter class that orchestrates the rewriting process.
 */

import type {
  ContentInput,
  RewriteResult,
  RewriteOptions,
  RewriterConfig,
  ProviderConfig,
  ProgressCallback,
  ContentFormat,
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

// =============================================================================
// REWRITER CLASS
// =============================================================================

export class ContentRewriter {
  private config: RewriterConfig;

  constructor(config: RewriterConfig = {}) {
    this.config = config;
  }

  /**
   * Rewrite content and generate variants.
   */
  async rewrite(
    input: ContentInput,
    options: RewriteOptions
  ): Promise<RewriteResult[]> {
    // Validate input
    this.validateInput(input);
    this.validateOptions(options);

    // Detect format
    const format = input.format || detectFormat(input.content);

    // Extract metadata if not provided
    const title = input.title || this.extractTitle(input.content, format);
    const description =
      input.description || this.extractDescription(input.content, format);

    // Get prompt
    const prompt = this.resolvePrompt(options);

    // Merge with defaults
    const mergedProvider = this.mergeProviderConfig(options.provider);
    const variantCount = options.variantCount ?? DEFAULTS.VARIANT_COUNT;
    const temperature = options.temperature ?? DEFAULTS.TEMPERATURE;

    // Execute based on provider
    const results = await this.executeRewrite({
      content: input.content,
      title,
      description,
      format,
      prompt,
      provider: mergedProvider,
      variantCount,
      temperature,
      onProgress: options.onProgress,
      signal: options.signal,
    });

    return results;
  }

  /**
   * Get available prompt templates.
   */
  getPromptTemplates(): Record<string, { name: string; prompt: string }> {
    return {
      ...PROMPTS,
      ...this.config.customPrompts,
    };
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

  private validateOptions(options: RewriteOptions): void {
    if (!options.provider) {
      throw new ValidationError("Provider configuration is required");
    }
    if (!options.provider.apiKey) {
      throw new ValidationError("API key is required");
    }
    if (
      options.variantCount !== undefined &&
      (options.variantCount < 1 || options.variantCount > 30)
    ) {
      throw new ValidationError("Variant count must be between 1 and 30");
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
        // For plain text, use first line
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
        // Use first 160 chars after first newline
        const lines = content.split("\n").slice(1);
        const text = lines.join(" ").trim().slice(0, 160);
        return text;
      default:
        return "";
    }
  }

  private resolvePrompt(options: RewriteOptions): string {
    // Custom prompt takes priority
    if (options.prompt) {
      return options.prompt;
    }

    // Use template
    const templateKey =
      options.promptTemplate ||
      this.config.defaultOptions?.promptTemplate ||
      DEFAULTS.PROMPT_TEMPLATE;

    const template =
      PROMPTS[templateKey as PromptTemplateKey] ||
      this.config.customPrompts?.[templateKey];

    if (!template) {
      throw new ValidationError(`Unknown prompt template: ${templateKey}`);
    }

    if (typeof template === "string") {
      return template;
    }

    return template.prompt;
  }

  private mergeProviderConfig(provider: ProviderConfig): ProviderConfig {
    return {
      ...this.config.defaultProvider,
      ...provider,
      model: provider.model || this.config.defaultProvider?.model || DEFAULTS.MODEL,
    };
  }

  private async executeRewrite(params: {
    content: string;
    title: string;
    description: string;
    format: ContentFormat;
    prompt: string;
    provider: ProviderConfig;
    variantCount: number;
    temperature: number;
    onProgress?: ProgressCallback;
    signal?: AbortSignal;
  }): Promise<RewriteResult[]> {
    const { provider, format, onProgress, signal, ...rewriteParams } = params;

    switch (provider.type) {
      case "openai":
        return this.executeOpenAIRewrite(
          provider,
          rewriteParams,
          format,
          onProgress,
          signal
        );

      case "anthropic":
        throw new ProviderError(
          "Anthropic provider is not yet implemented",
          "anthropic"
        );

      case "custom":
        throw new ProviderError(
          "Custom provider requires implementation",
          "custom"
        );

      default:
        throw new ValidationError(`Unknown provider type: ${provider.type}`);
    }
  }

  private async executeOpenAIRewrite(
    provider: ProviderConfig,
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

    const openAIResults = await generateVariantsWithOpenAI(provider, {
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

    // Ensure all results are mapped
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
// CONVENIENCE FUNCTION
// =============================================================================

/**
 * Quick rewrite function for simple use cases.
 */
export async function rewrite(
  input: ContentInput | string,
  options: RewriteOptions
): Promise<RewriteResult[]> {
  const rewriter = new ContentRewriter();
  const normalizedInput: ContentInput =
    typeof input === "string" ? { content: input } : input;
  return rewriter.rewrite(normalizedInput, options);
}

/**
 * Quick single rewrite (returns first variant).
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
