import StarterKit from "@tiptap/starter-kit";

// Per our spec: StarterKit only. No tables, no code blocks, no images.
// StarterKit includes: paragraph, heading, bold, italic, strike, code,
// bullet list, ordered list, blockquote, horizontal rule, hard break,
// history (undo/redo).
//
// We keep this as a shared array so the read-only renderer used by the
// teacher's grading view uses the same extensions as the editor — keeps
// content rendering identical.
export const sharedExtensions = [StarterKit];
