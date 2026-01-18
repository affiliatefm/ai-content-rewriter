/**
 * OpenAI Provider
 * ===============
 * Implementation for OpenAI API integration.
 * 
 * Architecture: Isolated responsibilities
 * - rewriteContentOnly(): HTML content rewriting
 * - generateTitle(): Title generation from content summary
 * - generateDescription(): Description generation from content summary
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
// ISOLATED FUNCTIONS: CONTENT ONLY
// =============================================================================

const CONTENT_REWRITE_PROMPT = `You are a professional copywriter. Rewrite the HTML content completely while preserving:
- The same language as the original
- HTML structure and tags
- Meaning and factual accuracy
- SEO value

Rules:
1. Change 90-95% of the text - completely reformulate sentences
2. Use synonyms and alternative expressions
3. Vary sentence length and structure
4. Keep brand names and important keywords
5. Return ONLY the rewritten HTML, no explanations`;

async function rewriteContentOnly(
  client: OpenAI,
  model: string,
  content: string,
  customPrompt: string,
  temperature: number,
  maxTokens: number,
  signal?: AbortSignal
): Promise<{ html: string; cost: number }> {
  const systemPrompt = customPrompt || CONTENT_REWRITE_PROMPT;
  
  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Rewrite this HTML content:\n\n${content}` },
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

  html = normalizeArticleContent(html);
  html = clampString(html, 0, LIMITS.HTML_MAX);

  return { html, cost };
}

// =============================================================================
// ISOLATED FUNCTIONS: TITLE GENERATION
// =============================================================================

const TITLE_PROMPT = `You are a professional copywriter and SEO specialist. Generate a compelling title based on the article summary.

Rules:
1. Write in the SAME LANGUAGE as the content
2. Make it engaging and click-worthy
3. Keep important keywords if mentioned
4. Optimal length: 50-70 characters
5. Return ONLY the title, nothing else`;

async function generateTitle(
  client: OpenAI,
  model: string,
  contentSummary: string,
  originalTitle: string,
  signal?: AbortSignal
): Promise<{ title: string; cost: number }> {
  const userMessage = originalTitle
    ? `Original title: "${originalTitle}"\n\nArticle summary:\n${contentSummary}\n\nGenerate a completely new, unique title:`
    : `Article summary:\n${contentSummary}\n\nGenerate a compelling title:`;

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: TITLE_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 1.0, // More creative for titles
      max_tokens: 100,
      top_p: DEFAULTS.TOP_P,
    },
    { signal }
  );

  const raw = response.choices[0]?.message?.content || "";
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

  // Clean up - remove quotes, extra whitespace
  let title = raw.trim().replace(/^["']|["']$/g, "").trim();
  title = clampString(title, LIMITS.TITLE_MIN, LIMITS.TITLE_MAX);

  return { title, cost };
}

// =============================================================================
// ISOLATED FUNCTIONS: DESCRIPTION GENERATION
// =============================================================================

const DESCRIPTION_PROMPT = `You are a professional copywriter and SEO specialist. Generate a meta description based on the article summary.

Rules:
1. Write in the SAME LANGUAGE as the content
2. Summarize the key value proposition
3. Include a subtle call-to-action if appropriate
4. Optimal length: 150-160 characters
5. Return ONLY the description, nothing else`;

async function generateDescription(
  client: OpenAI,
  model: string,
  contentSummary: string,
  originalDescription: string,
  signal?: AbortSignal
): Promise<{ description: string; cost: number }> {
  const userMessage = originalDescription
    ? `Original description: "${originalDescription}"\n\nArticle summary:\n${contentSummary}\n\nGenerate a completely new, unique description:`
    : `Article summary:\n${contentSummary}\n\nGenerate a meta description:`;

  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: DESCRIPTION_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8, // Slightly less creative, more factual
      max_tokens: 200,
      top_p: DEFAULTS.TOP_P,
    },
    { signal }
  );

  const raw = response.choices[0]?.message?.content || "";
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost = calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

  let description = raw.trim().replace(/^["']|["']$/g, "").trim();
  description = clampString(description, 0, LIMITS.DESCRIPTION_MAX);

  return { description, cost };
}

// =============================================================================
// HELPER: CREATE CONTENT SUMMARY
// =============================================================================

function createContentSummary(html: string, maxLength: number = 1000): string {
  // Strip HTML tags for summary
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take first N characters as summary
  if (text.length <= maxLength) {
    return text;
  }

  // Cut at word boundary
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return cut.slice(0, lastSpace > 0 ? lastSpace : maxLength) + "...";
}

// =============================================================================
// MAIN REWRITE FUNCTION (ORCHESTRATES ALL THREE)
// =============================================================================

export async function rewriteWithOpenAI(
  config: ProviderConfig,
  options: OpenAIRewriteOptions
): Promise<OpenAIRewriteResult> {
  const client = getClient(config);
  const model = config.model || DEFAULTS.MODEL;
  const temperature = options.temperature ?? DEFAULTS.TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULTS.MAX_TOKENS;

  // Create summary for title/description generation
  const contentSummary = createContentSummary(options.content);

  try {
    // Run all three in PARALLEL
    const [contentResult, titleResult, descResult] = await Promise.all([
      // 1. Rewrite HTML content
      rewriteContentOnly(
        client,
        model,
        options.content,
        options.prompt,
        temperature,
        maxTokens,
        options.signal
      ),
      // 2. Generate new title
      options.title
        ? generateTitle(client, model, contentSummary, options.title, options.signal)
        : Promise.resolve({ title: "", cost: 0 }),
      // 3. Generate new description
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
        const retryAfter = parseInt(
          error.headers?.["retry-after"] || "0",
          10
        );
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

  // Use regular rewrite for small content
  if (content.length <= LIMITS.LARGE_ARTICLE_THRESHOLD) {
    return rewriteWithOpenAI(config, options);
  }

  const client = getClient(config);
  const model = config.model || DEFAULTS.MODEL;

  // Create summary for title/description BEFORE chunking
  const contentSummary = createContentSummary(content, 1500);

  // Start title/description generation in parallel with content chunking
  const metaPromise = Promise.all([
    options.title
      ? generateTitle(client, model, contentSummary, options.title, options.signal)
      : Promise.resolve({ title: "", cost: 0 }),
    options.description
      ? generateDescription(client, model, contentSummary, options.description, options.signal)
      : Promise.resolve({ description: "", cost: 0 }),
  ]);

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
    message: `Starting variant ${variantIndex + 1}...`,
  });

  // Chunk prompt - simpler, focused only on content
  const chunkPrompt = `You are a professional copywriter. Rewrite this HTML content section completely.
Keep the same language. Preserve HTML structure. Change 90%+ of the text while keeping meaning.
Return ONLY the rewritten HTML.`;

  // Process chunks
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
          chunkPrompt,
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

  // Process content chunks
  const chunkResults = await processInBatches(
    chunks,
    chunkProcessor,
    PROCESSING.MAX_CONCURRENT_CHUNKS,
    PROCESSING.CHUNK_BATCH_DELAY_MS
  );

  // Wait for meta generation to complete
  const [titleResult, descResult] = await metaPromise;

  // Aggregate results
  const rewrittenChunks: string[] = [];
  for (const result of chunkResults) {
    if (result?.html) {
      rewrittenChunks.push(result.html);
      totalCost += result.cost || 0;
    }
  }

  totalCost += titleResult.cost + descResult.cost;

  // Join and normalize
  const finalHtml = normalizeArticleContent(rewrittenChunks.join("\n"));

  // Use generated title/description, fallback to extraction
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

  // Process all variants in parallel
  const variantPromises = Array.from({ length: variantCount }, async (_, i) => {
    // Check if we should abort due to fatal error
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
    // If we have a fatal error, throw it
    if (fatalError) {
      throw fatalError;
    }
    throw error;
  }
}
