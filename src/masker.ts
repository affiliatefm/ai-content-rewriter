/**
 * AI Text Masker
 * ==============
 * Removes typical AI-generated text patterns to make content appear
 * more natural and human-written.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MaskingOptions {
  /** Replace em-dashes and en-dashes with regular dashes */
  replaceDashes?: boolean;
  /** Replace overly formal academic phrases */
  replaceFormalPhrases?: boolean;
  /** Replace Unicode bullet points with simpler markers */
  replaceBullets?: boolean;
  /** Add variations to numbered lists */
  varyLists?: boolean;
  /** Remove multiple consecutive spaces */
  removeDoubleSpaces?: boolean;
  /** Add natural human-like variations (contractions) */
  addNaturalVariations?: boolean;
  /** Replace typical AI-generated phrases */
  replaceAIPhrases?: boolean;
  /** Remove overly structured patterns */
  removeStructuralPatterns?: boolean;
}

// =============================================================================
// DEFAULT OPTIONS
// =============================================================================

const DEFAULT_OPTIONS: MaskingOptions = {
  replaceDashes: true,
  replaceFormalPhrases: true,
  replaceBullets: true,
  varyLists: true,
  removeDoubleSpaces: true,
  addNaturalVariations: true,
  replaceAIPhrases: true,
  removeStructuralPatterns: true,
};

// =============================================================================
// REPLACEMENT DICTIONARIES
// =============================================================================

const FORMAL_PHRASES: Record<string, string[]> = {
  moreover: ["also", "plus", "and", "besides"],
  furthermore: ["also", "plus", "and", "what's more"],
  additionally: ["also", "plus", "and", "as well"],
  consequently: ["so", "therefore", "as a result", "because of this"],
  nevertheless: ["but", "however", "still", "yet"],
  nonetheless: ["but", "still", "however", "even so"],
  accordingly: ["so", "therefore", "thus"],
  therefore: ["so", "thus", "hence"],
  hence: ["so", "thus", "that's why"],
  thus: ["so", "therefore", "this way"],
  indeed: ["really", "actually", "in fact", "truly"],
  certainly: ["surely", "definitely", "of course", "for sure"],
  undoubtedly: ["surely", "definitely", "clearly", "obviously"],
  arguably: ["perhaps", "maybe", "possibly", "some say"],
  notably: ["especially", "particularly", "specifically"],
  importantly: ["important to note", "worth noting", "keep in mind"],
  fundamentally: ["basically", "essentially", "at its core"],
  ultimately: ["finally", "in the end", "eventually"],
  substantially: ["largely", "mostly", "mainly", "significantly"],
  predominantly: ["mainly", "mostly", "largely", "primarily"],
};

const AI_PHRASES: Record<string, string[]> = {
  "it is important to note that": ["note that", "remember", "keep in mind", "worth noting"],
  "it's important to note that": ["note that", "remember", "keep in mind", "worth noting"],
  "it is worth noting that": ["note that", "interestingly", "notably", "by the way"],
  "it's worth noting that": ["note that", "interestingly", "notably", "by the way"],
  "in conclusion": ["finally", "to sum up", "overall", "wrapping up"],
  "in summary": ["to sum up", "overall", "basically", "in short"],
  "first and foremost": ["first", "firstly", "to start", "first of all"],
  "last but not least": ["finally", "lastly", "also", "and finally"],
  "at the end of the day": ["ultimately", "finally", "in the end", "all things considered"],
  "when it comes to": ["regarding", "about", "for", "as for"],
  "in order to": ["to", "for", "so that"],
  "due to the fact that": ["because", "since", "as"],
  "in the event that": ["if", "when", "should"],
  "for the purpose of": ["for", "to", "in order to"],
  "with regard to": ["about", "regarding", "on", "concerning"],
  "as a matter of fact": ["actually", "in fact", "really", "truthfully"],
  "it goes without saying": ["obviously", "clearly", "naturally"],
  "needless to say": ["obviously", "clearly", "of course"],
  "all things considered": ["overall", "in general", "on balance"],
  "for all intents and purposes": ["basically", "essentially", "practically"],
  "in light of": ["considering", "given", "because of"],
  "in terms of": ["regarding", "about", "for"],
  "with respect to": ["about", "regarding", "concerning"],
  "in essence": ["basically", "essentially", "fundamentally"],
  "to put it simply": ["simply put", "basically", "in short"],
};

