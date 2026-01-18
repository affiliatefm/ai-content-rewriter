/**
 * OpenAI Provider
 * ===============
 * Implementation for OpenAI API integration.
 */

import OpenAI from "openai";
import type {
  ProviderConfig,
  RewriteProgress,
  ProgressCallback,
} from "../types.js";
import { ProviderError, RateLimitError } from "../types.js";
import {
  DEFAULTS,
  LIMITS,
  PROCESSING,
  getModelPricing,
} from "../constants.js";
import {
  normalizeArticleContent,
  clampString,
  splitIntoChunks,
  processInBatches,
  sleep,
} from "../utils.js";

// =============================================================================
// TYPES
// =============================================================================

export interface OpenAIRewriteOptions {
  content: string;
  title?: string;
  description?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface OpenAIRewriteResult {
  title: string;
  description: string;
  html: string;
  cost: number;
}

// =============================================================================
// CLIENT MANAGEMENT
// =============================================================================

let clientCache: WeakMap<ProviderConfig, OpenAI> = new WeakMap();

function getClient(config: ProviderConfig): OpenAI {
  let client = clientCache.get(config);
  if (!client) {
    const apiKey = config.apiKey?.trim();
    if (!apiKey) {
      throw new ProviderError("OpenAI API key is required", "openai");
    }

    // Validate key format
    if (/[^\x00-\x7F]/.test(apiKey)) {
      throw new ProviderError(
        "OpenAI API key contains invalid characters",
        "openai"
      );
    }

    client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true, // Allow browser usage
    });
    clientCache.set(config, client);
  }
  return client;
}

// =============================================================================
// COST CALCULATION
// =============================================================================

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

/**
 * Estimate cost before running rewrite.
 * Assumes output ~1.2x input length.
 */
export function estimateCost(
  model: string,
  contentLength: number,
  variants: number = 1
): number {
  // ~3.5 chars per token
  const inputTokens = Math.ceil(contentLength / 3.5);
  // Assume output ~1.2x input
  const outputTokens = Math.ceil(inputTokens * 1.2);
  return calculateCost(model, inputTokens, outputTokens) * variants;
}

// =============================================================================
// SINGLE REWRITE
// =============================================================================

