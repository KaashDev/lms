"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

interface AssignmentRow {
  id: string;
  title: string;
  state: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  pointsPossible: number;
  dueAt: string | null;
  availableUntil: string | null;
  submission:
    | {
        id: string;
        status: string;
        score: number | null;
        postedAt: string | null;
      }
    | null;
  override:
    | {
        dueAt: string | null;
        availableUntil: string | null;
        timeLimitSeconds: number | null;
        allowedAttempts: number | null;
      }
    | null;
}

interface Props {
  classId: string;
  userId: string;
  assignments: AssignmentRow[];
}

// Date input value helper (same as in assignment-form). Treats the
// datetime-local value as local time, stored as UTC ISO.
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function fromLocal(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function StudentAssignmentsList({ classId, userId, assignments }: Props) {
  const router = useRouter();
  const [openOverride, setOpenOverride] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Local copies of override form values, keyed by assignmentId.
  const [overrideDraft, setOverrideDraft] = useState<
    Record<string, { dueAt: string; availableUntil: string }>
  >({});

  function startOverride(a: AssignmentRow) {
    setOverrideDraft((prev) => ({
      ...prev,
      [a.id]: {
        dueAt: toLocal(a.override?.dueAt ?? null),
        availableUntil: toLocal(a.override?.availableUntil ?? null),
      },
    }));
    setOverrideError(null);
    setOpenOverride(a.id);
  }

  async function saveOverride(assignmentId: string) {
    setSavingOverride(true);
    setOverrideError(null);
    try {
      const draft = overrideDraft[assignmentId] ?? { dueAt: "", availableUntil: "" };
      const res = await fetch(
        `/api/assignments/${assignmentId}/overrides/${userId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dueAt: fromLocal(draft.dueAt),
            availableUntil: fromLocal(draft.availableUntil),
            timeLimitSeconds: null,
            allowedAttempts: null,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOverrideError(data.message ?? "Couldn't save override.");
        return;
      }
      setOpenOverride(null);
      router.refresh();
    } finally {
      setSavingOverride(false);
    }
  }

  async function clearOverride(assignmentId: string) {
    if (!confirm("Remove this override and use the assignment's default dates?")) return;
    setSavingOverride(true);
    try {
      const res = await fetch(
        `/api/assignments/${assignmentId}/overrides/${userId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dueAt: null,
            availableUntil: null,
            timeLimitSeconds: null,
            allowedAttempts: null,
          }),
        }
      );
      if (res.ok) {
        setOpenOverride(null);
        router.refresh();
      }
    } finally {
      setSavingOverride(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg">Assignments & overrides</h2>
        <p className="text-xs text-muted mt-1">
          Set a custom due date for this student on any assignment (IEP, makeup, etc.).
        </p>
      </div>

      {assignments.length === 0 ? (
        <p className="text-muted text-sm p-4">No assignments in this class yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Assignment</th>
              <th className="px-3 py-2 font-medium">Default due</th>
              <th className="px-3 py-2 font-medium">Override</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assignments.map((a) => {
              const isOpen = openOverride === a.id;
              return (
                <>
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/classes/${classId}/assignments/${a.id}`}
                        className="hover:text-accent"
                      >
                        {a.title}
                      </Link>
                      {a.state !== "PUBLISHED" ? (
                        <span className="text-xs text-muted ml-1">({a.state.toLowerCase()})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted text-xs">
                      {a.dueAt ? new Date(a.dueAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {a.override?.dueAt ? (
                        <span className="text-accent">
                          {new Date(a.override.dueAt).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {a.submission?.status ?? "NOT_STARTED"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {a.submission?.score != null
                        ? `${a.submission.score}/${a.pointsPossible}${a.submission.postedAt ? "" : " (hidden)"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-accent hover:underline text-xs"
                        onClick={() =>
                          isOpen ? setOpenOverride(null) : startOverride(a)
                        }
                      >
                        {isOpen ? "Close" : a.override ? "Edit override" : "Add override"}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${a.id}-form`} className="bg-surface-2">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="flex flex-wrap gap-3 items-end">
                          <div>
                            <label className="block text-xs text-muted mb-1">
                              Override due date
                            </label>
                            <input
                              type="datetime-local"
                              value={overrideDraft[a.id]?.dueAt ?? ""}
                              onChange={(e) =>
                                setOverrideDraft((p) => ({
                                  ...p,
                                  [a.id]: { ...p[a.id], dueAt: e.target.value },
                                }))
                              }
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-muted mb-1">
                              Override close date
                            </label>
                            <input
                              type="datetime-local"
                              value={overrideDraft[a.id]?.availableUntil ?? ""}
                              onChange={(e) =>
                                setOverrideDraft((p) => ({
                                  ...p,
                                  [a.id]: { ...p[a.id], availableUntil: e.target.value },
                                }))
                              }
                              className="input"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveOverride(a.id)}
                            disabled={savingOverride}
                          >
                            {savingOverride ? "Saving…" : "Save"}
                          </Button>
                          {a.override ? (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => clearOverride(a.id)}
                              disabled={savingOverride}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                        {overrideError ? (
                          <div role="alert" className="text-danger text-xs mt-2">
                            {overrideError}
                          </div>
                        ) : null}
                        <p className="text-xs text-muted mt-2">
                          Leave a field blank to use the assignment default. Override only
                          affects this student.
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