const CONTRACTIONS: Record<string, string> = {
  cannot: "can't",
  "will not": "won't",
  "do not": "don't",
  "does not": "doesn't",
  "is not": "isn't",
  "are not": "aren't",
  "was not": "wasn't",
  "were not": "weren't",
  "have not": "haven't",
  "has not": "hasn't",
  "had not": "hadn't",
  "would not": "wouldn't",
  "should not": "shouldn't",
  "could not": "couldn't",
  "might not": "mightn't",
  "must not": "mustn't",
  "it is": "it's",
  "that is": "that's",
  "what is": "what's",
  "who is": "who's",
  "where is": "where's",
  "when is": "when's",
  "why is": "why's",
  "how is": "how's",
  "you are": "you're",
  "they are": "they're",
  "we are": "we're",
  "you have": "you've",
  "they have": "they've",
  "we have": "we've",
  "I have": "I've",
  "you had": "you'd",
  "they had": "they'd",
  "we had": "we'd",
  "I had": "I'd",
  "you will": "you'll",
  "they will": "they'll",
  "we will": "we'll",
  "I will": "I'll",
  "let us": "let's",
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function preserveCase(original: string, replacement: string): string {
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// =============================================================================
// TRANSFORMATION FUNCTIONS
// =============================================================================

/** Replace em-dashes, en-dashes with regular dashes */
function replaceEmDashes(text: string): string {
  return text
    .replace(/—/g, " - ") // Em dash
    .replace(/–/g, " - ") // En dash
    .replace(/―/g, " - "); // Horizontal bar
}

/** Replace overly formal academic phrases */
function replaceFormalPhrases(text: string): string {
  let result = text;

  for (const [formal, casual] of Object.entries(FORMAL_PHRASES)) {
    const regex = new RegExp(`\\b${formal}\\b`, "gi");
    result = result.replace(regex, (match) => preserveCase(match, randomChoice(casual)));
  }

  return result;
}

/** Replace Unicode bullet points with simpler markers */
function replaceBulletPoints(text: string): string {
  return text.replace(/[•·▪▫◆◇○●■□▸▹►▻]/g, () => {
    return randomChoice(["-", "*", "•", ""]);
  });
}

/** Add variations to numbered lists */
function varyListFormatting(text: string): string {
  return text.replace(/^(\d+)\.\s+/gm, (_match, num) => {
    return randomChoice([`${num}. `, `${num}) `, `${num} - `, `${num}: `]);
  });
}

/** Remove multiple consecutive spaces */
function removeDoubleSpaces(text: string): string {
  return text.replace(/\s{2,}/g, " ").trim();
}

/** Replace typical AI-generated phrases */
function replaceTypicalAIPhrases(text: string): string {
  let result = text;

  for (const [phrase, replacements] of Object.entries(AI_PHRASES)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    result = result.replace(regex, (match) => preserveCase(match, randomChoice(replacements)));
  }

  return result;
}

/** Remove overly structured patterns common in AI text */
function removeStructuralPatterns(text: string): string {
  let result = text;

  // Remove "Firstly, Secondly, Thirdly" type structures
  result = result.replace(/\b(Firstly|Secondly|Thirdly|Fourthly|Fifthly|Lastly)\b,?\s*/gi, "");

  // Remove numbered conclusions like "1. Conclusion:"
  result = result.replace(/^\d+\.\s*(Introduction|Conclusion|Summary|Overview|Background):\s*/gim, "");

  // Remove overly structured headers
  result = result.replace(/^(Introduction|Conclusion|Summary|Overview|Background):\s*/gim, "");

  // Remove academic-style citations placeholders
  result = result.replace(/\[citation needed\]|\[ref\]|\[\d+\]/g, "");

  // Remove "In this article/essay/text" phrases
  result = result.replace(
    /\b(In this|This) (article|essay|text|paper|document|section|chapter)\b[,\s]*/gi,
    ""
  );

  return result;
}

/** Add natural human-like variations (contractions) */
function addNaturalVariations(text: string): string {
  // Only apply variations occasionally (10% chance)
  if (Math.random() > 0.1) {
    return text;
  }

  let result = text;
  const entries = Object.entries(CONTRACTIONS);
  const numToApply = Math.floor(Math.random() * 3) + 1;

  for (let i = 0; i < numToApply && i < entries.length; i++) {
    const [formal, casual] = entries[Math.floor(Math.random() * entries.length)];
    const regex = new RegExp(`\\b${formal}\\b`, "gi");
    result = result.replace(regex, (match) => preserveCase(match, casual));
  }

  return result;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Mask AI-generated patterns in plain text
 */
export function maskAIPatterns(text: string, options: MaskingOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let result = text;

  if (opts.replaceDashes) {
    result = replaceEmDashes(result);
  }

  if (opts.replaceFormalPhrases) {
    result = replaceFormalPhrases(result);
  }

  if (opts.replaceBullets) {
    result = replaceBulletPoints(result);
  }

  if (opts.varyLists) {
    result = varyListFormatting(result);
  }

  if (opts.removeDoubleSpaces) {
    result = removeDoubleSpaces(result);
  }

  if (opts.replaceAIPhrases) {
    result = replaceTypicalAIPhrases(result);
  }

  if (opts.removeStructuralPatterns) {
    result = removeStructuralPatterns(result);
  }

  if (opts.addNaturalVariations) {
    result = addNaturalVariations(result);
  }

  return result;
}

/**
 * Mask AI-generated patterns in HTML while preserving structure
 */
export function maskAIPatternsInHTML(html: string, options: MaskingOptions = {}): string {
  const preservedElements: Map<string, string> = new Map();
  let counter = 0;
  let result = html;

  // Preserve script, style, code, and pre blocks
  const preserveTags = ["script", "style", "code", "pre"];

  for (const tag of preserveTags) {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, "gis");
    result = result.replace(regex, (match) => {
      const placeholder = `__PRESERVE_${counter}__`;
      preservedElements.set(placeholder, match);
      counter++;
      return placeholder;
    });
  }

  // Process text between HTML tags
  result = result.replace(/>([^<]+)</g, (_match, textContent) => {
    if (textContent.trim() === "") {
      return _match;
    }
    const processed = maskAIPatterns(textContent, options);
    return `>${processed}<`;
  });

  // Process text in common attributes
  const attributesToProcess = ["title", "alt", "placeholder", "content", "description"];
  for (const attr of attributesToProcess) {
    const regex = new RegExp(`${attr}="([^"]*)"`, "gi");
    result = result.replace(regex, (_match, value) => {
      const processed = maskAIPatterns(value, options);
      return `${attr}="${processed}"`;
    });
  }

  // Restore preserved elements
  for (const [placeholder, value] of preservedElements) {
    result = result.replace(placeholder, value);
  }

  return result;
}
