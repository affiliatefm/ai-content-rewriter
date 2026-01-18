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
  DEFAULT_REWRITE_PROMPT,
} from "../constants.js";
import {
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

    if (/[^\x00-\x7F]/.test(apiKey)) {
      throw new ProviderError(
        "OpenAI API key contains invalid characters",
        "openai"
      );
    }

    client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      dangerouslyAllowBrowser: true,
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

export function estimateCost(
  model: string,
  contentLength: number,
  variants: number = 1
): number {
  const inputTokens = Math.ceil(contentLength / 3.5);
  const outputTokens = Math.ceil(inputTokens * 1.2);
  return calculateCost(model, inputTokens, outputTokens) * variants;
}

// =============================================================================
// CONTENT REWRITE
// =============================================================================

async function rewriteContentOnly(
  client: OpenAI,
  model: string,
  content: string,
  customPrompt: string,
  temperature: number,
  maxTokens: number,
  signal?: AbortSignal
): Promise<{ html: string; cost: number }> {
  // Use custom prompt or default
  const instructions = customPrompt || DEFAULT_REWRITE_PROMPT;
  
  // Structure:
  // - Simple system prompt
  // - Instructions in user message
  const systemPrompt = "You are a professional content writer. Generate high-quality HTML content based on the provided context and instructions.";
  
  const userMessage = `Current content:
${content}

Instructions: ${instructions}

Generate an improved version:`;

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      top_p: DEFAULTS.TOP_P,
      frequency_penalty: DEFAULTS.FREQUENCY_PENALTY,
      presence_penalty: DEFAULTS.PRESENCE_PENALTY,
    },
    { signal }
  );

  const raw = response.choices[0]?.message?.content || "";
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

  let html = raw
    .replace(/^```html?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  html = clampString(html, 0, LIMITS.HTML_MAX);

  return { html, cost };
}

// =============================================================================
// TITLE GENERATION
// =============================================================================

async function generateTitle(
  client: OpenAI,
  model: string,
  contentSummary: string,
  originalTitle: string,
  signal?: AbortSignal
): Promise<{ title: string; cost: number }> {
  const systemPrompt = `You are a professional content writer. Generate a compelling page title.
IMPORTANT: Return ONLY the title text itself, without any prefixes like "Sample Title:" or explanations.
The title should be clear, engaging, and SEO-friendly.`;

  const userMessage = `Current title: ${originalTitle}

Context (article summary):
${contentSummary}

Instructions: Create a COMPLETELY rewritten, unique title. Keep the same language. Make it engaging and SEO-friendly.

Generate an improved title (return ONLY the title text):`;

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 1.0,
      max_tokens: 100,
      top_p: DEFAULTS.TOP_P,
    },
    { signal }
  );

  const raw = response.choices[0]?.message?.content || "";
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

  let title = raw.trim()
    .replace(/^(Sample Title|Title|Example):\s*/i, "")
    .replace(/^["'](.+)["']$/, "$1")
    .split("\n")[0]
    .trim();
    
  title = clampString(title, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX);

  return { title, cost };
}

// =============================================================================
// DESCRIPTION GENERATION
// =============================================================================

async function generateDescription(
  client: OpenAI,
  model: string,
  contentSummary: string,
  originalDescription: string,
  signal?: AbortSignal
): Promise<{ description: string; cost: number }> {
  const systemPrompt = `You are a professional content writer. Generate a compelling meta description.
IMPORTANT: Return ONLY plain text description, without any HTML tags, formatting, or prefixes.
The description should be concise, informative, and encourage clicks from search results.`;

  const userMessage = `Current description: ${originalDescription}

Context (article summary):
${contentSummary}

Instructions: Create a COMPLETELY rewritten, unique meta description. Keep the same language. 150-160 characters ideal.

Generate an improved description (return ONLY plain text, no HTML):`;

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 200,
      top_p: DEFAULTS.TOP_P,
    },
    { signal }
  );

  const raw = response.choices[0]?.message?.content || "";
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

  let description = raw.trim()
    .replace(/<[^>]*>/g, "")
    .replace(/^(Sample Description|Description|Example):\s*/i, "")
    .replace(/^["'](.+)["']$/, "$1")
    .replace(/\n+/g, " ")
    .trim();
    
  description = clampString(description, 0, LIMITS.DESCRIPTION_MAX);

  return { description, cost };
}

// =============================================================================
// HELPER: CREATE CONTENT SUMMARY
// =============================================================================

function createContentSummary(html: string, maxLength: number = 2000): string {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > 0 ? lastSpace : maxLength) + "...";
}

// =============================================================================
// MAIN REWRITE FUNCTION
// =============================================================================

export async function rewriteWithOpenAI(
  config: ProviderConfig,
  options: OpenAIRewriteOptions
): Promise<OpenAIRewriteResult> {
  const client = getClient(config);
  const model = config.model || DEFAULTS.MODEL;
  const temperature = options.temperature ?? DEFAULTS.TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULTS.MAX_TOKENS;

  const contentSummary = createContentSummary(options.content);

  try {
    // Run all three in PARALLEL
    const [contentResult, titleResult, descResult] = await Promise.all([
      rewriteContentOnly(
        client,
        model,
        options.content,
        options.prompt,
        temperature,
        maxTokens,
        options.signal
      ),
      options.title
        ? generateTitle(client, model, contentSummary, options.title, options.signal)
        : Promise.resolve({ title: "", cost: 0 }),
      options.description
        ? generateDescription(client, model, contentSummary, options.description, options.signal)
        : Promise.resolve({ description: "", cost: 0 }),
    ]);

    const totalCost = contentResult.cost + titleResult.cost + descResult.cost;

    // Fallback: extract from HTML if generation didn't happen
    let finalTitle = titleResult.title;
    let finalDescription = descResult.description;

    if (!finalTitle) {
      const h1Match = contentResult.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        finalTitle = h1Match[1].replace(/<[^>]+>/g, "").trim();
      }
    }

    if (!finalDescription) {
      const pMatch = contentResult.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (pMatch) {
        finalDescription = pMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, LIMITS.DESCRIPTION_MAX);
      }
    }

    return {
      title: clampString(finalTitle, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX),
      description: clampString(finalDescription, 0, LIMITS.DESCRIPTION_MAX),
      html: contentResult.html,
      cost: totalCost,
    };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        const retryAfter = parseInt(error.headers?.["retry-after"] || "0", 10);
        throw new RateLimitError("openai", retryAfter || undefined);
      }

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

  if (content.length <= LIMITS.LARGE_ARTICLE_THRESHOLD) {
    return rewriteWithOpenAI(config, options);
  }

  const client = getClient(config);
  const model = config.model || DEFAULTS.MODEL;

  const contentSummary = createContentSummary(content, 1500);

  // Start title/description in parallel with chunking
  const metaPromise = Promise.all([
    options.title
      ? generateTitle(client, model, contentSummary, options.title, options.signal)
      : Promise.resolve({ title: "", cost: 0 }),
    options.description
      ? generateDescription(client, model, contentSummary, options.description, options.signal)
      : Promise.resolve({ description: "", cost: 0 }),
  ]);

  const chunks = splitIntoChunks(content, LIMITS.CHUNK_SIZE);
  let totalCost = 0;
  const completedChunks = new Set<number>();

  options.onProgress?.({
    phase: "generating",
    currentVariant: variantIndex + 1,
    totalVariants,
    currentChunk: 0,
    totalChunks: chunks.length,
    message: `Starting variant ${variantIndex + 1}...`,
  });

  const chunkProcessor = async (
    chunk: { content: string; index: number; isFirst: boolean; isLast: boolean }
  ): Promise<{ html: string; cost: number }> => {
    let retries = 0;
    while (retries < PROCESSING.MAX_RETRIES) {
      try {
        const result = await rewriteContentOnly(
          client,
          model,
          chunk.content,
          options.prompt,
          options.temperature ?? DEFAULTS.TEMPERATURE,
          DEFAULTS.MAX_TOKENS,
          options.signal
        );

        completedChunks.add(chunk.index);
        options.onProgress?.({
          phase: "generating",
          currentVariant: variantIndex + 1,
          totalVariants,
          currentChunk: completedChunks.size,
          totalChunks: chunks.length,
          message: `Chunk ${completedChunks.size}/${chunks.length}`,
          costSoFar: totalCost + result.cost,
        });

        return result;
      } catch (error) {
        retries++;
        if (isFatalError(error) || retries >= PROCESSING.MAX_RETRIES) {
          throw error;
        }
        const waitTime = Math.min(
          PROCESSING.RETRY_BASE_DELAY_MS * Math.pow(2, retries),
          10000
        );
        await sleep(waitTime);
      }
    }

    throw new ProviderError(
      `Failed to process chunk ${chunk.index + 1} after ${PROCESSING.MAX_RETRIES} retries`,
      "openai"
    );
  };

  const chunkResults = await processInBatches(
    chunks,
    chunkProcessor,
    PROCESSING.MAX_CONCURRENT_CHUNKS,
    PROCESSING.CHUNK_BATCH_DELAY_MS
  );

  const [titleResult, descResult] = await metaPromise;

  const rewrittenChunks: string[] = [];
  for (const result of chunkResults) {
    if (result?.html) {
      rewrittenChunks.push(result.html);
      totalCost += result.cost || 0;
    }
  }

  totalCost += titleResult.cost + descResult.cost;

  const finalHtml = rewrittenChunks.join("\n");

  let finalTitle = titleResult.title;
  let finalDescription = descResult.description;

  if (!finalTitle && rewrittenChunks[0]) {
    const match = rewrittenChunks[0].match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (match) {
      finalTitle = match[1].replace(/<[^>]*>/g, "").trim();
    }
  }

  if (!finalDescription && rewrittenChunks[0]) {
    const pMatch = rewrittenChunks[0].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      finalDescription = pMatch[1].replace(/<[^>]+>/g, "").trim();
    }
  }

  return {
    title: clampString(finalTitle, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX),
    description: clampString(finalDescription, 0, LIMITS.DESCRIPTION_MAX),
    html: clampString(finalHtml, 0, LIMITS.HTML_MAX),
    cost: totalCost,
  };
}

// =============================================================================
// MULTIPLE VARIANTS
// =============================================================================

function isFatalError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    const details = error.details as { code?: string; status?: number } | undefined;
    const fatalCodes = [
      "model_not_found",
      "invalid_api_key",
      "insufficient_quota",
      "invalid_request_error",
    ];
    if (details?.code && fatalCodes.includes(details.code)) {
      return true;
    }
    if (details?.status && details.status >= 400 && details.status < 500 && details.status !== 429) {
      return true;
    }
  }
  if (error instanceof OpenAI.APIError) {
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return true;
    }
    const errorBody = error.error as { error?: { code?: string } } | undefined;
    const code = errorBody?.error?.code;
    if (code === "model_not_found" || code === "invalid_api_key") {
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

  onProgress?.({
    phase: "preparing",
    currentVariant: 0,
    totalVariants: variantCount,
    message: "Preparing rewrite...",
  });

  const isLargeContent = options.content.length > LIMITS.LARGE_ARTICLE_THRESHOLD;
  let fatalError: Error | null = null;

  const variantPromises = Array.from({ length: variantCount }, async (_, i) => {
    if (fatalError) {
      throw fatalError;
    }

    try {
      const result = isLargeContent
        ? await rewriteLargeContentWithOpenAI(config, {
            ...rewriteOptions,
            variantIndex: i,
            totalVariants: variantCount,
            onProgress,
          })
        : await rewriteWithOpenAI(config, rewriteOptions);

      onVariantComplete?.(result, i);

      onProgress?.({
        phase: "generating",
        currentVariant: i + 1,
        totalVariants: variantCount,
        message: `Completed variant ${i + 1}/${variantCount}`,
        costSoFar: result.cost,
      });

      return result;
    } catch (error) {
      if (isFatalError(error)) {
        fatalError = error as Error;
      }
      throw error;
    }
  });

  try {
    const results = await Promise.all(variantPromises);

    onProgress?.({
      phase: "done",
      currentVariant: variantCount,
      totalVariants: variantCount,
      message: "Rewrite complete",
      costSoFar: results.reduce((sum, r) => sum + r.cost, 0),
    });

    return results;
  } catch (error) {
    if (fatalError) {
      throw fatalError;
    }
    throw error;
  }
}
