// Helpers for mapping browser DOM Selection objects to plain-text
// character offsets within a known root element. Used for anchored
// comments on submission bodies.
//
// The character offsets we produce match what tiptapToPlainText would
// produce server-side: text nodes concatenated, with block boundaries
// inserting a single space.
//
// Why character offsets instead of Tiptap positions:
//   - DOM positions are non-trivial to get back to Tiptap positions
//     for a read-only renderer (no ProseMirror EditorView).
//   - Character offsets survive Tiptap's internal node structure changes.
//   - We snapshot the body at version-creation time anyway, so offsets
//     against the stored body are stable.
//
// What this DOESN'T do: handle non-text nodes (images, embeds) gracefully.
// For our StarterKit-only essay editor that's fine — there are no embeds.

interface OffsetRange {
  start: number;
  end: number;
  quote: string;
}

/**
 * Compute the character offset of `node` (text or element) at `offset`
 * within `root`, treating block boundaries as 1-char separators (a single
 * space). Returns the character index counting only text content.
 *
 * `targetNode` is the node the selection endpoint lives in. For text
 * nodes, `targetOffset` is the char offset within that text node. For
 * element nodes, `targetOffset` is the child index (per DOM Range spec).
 */
function offsetWithinRoot(
  root: Node,
  targetNode: Node,
  targetOffset: number
): number {
  // Walker traverses depth-first. We count chars as we go and stop when
  // we hit the target.
  let chars = 0;
  let found = false;

  function walk(node: Node): boolean {
    if (found) return true;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (node === targetNode) {
        chars += Math.min(targetOffset, text.length);
        found = true;
        return true;
      }
      chars += text.length;
      return false;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // If the selection endpoint is anchored ON this element (offset is
      // a child index), translate.
      if (node === targetNode) {
        // Sum text content of the first `targetOffset` children, then stop.
        const children = node.childNodes;
        for (let i = 0; i < Math.min(targetOffset, children.length); i++) {
          walk(children[i]);
          if (found) return true;
        }
        found = true;
        return true;
      }

      // Descend.
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }

      // After a block element, add a separator unless this element is the
      // root or the last child of its parent. This matches the server-side
      // tiptapToPlainText's behavior (block boundaries → " ").
      if (node !== root && isBlockTag((node as Element).tagName)) {
        chars += 1;
      }
    }
    return false;
  }

  walk(root);
  return chars;
}

function isBlockTag(tag: string): boolean {
  return (
    tag === "P" ||
    tag === "H1" ||
    tag === "H2" ||
    tag === "H3" ||
    tag === "H4" ||
    tag === "H5" ||
    tag === "H6" ||
    tag === "LI" ||
    tag === "BLOCKQUOTE" ||
    tag === "PRE"
  );
}

/**
 * Convert the current DOM selection to a {start, end, quote} range
 * relative to `root`. Returns null if the selection is empty, collapsed,
 * or not fully contained in `root`.
 */
export function selectionToOffsets(root: HTMLElement): OffsetRange | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;

  // Must be fully contained.
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const start = offsetWithinRoot(root, range.startContainer, range.startOffset);
  const end = offsetWithinRoot(root, range.endContainer, range.endOffset);
  const quote = range.toString().trim().slice(0, 300);

  if (start >= end) return null;
  if (!quote) return null;

  return { start, end, quote };
}
