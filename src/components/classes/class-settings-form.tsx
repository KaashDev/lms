"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";

const BANNER_COLORS = [
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#be185d",
  "#b45309",
  "#15803d",
  "#475569",
  "#dc2626",
];

interface Initial {
  title: string;
  term: string;
  description: string;
  bannerColor: string;
  joinCode: string;
  archived: boolean;
}

export function ClassSettingsForm({
  classId,
  initial,
}: {
  classId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [term, setTerm] = useState(initial.term);
  const [description, setDescription] = useState(initial.description);
  const [bannerColor, setBannerColor] = useState(initial.bannerColor);
  const [joinCode, setJoinCode] = useState(initial.joinCode);
  const [archived, setArchived] = useState(initial.archived);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          term: term || null,
          description: description || null,
          bannerColor,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  async function toggleArchive() {
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (res.ok) {
        setArchived(!archived);
        router.refresh();
      }
    });
  }

  async function regenerateCode() {
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/join-code`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setJoinCode(data.joinCode);
        router.refresh();
      }
    });
  }

  async function deleteClass() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}`, { method: "DELETE" });
      if (res.ok) router.push("/classes");
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Details</h2>
        <div>
          <Label htmlFor="title" required>
            Title
          </Label>
          <Input
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor="term">Term</Label>
          <Input
            id="term"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            maxLength={100}
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="input"
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
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save changes"}
          </Button>
          {saved ? <span className="text-success text-sm">Saved</span> : null}
        </div>
      </form>

      <section className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Join code</h2>
        <p className="text-sm text-muted">
          Students enter this at <code className="bg-surface-2 px-1 rounded">/join</code> to
          enroll themselves.
        </p>
        <div className="flex items-center gap-3">
          <code
            className="font-mono text-2xl tracking-widest bg-surface-2 px-4 py-2 rounded"
            aria-label="Current join code"
          >
            {joinCode || "—"}
          </code>
          <Button variant="secondary" onClick={regenerateCode} disabled={pending}>
            Regenerate
          </Button>
        </div>
        <p className="text-xs text-muted">
          Regenerating invalidates the previous code immediately.
        </p>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Archive</h2>
        <p className="text-sm text-muted">
          Archived classes are hidden from the main list but remain readable. Useful at the
          end of a semester.
        </p>
        <Button variant="secondary" onClick={toggleArchive} disabled={pending}>
          {archived ? "Unarchive class" : "Archive class"}
        </Button>
      </section>

      <section className="card p-4 border-danger/30 space-y-3">
        <h2 className="font-display text-lg">Delete</h2>
        <p className="text-sm text-muted">
          Soft delete. The class moves to <Link href="/trash" className="text-accent hover:underline">Trash</Link> and can be
          restored within 30 days.
        </p>
        <Button variant="danger" onClick={deleteClass} disabled={pending}>
          {confirmDelete ? "Click again to confirm" : "Delete class"}
        </Button>
      </section>
    </div>
  );
}
