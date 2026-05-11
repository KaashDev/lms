"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { sharedExtensions } from "@/lib/tiptap/extensions";
import { useEffect, useRef, useState } from "react";

interface Props {
  initialContent?: unknown;
  // Called after every save attempt. body is the latest doc JSON; fromPaste
  // is true if the most recent change came from a paste > PASTE_THRESHOLD.
  onSave: (
    body: unknown,
    opts: { fromPaste: boolean; pasteCharCount?: number }
  ) => Promise<void>;
  disabled?: boolean;
  ariaLabel?: string;
}

// Paste size that flips fromPaste=true on the next save.
const PASTE_THRESHOLD = 100;

// Autosave cadence per our spec.
const AUTOSAVE_MS = 30_000;

// The student essay editor. Key behaviors:
//   - Autosave every 30s if dirty.
//   - "Save" button always available, immediate.
//   - Paste of > 100 chars triggers an immediate save and flags the version.
//   - Word count visible at all times.
//
// Paste detection is teacher-only. The student doesn't see they've been
// flagged — telling them would just train them to paste in 99-char chunks.
export function EssayEditor({ initialContent, onSave, disabled, ariaLabel }: Props) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [wordCount, setWordCount] = useState(0);

  // Refs avoid stale closures inside the autosave interval.
  const dirtyRef = useRef(false);
  const pendingPasteRef = useRef<{ chars: number } | null>(null);
  const saveInFlightRef = useRef(false);

  const editor = useEditor({
    extensions: sharedExtensions,
    content: (initialContent as any) ?? "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose-content min-h-[24rem] px-4 py-3 outline-none focus:outline-none leading-relaxed",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? "Essay editor",
      },
      handlePaste(_view, event) {
        // Capture pasted size for the NEXT save.
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (text.length >= PASTE_THRESHOLD) {
          pendingPasteRef.current = { chars: text.length };
          // Schedule an immediate save right after Tiptap applies the paste.
          // We do this in a microtask so the editor state is up to date.
          queueMicrotask(() => {
            void save();
          });
        }
        // Let Tiptap handle the actual insertion.
        return false;
      },
    },
    onUpdate({ editor }) {
      dirtyRef.current = true;
      // Word count: simple whitespace split on the plain text.
      const text = editor.getText();
      const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
      setWordCount(matches.length);
    },
    immediatelyRender: false,
  });

  // Save function. Honors paste detection.
  async function save() {
    if (!editor) return;
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaveState("saving");
    const paste = pendingPasteRef.current;
    pendingPasteRef.current = null;
    try {
      await onSave(editor.getJSON(), {
        fromPaste: !!paste,
        pasteCharCount: paste?.chars,
      });
      dirtyRef.current = false;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setSaveState("error");
    } finally {
      saveInFlightRef.current = false;
    }
  }

  // Autosave interval.
  useEffect(() => {
    if (disabled) return;
    const id = setInterval(() => {
      if (dirtyRef.current && !saveInFlightRef.current) {
        void save();
      }
    }, AUTOSAVE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Save on Cmd/Ctrl+S, leaving the browser's default disabled.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!disabled) void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  if (!editor) {
    return <div className="input min-h-[24rem]" aria-hidden="true" />;
  }

  return (
    <div className="border border-border rounded bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="flex flex-wrap gap-1 text-sm">
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            label="Heading"
            active={editor.isActive("heading", { level: 2 })}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={editor.isActive("blockquote")}
            disabled={disabled}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            “
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span aria-live="polite" aria-atomic="true">
            {wordCount} word{wordCount === 1 ? "" : "s"}
          </span>
          <span aria-live="polite">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : ""}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={disabled}
            className="btn-secondary px-3 py-1 text-xs"
          >
            Save
          </button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm ${
        active ? "bg-accent/10 text-accent" : "hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