export async function rewriteWithOpenAI(
  config: ProviderConfig,
  options: OpenAIRewriteOptions
): Promise<OpenAIRewriteResult> {
  const client = getClient(config);
  const model = config.model || DEFAULTS.MODEL;
  const temperature = options.temperature ?? DEFAULTS.TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULTS.MAX_TOKENS;

  // Build user message - just the content to rewrite
  const userMessage = `Current content:
${options.content}

Instructions: Rewrite the above content completely while preserving the meaning and HTML structure. Generate an improved version:`;

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: options.prompt },
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
        top_p: DEFAULTS.TOP_P,
        frequency_penalty: DEFAULTS.FREQUENCY_PENALTY,
        presence_penalty: DEFAULTS.PRESENCE_PENALTY,
      },
      { signal: options.signal }
    );

    const raw = response.choices[0]?.message?.content || "";
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
    const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

    // Clean up the response - remove markdown code blocks if present
    let html = raw
      .replace(/^```html?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    // Normalize HTML content
    html = normalizeArticleContent(html);
    html = clampString(html, 0, LIMITS.HTML_MAX);

    // Extract title from H1 in the rewritten HTML
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = "";
    if (titleMatch) {
      const div = { innerHTML: "" };
      // Simple HTML tag stripping
      title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }
    if (!title) {
      title = options.title || "";
    }
    title = clampString(title, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX);

    // Generate description from first paragraph text
    let description = "";
    const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      description = pMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, LIMITS.DESCRIPTION_MAX);
    }
    if (!description) {
      description = options.description || "";
    }
    description = clampString(description, 0, LIMITS.DESCRIPTION_MAX);

    return { title, description, html, cost };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      // Rate limit - can retry
      if (error.status === 429) {
        const retryAfter = parseInt(
          error.headers?.["retry-after"] || "0",
          10
        );
        throw new RateLimitError("openai", retryAfter || undefined);
      }
      
      // Extract error message from response body if available
      let errorMessage = error.message || `OpenAI API error: ${error.status}`;
      const errorBody = error.error as { error?: { message?: string; code?: string } } | undefined;
      if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      }
      
      throw new ProviderError(
        errorMessage,
        "openai",
        { status: error.status, code: errorBody?.error?.code || error.code }
      );
    }
    throw error;
  }
}

// =============================================================================
// LARGE CONTENT REWRITE (CHUNKED)
// =============================================================================

export async function rewriteLargeContentWithOpenAI(
  config: ProviderConfig,
  options: OpenAIRewriteOptions & {
    onProgress?: ProgressCallback;
    variantIndex?: number;
    totalVariants?: number;
  }
): Promise<OpenAIRewriteResult> {
  const content = options.content;
  const variantIndex = options.variantIndex ?? 0;
  const totalVariants = options.totalVariants ?? 1;

  // Check if chunking is needed
  if (content.length <= LIMITS.LARGE_ARTICLE_THRESHOLD) {
    return rewriteWithOpenAI(config, options);
  }

  // Split into chunks
  const chunks = splitIntoChunks(content, LIMITS.CHUNK_SIZE);
  let totalCost = 0;
  const completedChunks = new Set<number>();

  // Report initial progress
  options.onProgress?.({
    phase: "generating",
    currentVariant: variantIndex + 1,
    totalVariants,
    currentChunk: 0,
    totalChunks: chunks.length,
    message: `Processing ${chunks.length} chunks...`,
  });

  // Process chunks in batches
  const chunkProcessor = async (
    chunk: { content: string; index: number },
    _batchIndex: number
  ): Promise<{ html: string; cost: number }> => {
    const chunkPrompt = options.prompt;
    const chunkOptions: OpenAIRewriteOptions = {
      ...options,
      content: chunk.content,
      title: `Part ${chunk.index + 1} of ${chunks.length}`,
      description: "",
      prompt: chunkPrompt,
    };

    let retries = 0;
    while (retries < PROCESSING.MAX_RETRIES) {
      try {
        const result = await rewriteWithOpenAI(config, chunkOptions);
        completedChunks.add(chunk.index);

        // Report progress
        options.onProgress?.({
          phase: "generating",
          currentVariant: variantIndex + 1,
          totalVariants,
          currentChunk: completedChunks.size,
          totalChunks: chunks.length,
          message: `Chunk ${completedChunks.size}/${chunks.length}`,
          costSoFar: totalCost + result.cost,
        });

        return { html: result.html, cost: result.cost };
      } catch (error) {
        retries++;
        if (error instanceof RateLimitError) {
          const waitTime = Math.min(
            PROCESSING.RETRY_BASE_DELAY_MS * Math.pow(2, retries),
            30000
          ) + Math.random() * 1000;
          await sleep(waitTime);
        } else if (retries >= PROCESSING.MAX_RETRIES) {
          throw error;
        } else {
          const waitTime = Math.min(
            PROCESSING.RETRY_BASE_DELAY_MS * Math.pow(2, retries),
            10000
          );
          await sleep(waitTime);
        }
      }
    }

    throw new ProviderError(
      `Failed to process chunk ${chunk.index + 1} after ${PROCESSING.MAX_RETRIES} retries`,
      "openai"
    );
  };

  const results = await processInBatches(
    chunks,
    chunkProcessor,
    PROCESSING.MAX_CONCURRENT_CHUNKS,
    PROCESSING.CHUNK_BATCH_DELAY_MS
  );

  // Aggregate results
  const rewrittenChunks: string[] = [];
  for (const result of results) {
    if (result?.html) {
      rewrittenChunks.push(result.html);
      totalCost += result.cost || 0;
    }
  }

  // Join and normalize
  const finalHtml = normalizeArticleContent(rewrittenChunks.join("\n"));

  // Extract title and description from first chunk or generate
  let title = options.title || "";
  let description = options.description || "";

  // Try to extract from result if not provided
  if (!title && rewrittenChunks[0]) {
    const match = rewrittenChunks[0].match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (match) {
      const tempDiv =
        typeof document !== "undefined"
          ? document.createElement("div")
          : null;
      if (tempDiv) {
        tempDiv.innerHTML = match[1];
        title = tempDiv.textContent?.trim() || "";
      } else {
        title = match[1].replace(/<[^>]*>/g, "").trim();
      }
    }
  }

  return {
    title: clampString(title, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX),
    description: clampString(description, 0, LIMITS.DESCRIPTION_MAX),
    html: clampString(finalHtml, 0, LIMITS.HTML_MAX),
    cost: totalCost,
  };
}

// =============================================================================
// MULTIPLE VARIANTS
// =============================================================================

/**
 * Check if error is fatal (should not be retried)
 */
function isFatalError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    const details = error.details as { code?: string; status?: number } | undefined;
    // Fatal error codes that should not be retried
    const fatalCodes = [
      "model_not_found",
      "invalid_api_key",
      "insufficient_quota",
      "invalid_request_error",
    ];
    if (details?.code && fatalCodes.includes(details.code)) {
      return true;
    }
    // Fatal HTTP statuses
    if (details?.status && [400, 401, 403, 404].includes(details.status)) {
      return true;
    }
  }
  return false;
}

export async function generateVariantsWithOpenAI(
  config: ProviderConfig,
  options: OpenAIRewriteOptions & {
    variantCount: number;
    onProgress?: ProgressCallback;
    onVariantComplete?: (result: OpenAIRewriteResult, index: number) => void;
  }
): Promise<OpenAIRewriteResult[]> {
  const { variantCount, onProgress, onVariantComplete, ...rewriteOptions } = options;
  const results: OpenAIRewriteResult[] = [];
  const errors: Error[] = [];
  const isLarge = options.content.length > LIMITS.LARGE_ARTICLE_THRESHOLD;

  // Report starting
  onProgress?.({
    phase: "preparing",
    currentVariant: 0,
    totalVariants: variantCount,
    message: `Preparing ${variantCount} variant${variantCount > 1 ? "s" : ""}...`,
  });

  if (isLarge) {
    // Process large content variants in PARALLEL for better performance
    let fatalError: Error | null = null;
    const variantStates: Map<number, { completed: number; total: number }> = new Map();
    
    const promises = Array.from({ length: variantCount }, async (_, i) => {
      if (options.signal?.aborted || fatalError) return;
      
      variantStates.set(i, { completed: 0, total: 0 });

      try {
        const result = await rewriteLargeContentWithOpenAI(config, {
          ...rewriteOptions,
          onProgress: (progress) => {
            if (progress.totalChunks) {
              variantStates.set(i, { 
                completed: progress.currentChunk || 0, 
                total: progress.totalChunks 
              });
            }
            
            // Calculate total progress across all variants
            let totalCompleted = 0;
            let totalChunks = 0;
            for (const state of variantStates.values()) {
              totalCompleted += state.completed;
              totalChunks += state.total || 1;
            }
            
            onProgress?.({
              phase: "generating",
              currentVariant: results.filter(r => r).length,
              totalVariants: variantCount,
              currentChunk: totalCompleted,
              totalChunks: totalChunks,
              message: `Variant ${i + 1}: ${progress.message}`,
              costSoFar: progress.costSoFar,
            });
          },
          variantIndex: i,
          totalVariants: variantCount,
        });

        results[i] = result;
        onVariantComplete?.(result, i);
        
        // Report completion
        const completed = results.filter(r => r).length;
        onProgress?.({
          phase: "generating",
          currentVariant: completed,
          totalVariants: variantCount,
          message: `Completed ${completed}/${variantCount} variants`,
        });
      } catch (error) {
        // Fatal errors should stop immediately
        if (isFatalError(error)) {
          fatalError = error instanceof Error ? error : new Error(String(error));
          return;
        }
        errors.push(error instanceof Error ? error : new Error(String(error)));
        console.error(`Variant ${i + 1} failed:`, error);
      }
    });

    await Promise.all(promises);
    
    if (fatalError) {
      throw fatalError;
    }
  } else {
    // Process small content in parallel
    let fatalError: Error | null = null;
    
    const promises = Array.from({ length: variantCount }, async (_, i) => {
      if (options.signal?.aborted || fatalError) return;

      let retries = 0;
      while (retries < PROCESSING.MAX_RETRIES) {
        if (fatalError) return; // Stop if another promise hit a fatal error
        
        try {
          const result = await rewriteWithOpenAI(config, rewriteOptions);
          results[i] = result;
          onVariantComplete?.(result, i);

          // Report progress
          const completed = results.filter((r) => r).length;
          onProgress?.({
            phase: "generating",
            currentVariant: completed,
            totalVariants: variantCount,
            message: `Generated ${completed}/${variantCount} variants`,
          });

          return;
        } catch (error) {
          // Fatal errors should stop all processing
          if (isFatalError(error)) {
            fatalError = error instanceof Error ? error : new Error(String(error));
            return;
          }
          
          retries++;
          if (error instanceof RateLimitError) {
            const waitTime =
              Math.min(
                PROCESSING.RETRY_BASE_DELAY_MS * Math.pow(2, retries),
                20000
              ) + Math.random() * 1000;
            await sleep(waitTime);
          } else if (retries >= PROCESSING.MAX_RETRIES) {
            errors.push(error instanceof Error ? error : new Error(String(error)));
            console.error(`Variant ${i + 1} failed:`, error);
            return;
          } else {
            const waitTime = Math.min(
              PROCESSING.RETRY_BASE_DELAY_MS * Math.pow(2, retries),
              5000
            );
            await sleep(waitTime);
          }
        }
      }
    });

    await Promise.all(promises);
    
    // If there was a fatal error, throw it
    if (fatalError) {
      throw fatalError;
    }
  }

  // If no results and we have errors, throw the first error
  const successfulResults = results.filter((r) => r);
  if (successfulResults.length === 0 && errors.length > 0) {
    throw errors[0];
  }

  // Report done
  onProgress?.({
    phase: "done",
    currentVariant: variantCount,
    totalVariants: variantCount,
    message: `Completed ${successfulResults.length} variants`,
  });

  return successfulResults;
}
