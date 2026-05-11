"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { sharedExtensions } from "@/lib/tiptap/extensions";
import { useEffect } from "react";

interface Props {
  initialContent?: unknown;
  onChange: (json: unknown) => void;
  placeholder?: string;
  ariaLabel?: string;
  // Some forms re-render with a new initialContent; we resync the editor
  // only when this key changes, to avoid clobbering local edits.
  resetKey?: string;
}

// Plain-text rich editor used for assignment instructions, syllabus, and
// teacher general feedback. Smaller surface than the student essay editor —
// no paste tracking, no autosave.
export function RichEditor({
  initialContent,
  onChange,
  placeholder,
  ariaLabel,
  resetKey,
}: Props) {
  const editor = useEditor({
    extensions: sharedExtensions,
    content: (initialContent as any) ?? "",
    editorProps: {
      attributes: {
        // Make the prose readable + accessible. Tailwind doesn't include
        // .prose by default; we use plain styles for portability.
        class:
          "prose-content min-h-[8rem] px-3 py-2 outline-none focus:outline-none",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? "Rich text editor",
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getJSON());
    },
    immediatelyRender: false,
  });

  // Resync when the parent explicitly says to.
  useEffect(() => {
    if (!editor) return;
    if (resetKey) {
      editor.commands.setContent((initialContent as any) ?? "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!editor) return <div className="input min-h-[8rem]" aria-hidden="true" />;

  return (
    <div className="border border-border rounded bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5 text-sm">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “
        </ToolbarButton>
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {placeholder && editor.isEmpty ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-3 text-muted text-sm"
          >
            {placeholder}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`px-2 py-1 rounded text-sm ${
        active ? "bg-accent/10 text-accent" : "hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
