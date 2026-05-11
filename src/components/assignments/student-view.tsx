"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { RichRenderer } from "@/components/editor/rich-renderer";

interface Props {
  classId: string;
  assignment: {
    id: string;
    title: string;
    instructions: unknown | null;
    pointsPossible: number;
    dueAt: string | null;
    availableUntil: string | null;
    lateAcceptPolicy: "ACCEPT" | "REJECT";
    allowFileUpload: boolean;
    allowTextEntry: boolean;
  };
}

type Status =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "LATE"
  | "MISSING"
  | "EXCUSED"
  | "RETURNED";

export function StudentAssignmentView({ classId, assignment }: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("NOT_STARTED");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [postedAt, setPostedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/assignments/${assignment.id}/submissions`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!data.submission) {
        setStatus("NOT_STARTED");
        setSubmissionId(null);
      } else {
        setStatus(data.submission.status);
        setSubmissionId(data.submission.id);
        setScore(data.submission.score);
        setPostedAt(data.submission.postedAt);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assignment.id]);

  const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
  const closeDate = assignment.availableUntil ? new Date(assignment.availableUntil) : null;
  const now = new Date();
  const isClosed =
    assignment.lateAcceptPolicy === "REJECT" && closeDate && closeDate < now;

  const statusLabel: Record<Status, string> = {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "Draft saved",
    SUBMITTED: "Submitted",
    LATE: "Submitted (late)",
    MISSING: "Missing",
    EXCUSED: "Excused",
    RETURNED: "Returned",
  };

  const canEdit =
    !isClosed && (status === "NOT_STARTED" || status === "IN_PROGRESS");

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap gap-3 items-center text-sm">
        {dueDate ? (
          <span className="text-muted">Due {dueDate.toLocaleString()}</span>
        ) : null}
        <span className="text-muted">· {assignment.pointsPossible} pts</span>
        <span
          className={`px-2 py-0.5 rounded ${
            status === "SUBMITTED" || status === "RETURNED"
              ? "bg-success/10 text-success"
              : status === "LATE"
                ? "bg-warning/10 text-warning"
                : status === "MISSING"
                  ? "bg-danger/10 text-danger"
                  : "bg-surface-2 text-muted"
          }`}
        >
          {statusLabel[status]}
        </span>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-lg mb-3">Instructions</h2>
        {assignment.instructions ? (
          <RichRenderer content={assignment.instructions} />
        ) : (
          <p className="text-muted text-sm italic">No instructions provided.</p>
        )}
      </section>

      <section className="flex flex-wrap gap-3">
        {loading ? (
          <span className="text-muted text-sm">Loading…</span>
        ) : isClosed && status === "NOT_STARTED" ? (
          <p className="text-danger text-sm">
            This assignment is closed and no longer accepting submissions.
          </p>
        ) : canEdit ? (
          <Link
            href={`/classes/${classId}/assignments/${assignment.id}/submit`}
            className="btn-primary"
          >
            {status === "NOT_STARTED" ? "Start submission" : "Continue draft"}
          </Link>
        ) : status === "SUBMITTED" || status === "LATE" || status === "RETURNED" ? (
          <Link
            href={`/classes/${classId}/assignments/${assignment.id}/submit/preview`}
            className="btn-secondary"
          >
            View submission
          </Link>
        ) : null}
      </section>

      {(status === "RETURNED" || postedAt) && score != null ? (
        <section className="card p-4">
          <h2 className="font-display text-lg">Score</h2>
          <p className="text-2xl mt-1">
            <strong>{score}</strong>{" "}
            <span className="text-muted text-base">/ {assignment.pointsPossible}</span>
          </p>
        </section>
      ) : null}
    </div>
  );
}
