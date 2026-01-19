# AI Content Rewriter

AI-powered content rewriting library for OpenAI (gpt-4.1). Includes format auto-detection and configurable prompts.

Built by [Affiliate.FM](https://affiliate.fm) — independent media and open-source tools for ethical affiliate marketing.

## Installation

```bash
npm install @affiliate.fm/ai-content-rewriter
```

## Quick Start

```typescript
import { ContentRewriter } from "@affiliate.fm/ai-content-rewriter";

// Create rewriter instance
const rewriter = new ContentRewriter({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4.1", // Optional, defaults to gpt-4.1
});

// Rewrite content (single variant)
const [result] = await rewriter.rewrite("<h1>Original Title</h1><p>Original content...</p>");

console.log(result.content);     // Rewritten HTML
console.log(result.title);       // Rewritten title
console.log(result.description); // Rewritten description
console.log(result.cost);        // Cost in USD

// Generate multiple variants
const results = await rewriter.rewrite(htmlContent, { variants: 5 });
```

## Class API (Recommended)

```typescript
import { ContentRewriter } from "@affiliate.fm/ai-content-rewriter";

const rewriter = new ContentRewriter({
  provider: "openai",
  apiKey: "sk-...",
  model: "gpt-4.1",         // Optional
  temperature: 0.9,          // Optional, default: 0.9
});

// Simple rewrite
const [result] = await rewriter.rewrite(html);

// With options
const results = await rewriter.rewrite(html, {
  variants: 3,
  promptTemplate: "DEFAULT",
  temperature: 0.8,            // Override default
  onProgress: (p) => console.log(`${p.currentVariant}/${p.totalVariants}`),
});

// Single result shorthand
const result = await rewriter.rewriteOne(html);

// Get available prompt templates
const templates = rewriter.getPromptTemplates();
```

## Features

### Format Auto-Detection

Automatically detects content format (HTML, Markdown, or plain text):

```typescript
// HTML - detected automatically
const [result] = await rewriter.rewrite("<h1>Title</h1><p>Content</p>");

// Markdown - detected automatically
const [result] = await rewriter.rewrite("# Title\n\nContent here");

// Plain text - detected automatically
const [result] = await rewriter.rewrite("Just plain text content");

// Or specify explicitly
const [result] = await rewriter.rewrite({ content: "...", format: "html" });
```

### Built-in Prompt Templates

```typescript
import { PROMPTS } from "@affiliate.fm/ai-content-rewriter";

// Available templates:
// - DEFAULT - Universal rewrite preserving language
// - CUSTOM - Placeholder for a custom prompt

const results = await rewriter.rewrite(html, {
  promptTemplate: "DEFAULT",
});

// Or use a custom prompt
const results = await rewriter.rewrite(html, {
  prompt: "Your custom rewriting instructions here...",
});
```

### Progress Tracking

```typescript
const results = await rewriter.rewrite(content, {
  variants: 5,
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

const results = await rewriter.rewrite(largeArticle, {
  onProgress: (progress) => {
    if (progress.totalChunks) {
      console.log(`Processing chunk ${progress.currentChunk}/${progress.totalChunks}`);
    }
  },
});
```

### Cancellation

```typescript
const controller = new AbortController();

// Start rewrite
const promise = rewriter.rewrite(content, {
  signal: controller.signal,
});

// Cancel if needed
controller.abort();
```

### AI Pattern Masking (Anti-Detection)

By default, the library automatically masks common AI-generated patterns to make content appear more natural:

```typescript
// Masking is enabled by default
const results = await rewriter.rewrite(content);

// Disable masking if needed
const results = await rewriter.rewrite(content, {
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

### Uniqueness Checking

```typescript
import { checkUniqueness } from "@affiliate.fm/ai-content-rewriter";

const result = checkUniqueness(originalHtml, rewrittenHtml);

console.log(`${result.uniqueness}% unique`);  // e.g., "92% unique"
console.log(`${result.similarity}% similar`); // e.g., "8% similar"

if (result.isLowUniqueness) {
  console.warn('Content uniqueness is below 85%');
}
```

### Cost Estimation

```typescript
import { estimateCost } from "@affiliate.fm/ai-content-rewriter";

// Estimate before running
const estimatedCost = estimateCost("gpt-4.1", htmlContent.length, 3); // 3 variants
console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
```

## API Reference

### `ContentRewriter` Class

```typescript
const rewriter = new ContentRewriter({
  provider: "openai",        // Required: "openai" (only supported)
  apiKey: "sk-...",          // Required
  model: "gpt-4.1",          // Optional, default: "gpt-4.1"
  baseUrl: "...",            // Optional, for proxies
  temperature: 0.9,          // Optional, default: 0.9
  customPrompts: { ... },    // Optional, add custom templates
});

// Main method
const results = await rewriter.rewrite(input, options);

// Single result shorthand  
const result = await rewriter.rewriteOne(input, options);

// Get prompt templates
const templates = rewriter.getPromptTemplates();

// Get provider info
const provider = rewriter.getProvider();
```

### Rewrite Options (per-call)

```typescript
interface RewriteCallOptions {
  variants?: number;         // 1-30, default: 1
  prompt?: string;           // Custom prompt
  promptTemplate?: string;   // Template key
  temperature?: number;      // 0-2, override constructor default
  maskAIPatterns?: boolean;  // default: true
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}
```

### Content Input

```typescript
// String shorthand
await rewriter.rewrite("<h1>Title</h1><p>Content</p>");

// Object with metadata
await rewriter.rewrite({
  content: "<h1>Title</h1><p>Content</p>",
  title: "Optional explicit title",
  description: "Optional meta description",
  format: "html", // Optional: "html" | "markdown" | "text"
});
```

### Rewrite Result

```typescript
interface RewriteResult {
  content: string;           // Rewritten content
  title: string;             // Rewritten title
  description: string;       // Rewritten description
  cost?: number;             // Cost in USD
  format: ContentFormat;     // Detected/specified format
}
```

## Error Handling

```typescript
import { 
  RewriterError, 
  ProviderError, 
  RateLimitError, 
  ValidationError 
} from "@affiliate.fm/ai-content-rewriter";

try {
  const results = await rewriter.rewrite(content);
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
import { ContentRewriter } from "@affiliate.fm/ai-content-rewriter/browser";

const rewriter = new ContentRewriter({
  provider: "openai",
  apiKey: "sk-...",
});

const results = await rewriter.rewrite(content);
```

## Pricing

Cost is calculated based on OpenAI's token pricing (gpt-4.1 only):

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| gpt-4.1 | $5.00 | $15.00 |

## Related

- [astro-content-ai-translator](https://affiliate.fm/tools/astro-content-ai-translator/) — AI-powered translation for Astro
- [website-core-template](https://affiliate.fm/tools/website-core-template/) — Multilingual static site template

## License

MIT
