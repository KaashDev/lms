"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { RichRenderer } from "@/components/editor/rich-renderer";

interface Props {
  classId: string;
  assignment: {
    id: string;
    title: string;
    state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    instructions: unknown | null;
    pointsPossible: number;
    dueAt: string | null;
    availableFrom: string | null;
    availableUntil: string | null;
    lateAcceptPolicy: "ACCEPT" | "REJECT";
    autoPostGrades: boolean;
    allowFileUpload: boolean;
    allowTextEntry: boolean;
  };
}

export function TeacherAssignmentView({ classId, assignment }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePublish() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: assignment.state === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
        }),
      });
      if (!res.ok) {
        setError("Couldn't change the state.");
        return;
      }
      router.refresh();
    });
  }

  function duplicate() {
    startTransition(async () => {
      const res = await fetch(
        `/api/classes/${classId}/assignments/${assignment.id}/duplicate`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
      );
      if (!res.ok) {
        setError("Duplicate failed.");
        return;
      }
      const data = await res.json();
      router.push(`/classes/${classId}/assignments/${data.assignment.id}/edit`);
    });
  }

  function softDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/assignments/${assignment.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Delete failed.");
        return;
      }
      router.push(`/classes/${classId}/assignments`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-2 py-0.5 rounded ${
              assignment.state === "PUBLISHED"
                ? "bg-success/10 text-success"
                : "bg-surface-2 text-muted"
            }`}
          >
            {assignment.state}
          </span>
          {assignment.dueAt ? (
            <span className="text-muted">
              Due {new Date(assignment.dueAt).toLocaleString()}
            </span>
          ) : null}
          <span className="text-muted">· {assignment.pointsPossible} pts</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/classes/${classId}/assignments/${assignment.id}/edit`}
            className="btn-secondary"
          >
            Edit
          </Link>
          <Button variant="secondary" onClick={togglePublish} disabled={pending}>
            {assignment.state === "PUBLISHED" ? "Unpublish" : "Publish"}
          </Button>
          <Button variant="secondary" onClick={duplicate} disabled={pending}>
            Duplicate
          </Button>
          <Button variant="danger" onClick={softDelete} disabled={pending}>
            {confirmDelete ? "Click to confirm" : "Delete"}
          </Button>
        </div>
      </section>

      {error ? (
        <div role="alert" className="text-danger text-sm">
          {error}
        </div>
      ) : null}

      <section className="card p-6">
        <h2 className="font-display text-lg mb-3">Instructions</h2>
        {assignment.instructions ? (
          <RichRenderer content={assignment.instructions} />
        ) : (
          <p className="text-muted text-sm italic">No instructions yet.</p>
        )}
      </section>

      <section className="card p-4 space-y-2 text-sm">
        <h2 className="font-display text-lg">Settings summary</h2>
        <ul className="text-muted space-y-1">
          <li>Late policy: {assignment.lateAcceptPolicy === "ACCEPT" ? "Accept (marked LATE)" : "Reject after close"}</li>
          <li>Submission modes: {[
            assignment.allowTextEntry && "text entry",
            assignment.allowFileUpload && "file upload",
          ].filter(Boolean).join(", ")}</li>
          <li>Auto-post grades: {assignment.autoPostGrades ? "Yes" : "No (manual)"}</li>
          {assignment.availableFrom ? (
            <li>Opens: {new Date(assignment.availableFrom).toLocaleString()}</li>
          ) : null}
          {assignment.availableUntil ? (
            <li>Closes: {new Date(assignment.availableUntil).toLocaleString()}</li>
          ) : null}
        </ul>
      </section>

      <section className="card p-6 text-muted text-sm text-center">
        Submissions list + grading interface lands in <strong>step 3b</strong>.
      </section>
    </div>
  );
}
