"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";

// Tailwind-safe color presets. Limiting choice is kinder than a color
// picker — teachers spend zero time deliberating, the result looks calm.
const BANNER_COLORS = [
  "#0f766e", // teal
  "#1d4ed8", // blue
  "#7c3aed", // violet
  "#be185d", // rose
  "#b45309", // amber
  "#15803d", // green
  "#475569", // slate
  "#dc2626", // red
];

export function CreateClassDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");
  const [bannerColor, setBannerColor] = useState(BANNER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus the title field when opened. Trap is approximate (full focus
  // trap library = overkill here; Esc closes, Tab cycles inside the dialog
  // because there are no focusable elements outside it while it's modal).
  useEffect(() => {
    if (open) titleInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          term: term || null,
          bannerColor,
        }),
      });
      if (!res.ok) {
        setError("Couldn't create the class. Check the fields and try again.");
        return;
      }
      const data = await res.json();
      setOpen(false);
      router.push(`/classes/${data.class.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>New class</Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-class-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => {
            // Click on backdrop closes; click inside dialog doesn't.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div ref={dialogRef} className="card p-6 w-full max-w-md">
            <h2 id="create-class-title" className="font-display text-2xl mb-4">
              New class
            </h2>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="title" required>
                  Title
                </Label>
                <Input
                  id="title"
                  ref={titleInputRef}
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. English 9 — Period 3"
                />
              </div>
              <div>
                <Label htmlFor="term">Term</Label>
                <Input
                  id="term"
                  maxLength={100}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="e.g. Fall 2026"
                />
              </div>
              <fieldset>
                <legend className="label">Banner color</legend>
                <div className="flex gap-2 flex-wrap" role="radiogroup">
                  {BANNER_COLORS.map((c) => {
                    const selected = c === bannerColor;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`Color ${c}`}
                        onClick={() => setBannerColor(c)}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          selected ? "border-fg scale-110" : "border-transparent"
                        }`}
                        style={{ background: c }}
                      />
                    );
                  })}
                </div>
              </fieldset>

              {error ? (
                <div role="alert" className="text-danger text-sm">
                  {error}
                </div>
              ) : null}

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating..." : "Create class"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
