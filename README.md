# AI Content Rewriter

AI-powered content rewriting library. Supports multiple providers, format auto-detection, and configurable prompts.

Built by [Affiliate.FM](https://affiliate.fm) — independent media and open-source tools for ethical affiliate marketing.

## Installation

```bash
npm install @affiliate.fm/ai-content-rewriter
```

## Quick Start

```typescript
import { rewrite } from "@affiliate.fm/ai-content-rewriter";

const results = await rewrite(
  {
    content: "<h1>Original Title</h1><p>Original content here...</p>",
    title: "Original Title", // Optional, auto-detected from content
    description: "Meta description", // Optional
  },
  {
    provider: {
      type: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4.1", // Optional, defaults to gpt-4.1
    },
    variantCount: 3, // Generate 3 variants
  }
);

console.log(results[0].content); // Rewritten HTML
console.log(results[0].title); // Rewritten title
console.log(results[0].cost); // Cost in USD
```

## Class-Based Usage

```typescript
import { ContentRewriter } from "@affiliate.fm/ai-content-rewriter";

const rewriter = new ContentRewriter({
  defaultProvider: {
    type: "openai",
    model: "gpt-4.1",
  },
});

const results = await rewriter.rewrite(
  { content: htmlContent },
  {
    provider: { type: "openai", apiKey: "sk-..." },
    promptTemplate: "SEO_FOCUSED",
    variantCount: 5,
    onProgress: (progress) => {
      console.log(`${progress.currentVariant}/${progress.totalVariants}`);
    },
  }
);
```

## Features

### Format Auto-Detection

The library automatically detects content format (HTML, Markdown, or plain text) and processes accordingly:

```typescript
// HTML - detected automatically
const htmlResult = await rewrite({ content: "<h1>Title</h1><p>Content</p>" }, options);

// Markdown - detected automatically
const mdResult = await rewrite({ content: "# Title\n\nContent here" }, options);

// Plain text - detected automatically
const textResult = await rewrite({ content: "Just plain text content" }, options);

// Or specify explicitly
const result = await rewrite({ content: "...", format: "html" }, options);
```

### Built-in Prompt Templates

```typescript
import { PROMPTS } from "@affiliate.fm/ai-content-rewriter";

// Available templates:
// - MULTILINGUAL_DEFAULT - Universal rewrite preserving language
// - SEO_FOCUSED - Optimized for search engines
// - CASUAL_TONE - Conversational, friendly style
// - FORMAL_PROFESSIONAL - Business/professional tone
// - CUSTOM - Use your own prompt

const results = await rewrite(content, {
  provider: { type: "openai", apiKey: "..." },
  promptTemplate: "SEO_FOCUSED",
});

// Or use a custom prompt
const results = await rewrite(content, {
  provider: { type: "openai", apiKey: "..." },
  prompt: "Your custom rewriting instructions here...",
});
```

### Progress Tracking

```typescript
const results = await rewrite(content, {
  provider: { type: "openai", apiKey: "..." },
  variantCount: 5,
  onProgress: (progress) => {
    console.log(progress.phase); // 'preparing' | 'generating' | 'processing' | 'done'
    console.log(`Variant ${progress.currentVariant}/${progress.totalVariants}`);
    
    // For large content processed in chunks
    if (progress.currentChunk) {
      console.log(`Chunk ${progress.currentChunk}/${progress.totalChunks}`);
    }
    
    console.log(`Cost so far: $${progress.costSoFar?.toFixed(4)}`);
  },
});
```

### Large Content Handling

Content over 12,000 characters is automatically split into chunks and processed in parallel:

```typescript
const largeArticle = await fetchLargeArticle();

const results = await rewrite(
  { content: largeArticle },
  {
    provider: { type: "openai", apiKey: "..." },
    onProgress: (progress) => {
      // Track chunk progress for large content
      if (progress.totalChunks) {
        console.log(`Processing chunk ${progress.currentChunk}/${progress.totalChunks}`);
      }
    },
  }
);
```

### Cancellation

```typescript
const controller = new AbortController();

// Start rewrite
const promise = rewrite(content, {
  provider: { type: "openai", apiKey: "..." },
  signal: controller.signal,
});

// Cancel if needed
controller.abort();
```

### AI Pattern Masking (Anti-Detection)

By default, the library automatically masks common AI-generated patterns to make content appear more natural:

```typescript
// Masking is enabled by default
const results = await rewrite(content, options);

// Disable masking if needed
const results = await rewrite(content, {
  ...options,
  maskAIPatterns: false,
});

// Or use masking utilities directly
import { maskAIPatterns, maskAIPatternsInHTML } from "@affiliate.fm/ai-content-rewriter";

const humanizedText = maskAIPatterns(aiGeneratedText);
const humanizedHtml = maskAIPatternsInHTML(aiGeneratedHtml);
```

**What gets masked:**
- Em-dashes and en-dashes → regular dashes
- Formal academic phrases → casual alternatives ("moreover" → "also", "furthermore" → "plus")
- Typical AI phrases ("it is important to note" → "note that")
- Unicode bullet points → simple markers
- Overly structured patterns (numbered conclusions, "Firstly, Secondly...")
- Optional: contractions for more natural flow

## API Reference

### `rewrite(input, options)`

Main function for rewriting content.

**Parameters:**
- `input`: `ContentInput | string` - Content to rewrite
- `options`: `RewriteOptions` - Rewrite configuration

**Returns:** `Promise<RewriteResult[]>`

### `rewriteOne(input, options)`

Convenience function that returns a single result.

**Returns:** `Promise<RewriteResult>`

### `ContentRewriter` Class

For reusable configuration:

```typescript
const rewriter = new ContentRewriter(config);
const results = await rewriter.rewrite(input, options);
const templates = rewriter.getPromptTemplates();
```

## Types

```typescript
interface ContentInput {
  content: string;
  title?: string;
  description?: string;
  format?: "html" | "markdown" | "text";
}

interface RewriteOptions {
  provider: ProviderConfig;
  prompt?: string;
  promptTemplate?: string;
  variantCount?: number; // 1-30, default: 1
  temperature?: number; // 0-2, default: 0.9
  maskAIPatterns?: boolean; // default: true
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

interface RewriteResult {
  content: string;
  title: string;
  description: string;
  cost?: number;
  format: ContentFormat;
}

interface ProviderConfig {
  type: "openai" | "anthropic" | "custom";
  apiKey: string;
  model?: string;
  baseUrl?: string;
}
```

## Error Handling

```typescript
import { RewriterError, ProviderError, RateLimitError, ValidationError } from "@affiliate.fm/ai-content-rewriter";

try {
  const results = await rewrite(content, options);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof ProviderError) {
    console.log(`Provider error: ${error.message}`);
  } else if (error instanceof ValidationError) {
    console.log(`Invalid input: ${error.message}`);
  }
}
```

## Browser Usage

The library works in browsers with the OpenAI SDK's browser mode:

```typescript
import { rewrite } from "@affiliate.fm/ai-content-rewriter/browser";

// Same API, optimized for browsers
const results = await rewrite(content, options);
```

## Pricing

Cost is calculated based on OpenAI's token pricing:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| gpt-4.1 | $2.00 | $8.00 |
| gpt-4.1-mini | $0.40 | $1.60 |
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |

## Related

- [astro-content-ai-translator](https://affiliate.fm/tools/astro-content-ai-translator/) — AI-powered translation for Astro
- [website-core-template](https://affiliate.fm/tools/website-core-template/) — Multilingual static site template

## License

MIT
