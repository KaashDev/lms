// Originality signals. These are NOT a verdict on AI use — they're things
// for a teacher to notice. Documented honestly in the UI.
//
// Two layers:
//   1) Static stats over the final text (sentence length variance,
//      vocabulary diversity / TTR).
//   2) Version-history signals (sudden large additions, paste counts,
//      time-on-task vs final word count).
//
// We deliberately don't run external API calls. No "AI detector" service
// claims to actually work, and they all introduce privacy issues.

export interface StaticStats {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  // Type-token ratio: unique words / total words. Higher = more varied
  // vocabulary. Most prose lands 0.4–0.6.
  vocabularyDiversity: number;
  // Length variance: stddev of sentence length in words. Low values (<3)
  // suggest unusually uniform prose — one of the (weak) signals.
  sentenceLengthStdDev: number;
}

export interface VersionSignals {
  totalVersions: number;
  totalTimeMinutes: number;
  largestPasteChars: number;
  pasteCount: number;
  // Wpm averaged over actual editing time (gaps > 5 min don't count).
  effectiveWpm: number;
  // Fraction of final word count that arrived in the largest single jump
  // between versions. >0.5 means the document essentially "appeared" once.
  largestJumpFraction: number;
}

// ---------- Static stats ----------

/**
 * Extract plain text from a Tiptap JSON doc. Walks the tree, collects
 * text from text nodes. No formatting, no markup.
 */
/**
 * Returns true if a Tiptap doc has no meaningful content. Used to gate
 * submission finalization — students can't submit a doc that's just an
 * empty paragraph or pure whitespace.
 *
 * Walks the tree and counts non-whitespace text characters. Anything > 0
 * is non-empty. Cheaper and more robust than JSON.stringify length checks.
 */
export function isTiptapDocEmpty(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return true;
  let nonWhitespaceChars = 0;
  function walk(node: any) {
    if (!node) return;
    if (typeof node.text === "string") {
      // Trim whitespace and zero-width characters before counting.
      const cleaned = node.text.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
      nonWhitespaceChars += cleaned.length;
      if (nonWhitespaceChars > 0) return; // short-circuit
    }
    if (Array.isArray(node.content)) {
      for (const c of node.content) {
        walk(c);
        if (nonWhitespaceChars > 0) return;
      }
    }
  }
  walk(doc);
  return nonWhitespaceChars === 0;
}

export function tiptapToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const parts: string[] = [];
  function walk(node: any) {
    if (!node) return;
    if (typeof node.text === "string") {
      parts.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) {
      for (const c of node.content) walk(c);
      // Treat block boundaries as spaces so sentence splitting works.
      const type = node.type;
      if (
        type === "paragraph" ||
        type === "heading" ||
        type === "blockquote" ||
        type === "listItem" ||
        type === "codeBlock"
      ) {
        parts.push(" ");
      }
    }
  }
  walk(doc);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function computeStaticStats(text: string): StaticStats {
  // Word tokenization: anything Unicode-letter-like + apostrophes.
  // Hyphenated words count as one word. Numbers excluded from vocab
  // diversity but counted in word count.
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  const wordCount = words.length;

  // Sentence split: terminal punctuation followed by space/EOL or end.
  // Imperfect but consistent. Abbreviations will inflate count slightly.
  const sentences = text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const sentenceCount = sentences.length;

  if (wordCount === 0) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      vocabularyDiversity: 0,
      sentenceLengthStdDev: 0,
    };
  }

  // Per-sentence word counts for stddev.
  const sentenceLengths = sentences.map(
    (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).length
  );
  const avgSentenceLength =
    sentenceLengths.reduce((a, b) => a + b, 0) / Math.max(1, sentenceLengths.length);
  const variance =
    sentenceLengths.reduce((acc, n) => acc + (n - avgSentenceLength) ** 2, 0) /
    Math.max(1, sentenceLengths.length);
  const sentenceLengthStdDev = Math.sqrt(variance);

  // Vocab diversity: unique lowercased word tokens / total words. Only the
  // letter-words (drop pure-numeric tokens) so dates don't inflate uniqueness.
  const letterWords = words.filter((w) => /[\p{L}]/u.test(w)).map((w) => w.toLowerCase());
  const unique = new Set(letterWords);
  const vocabularyDiversity = letterWords.length > 0 ? unique.size / letterWords.length : 0;

  return {
    wordCount,
    sentenceCount,
    avgSentenceLength,
    vocabularyDiversity,
    sentenceLengthStdDev,
  };
}

// ---------- Version signals ----------

interface VersionRow {
  createdAt: Date;
  wordCount: number;
  fromPaste: boolean;
  pasteCharCount: number | null;
}

export function computeVersionSignals(versions: VersionRow[]): VersionSignals {
  if (versions.length === 0) {
    return {
      totalVersions: 0,
      totalTimeMinutes: 0,
      largestPasteChars: 0,
      pasteCount: 0,
      effectiveWpm: 0,
      largestJumpFraction: 0,
    };
  }

  // Versions should already be sorted by createdAt — but don't trust it.
  const sorted = [...versions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const finalWordCount = sorted[sorted.length - 1].wordCount;

  // Effective editing time: sum of gaps between versions, but cap each
  // gap at 5 minutes (treat anything longer as "walked away").
  let effectiveMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime();
    effectiveMs += Math.min(gap, 5 * 60 * 1000);
  }
  const effectiveMinutes = effectiveMs / (60 * 1000);
  const effectiveWpm = effectiveMinutes > 0 ? finalWordCount / effectiveMinutes : 0;

  // Largest jump in word count between consecutive versions.
  let largestJump = 0;
  for (let i = 1; i < sorted.length; i++) {
    const jump = sorted[i].wordCount - sorted[i - 1].wordCount;
    if (jump > largestJump) largestJump = jump;
  }
  // Also consider the first version itself as a "jump" from 0.
  if (sorted[0].wordCount > largestJump) largestJump = sorted[0].wordCount;
  const largestJumpFraction = finalWordCount > 0 ? largestJump / finalWordCount : 0;

  const pastes = sorted.filter((v) => v.fromPaste);
  const largestPasteChars = pastes.reduce(
    (max, v) => Math.max(max, v.pasteCharCount ?? 0),
    0
  );

  return {
    totalVersions: sorted.length,
    totalTimeMinutes: effectiveMinutes,
    largestPasteChars,
    pasteCount: pastes.length,
    effectiveWpm,
    largestJumpFraction,
  };
}
