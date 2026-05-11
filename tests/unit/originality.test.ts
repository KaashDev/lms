import { describe, it, expect } from "vitest";
import {
  computeStaticStats,
  computeVersionSignals,
  tiptapToPlainText,
} from "@/lib/originality/stats";

describe("tiptapToPlainText", () => {
  it("extracts text from a simple doc", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world." }],
        },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe("Hello world.");
  });

  it("joins text across nested nodes with sentence separation", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First sentence." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second sentence." }] },
      ],
    };
    const text = tiptapToPlainText(doc);
    expect(text).toContain("First sentence.");
    expect(text).toContain("Second sentence.");
  });

  it("handles bold/italic marks (text nodes still have .text)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold ", marks: [{ type: "bold" }] },
            { type: "text", text: "word." },
          ],
        },
      ],
    };
    expect(tiptapToPlainText(doc)).toBe("Bold word.");
  });

  it("returns empty string for null/undefined input", () => {
    expect(tiptapToPlainText(null)).toBe("");
    expect(tiptapToPlainText(undefined)).toBe("");
    expect(tiptapToPlainText({})).toBe("");
  });
});

describe("computeStaticStats", () => {
  it("returns zeros for empty text", () => {
    const stats = computeStaticStats("");
    expect(stats.wordCount).toBe(0);
    expect(stats.sentenceCount).toBe(0);
    expect(stats.vocabularyDiversity).toBe(0);
  });

  it("counts words on whitespace and punctuation", () => {
    const stats = computeStaticStats("Hello, world! How are you?");
    expect(stats.wordCount).toBe(5);
    expect(stats.sentenceCount).toBe(2);
  });

  it("computes vocabulary diversity correctly", () => {
    // 4 unique words out of 4 total → diversity 1.0
    const stats = computeStaticStats("Alpha beta gamma delta.");
    expect(stats.vocabularyDiversity).toBeCloseTo(1.0, 2);

    // 1 unique out of 4 total → diversity 0.25
    const repeated = computeStaticStats("the the the the");
    expect(repeated.vocabularyDiversity).toBeCloseTo(0.25, 2);
  });

  it("computes sentence-length variance", () => {
    // Two sentences of identical length → zero variance.
    const uniform = computeStaticStats("One two three four. Five six seven eight.");
    expect(uniform.sentenceLengthStdDev).toBeLessThan(0.5);

    // Sentences of varying length → nonzero variance.
    const varied = computeStaticStats(
      "Short. A much longer sentence that goes on for many words indeed."
    );
    expect(varied.sentenceLengthStdDev).toBeGreaterThan(2);
  });

  it("handles unicode + apostrophes in words", () => {
    const stats = computeStaticStats("It's a café. We're here.");
    expect(stats.wordCount).toBe(6);
  });
});

describe("computeVersionSignals", () => {
  it("returns zeros for no versions", () => {
    const s = computeVersionSignals([]);
    expect(s.totalVersions).toBe(0);
    expect(s.effectiveWpm).toBe(0);
  });

  it("caps gaps at 5 minutes for effective WPM", () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const t1 = new Date("2026-01-01T11:00:00Z"); // 60 minutes later
    // 100-word essay typed over an hour, but with one huge idle gap.
    // Effective time should be capped at 5 minutes, so WPM = 100 / 5 = 20.
    const sigs = computeVersionSignals([
      { createdAt: t0, wordCount: 0, fromPaste: false, pasteCharCount: null },
      { createdAt: t1, wordCount: 100, fromPaste: false, pasteCharCount: null },
    ]);
    expect(sigs.totalTimeMinutes).toBeCloseTo(5, 0);
    expect(sigs.effectiveWpm).toBeCloseTo(20, 0);
  });

  it("flags the largest single jump as a fraction of final", () => {
    // 1000-word final, mostly arrived in one version.
    const sigs = computeVersionSignals([
      {
        createdAt: new Date("2026-01-01T10:00:00Z"),
        wordCount: 100,
        fromPaste: false,
        pasteCharCount: null,
      },
      {
        createdAt: new Date("2026-01-01T10:01:00Z"),
        wordCount: 900,
        fromPaste: true,
        pasteCharCount: 4500,
      },
      {
        createdAt: new Date("2026-01-01T10:05:00Z"),
        wordCount: 1000,
        fromPaste: false,
        pasteCharCount: null,
      },
    ]);
    // Largest jump is 800 of 1000 = 0.8.
    expect(sigs.largestJumpFraction).toBeCloseTo(0.8, 2);
    expect(sigs.pasteCount).toBe(1);
    expect(sigs.largestPasteChars).toBe(4500);
  });

  it("treats the first version's words as a jump from 0", () => {
    const sigs = computeVersionSignals([
      {
        createdAt: new Date("2026-01-01T10:00:00Z"),
        wordCount: 500,
        fromPaste: true,
        pasteCharCount: 2500,
      },
    ]);
    // 500 of 500 = 1.0
    expect(sigs.largestJumpFraction).toBeCloseTo(1.0, 2);
  });
});
