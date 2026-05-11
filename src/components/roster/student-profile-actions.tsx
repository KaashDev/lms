"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "@/components/ui/primitives";

type Status = "ACTIVE" | "DEACTIVATED" | "REMOVED";

export function StudentProfileActions({
  classId,
  userId,
  initialNotes,
  initialStatus,
}: {
  classId: string;
  userId: string;
  initialNotes: string;
  initialStatus: Status;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save() {
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/students/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teacherNotes: notes, status }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  async function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/students/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push(`/classes/${classId}/roster`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="font-display text-lg mb-2">Private notes</h2>
        <p className="text-xs text-muted mb-2">
          Only you can see this. Useful for accommodations, parent contact, IEP info.
        </p>
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          rows={5}
          value={notes}
          maxLength={10000}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
        />
        <div className="mt-2 flex items-center gap-3">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="input max-w-xs"
          >
            <option value="ACTIVE">Active</option>
            <option value="DEACTIVATED">Deactivated (can't submit)</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          {saved ? <span className="text-success text-sm">Saved</span> : null}
        </div>
      </section>

      <section className="card p-4 border-danger/30">
        <h2 className="font-display text-lg mb-1">Remove from class</h2>
        <p className="text-xs text-muted mb-3">
          Soft-removes the student. Their submissions stay intact. You can re-invite later.
        </p>
        <Button variant="danger" onClick={remove} disabled={pending}>
          {confirmRemove ? "Click again to confirm" : "Remove student"}
        </Button>
      </section>
    </div>
  );
}
