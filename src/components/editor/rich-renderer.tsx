"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { sharedExtensions } from "@/lib/tiptap/extensions";

// Render a Tiptap JSON document without any editing controls.
// Used for assignment instructions on the student side, and for the
// submission preview before the student clicks "submit."
export function RichRenderer({
  content,
  className = "",
}: {
  content: unknown;
  className?: string;
}) {
  const editor = useEditor({
    extensions: sharedExtensions,
    content: (content as any) ?? "",
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose-content " + className,
      },
    },
  });

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}
