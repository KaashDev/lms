"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";
import { RichEditor } from "@/components/editor/rich-editor";

type AssignmentType = "ESSAY" | "QUIZ";

interface Initial {
  id?: string;
  type: AssignmentType;
  title: string;
  instructions: unknown | null;
  pointsPossible: number;
  availableFrom: string | null;
  availableUntil: string | null;
  dueAt: string | null;
  lateAcceptPolicy: "ACCEPT" | "REJECT";
  allowFileUpload: boolean;
  allowTextEntry: boolean;
  autoPostGrades: boolean;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

interface Props {
  classId: string;
  mode: "create" | "edit";
  initial?: Initial;
}

// Tiny helper: convert a Date to a value for <input type="datetime-local">.
// datetime-local doesn't include timezone; we treat it as the user's local
// time and convert to UTC ISO on submit. Display layer (in other pages)
// reverses with toLocaleString().
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Subtract TZ offset so toISOString gives us "wall clock" YYYY-MM-DDTHH:mm.
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function fromLocal(v: string): string | null {
  if (!v) return null;
  // The browser hands us "YYYY-MM-DDTHH:mm" interpreted as local time.
  return new Date(v).toISOString();
}

export function AssignmentForm({ classId, mode, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<AssignmentType>(initial?.type ?? "ESSAY");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructions, setInstructions] = useState<unknown | null>(initial?.instructions ?? null);
  const [points, setPoints] = useState(initial?.pointsPossible ?? 100);
  const [availableFrom, setAvailableFrom] = useState(toLocal(initial?.availableFrom ?? null));
  const [availableUntil, setAvailableUntil] = useState(toLocal(initial?.availableUntil ?? null));
  const [dueAt, setDueAt] = useState(toLocal(initial?.dueAt ?? null));
  const [latePolicy, setLatePolicy] = useState<"ACCEPT" | "REJECT">(
    initial?.lateAcceptPolicy ?? "ACCEPT"
  );
  const [allowFileUpload, setAllowFileUpload] = useState(initial?.allowFileUpload ?? true);
  const [allowTextEntry, setAllowTextEntry] = useState(initial?.allowTextEntry ?? true);
  const [autoPost, setAutoPost] = useState(initial?.autoPostGrades ?? false);

  async function submit(action: "save_draft" | "publish") {
    setError(null);
    if (!allowFileUpload && !allowTextEntry) {
      setError("Allow text entry, file upload, or both.");
      return;
    }
    startTransition(async () => {
      const payload = {
        type,
        title: title.trim(),
        instructions,
        pointsPossible: Number(points) || 0,
        availableFrom: fromLocal(availableFrom),
        availableUntil: fromLocal(availableUntil),
        dueAt: fromLocal(dueAt),
        lateAcceptPolicy: latePolicy,
        allowFileUpload,
        allowTextEntry,
        autoPostGrades: autoPost,
        state: action === "publish" ? "PUBLISHED" : "DRAFT",
      };

      const url =
        mode === "create"
          ? `/api/classes/${classId}/assignments`
          : `/api/classes/${classId}/assignments/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.issues
            ? "Some fields are invalid. Check the form."
            : "Couldn't save. Try again."
        );
        return;
      }
      const data = await res.json();
      router.push(`/classes/${classId}/assignments/${data.assignment.id}`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-6">
      {/* Type selector — disabled in edit mode because changing type has
          no migration path. */}
      <div className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Type</h2>
        <div className="flex gap-2 text-sm" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={type === "ESSAY"}
            disabled={mode === "edit"}
            onClick={() => setType("ESSAY")}
            className={`px-3 py-1 rounded border ${
              type === "ESSAY" ? "border-accent text-accent" : "border-border text-muted"
            } disabled:opacity-60`}
          >
            Essay
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={type === "QUIZ"}
            disabled
            title="Quiz builder arrives in step 4"
            className="px-3 py-1 rounded border border-border text-muted opacity-60 cursor-not-allowed"
          >
            Quiz (step 4)
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Details</h2>
        <div>
          <Label htmlFor="title" required>
            Title
          </Label>
          <Input
            id="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="instructions">Instructions</Label>
          <RichEditor
            initialContent={instructions}
            onChange={setInstructions}
            ariaLabel="Assignment instructions"
            placeholder="Explain the assignment, expectations, rubric reminders…"
          />
        </div>
        <div>
          <Label htmlFor="points">Points possible</Label>
          <Input
            id="points"
            type="number"
            min={0}
            max={10000}
            step={0.5}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className="max-w-[10rem]"
          />
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Schedule</h2>
        <p className="text-xs text-muted">
          Times use your local timezone. Stored in UTC internally.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="from">Available from</Label>
            <input
              id="from"
              type="datetime-local"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <Label htmlFor="due">Due</Label>
            <input
              id="due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <Label htmlFor="until">Closes</Label>
            <input
              id="until"
              type="datetime-local"
              value={availableUntil}
              onChange={(e) => setAvailableUntil(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="late">Late policy</Label>
          <select
            id="late"
            value={latePolicy}
            onChange={(e) => setLatePolicy(e.target.value as "ACCEPT" | "REJECT")}
            className="input max-w-sm"
          >
            <option value="ACCEPT">Accept late submissions (marked LATE)</option>
            <option value="REJECT">Reject after close (hard cutoff)</option>
          </select>
        </div>
      </div>

      {type === "ESSAY" ? (
        <div className="card p-4 space-y-3">
          <h2 className="font-display text-lg">Submission options</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowTextEntry}
              onChange={(e) => setAllowTextEntry(e.target.checked)}
            />
            Allow text entry (rich editor in the browser)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowFileUpload}
              onChange={(e) => setAllowFileUpload(e.target.checked)}
            />
            Allow file upload (PDF or DOCX only)
          </label>
        </div>
      ) : null}

      <div className="card p-4 space-y-3">
        <h2 className="font-display text-lg">Grading</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoPost}
            onChange={(e) => setAutoPost(e.target.checked)}
          />
          Auto-post grades (students see scores immediately when graded)
        </label>
        <p className="text-xs text-muted">
          Off by default — grades stay hidden until you click "Post grades" for the whole
          class.
        </p>
      </div>

      {error ? (
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      ) : null}

      <div className="flex gap-3 flex-wrap">
        <Button
          type="button"
          onClick={() => submit("publish")}
          disabled={pending || !title.trim()}
        >
          {pending ? "Saving…" : "Publish"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => submit("save_draft")}
          disabled={pending || !title.trim()}
        >
          {pending ? "Saving…" : "Save as draft"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
