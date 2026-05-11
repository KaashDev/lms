"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { EssayEditor } from "@/components/editor/essay-editor";
import { ALLOWED_SUBMISSION_TYPES, MAX_SUBMISSION_BYTES } from "@/lib/storage/blob";

interface Submission {
  id: string;
  body: unknown | null;
  status: string;
  wordCount: number;
}

interface AssignmentMeta {
  allowTextEntry: boolean;
  allowFileUpload: boolean;
  dueAt: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  sizeBytes: number;
}

interface Props {
  classId: string;
  assignmentId: string;
  submission: Submission;
  assignment: AssignmentMeta;
  attachments: Attachment[];
}

export function SubmissionEditor({
  classId,
  assignmentId,
  submission,
  assignment,
  attachments: initialAttachments,
}: Props) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmitting] = useTransition();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The EssayEditor calls this on each save. We forward to the API.
  async function save(body: unknown, opts: { fromPaste: boolean; pasteCharCount?: number }) {
    const res = await fetch(
      `/api/assignments/${assignmentId}/submissions/${submission.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body,
          fromPaste: opts.fromPaste,
          pasteCharCount: opts.pasteCharCount ?? null,
        }),
      }
    );
    if (!res.ok) {
      // Let the editor's error state pick this up.
      throw new Error("save failed");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    // Client-side validation first so the user doesn't wait for a server
    // round-trip to find out their file is wrong.
    if (file.size > MAX_SUBMISSION_BYTES) {
      setUploadError(`File too large. Max ${MAX_SUBMISSION_BYTES / (1024 * 1024)} MB.`);
      e.target.value = "";
      return;
    }
    if (!(ALLOWED_SUBMISSION_TYPES as readonly string[]).includes(file.type)) {
      setUploadError("Only PDF or DOCX files are accepted.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("submissionId", submission.id);
      const res = await fetch(`/api/assignments/${assignmentId}/uploads`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.reason ?? "Upload failed. Try again.");
        return;
      }
      const data = await res.json();
      setAttachments((prev) => [
        ...prev,
        {
          id: data.attachment.id,
          filename: data.attachment.filename,
          sizeBytes: data.attachment.sizeBytes,
        },
      ]);
    } finally {
      setUploading(false);
      e.target.value = ""; // allow re-upload of same filename
    }
  }

  function finalize() {
    if (!confirmSubmit) {
      setConfirmSubmit(true);
      return;
    }
    setSubmitError(null);
    startSubmitting(async () => {
      const res = await fetch(
        `/api/assignments/${assignmentId}/submissions/${submission.id}/submit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acknowledge: true }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          data.error === "EMPTY_SUBMISSION"
            ? "Add text or upload a file before submitting."
            : data.error === "SUBMISSION_CLOSED"
              ? "This assignment is closed and no longer accepting submissions."
              : "Couldn't submit. Try again."
        );
        setConfirmSubmit(false);
        return;
      }
      router.push(`/classes/${classId}/assignments/${assignmentId}/submit/preview`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {assignment.allowTextEntry ? (
        <section>
          <h2 className="font-display text-lg mb-2">Write your essay</h2>
          <EssayEditor
            initialContent={submission.body}
            onSave={save}
            ariaLabel="Essay body"
          />
        </section>
      ) : null}

      {assignment.allowFileUpload ? (
        <section className="card p-4 space-y-3">
          <h2 className="font-display text-lg">Upload a file</h2>
          <p className="text-xs text-muted">
            PDF or DOCX only. Max {MAX_SUBMISSION_BYTES / (1024 * 1024)} MB per file.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFile}
            disabled={uploading}
            className="block text-sm"
          />
          {uploadError ? (
            <div role="alert" className="text-danger text-sm">
              {uploadError}
            </div>
          ) : null}
          {attachments.length > 0 ? (
            <ul className="text-sm divide-y divide-border border border-border rounded">
              {attachments.map((a) => (
                <li key={a.id} className="px-3 py-2 flex justify-between">
                  <span>{a.filename}</span>
                  <span className="text-muted text-xs">
                    {(a.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="card p-4 border-warning/30">
        <h2 className="font-display text-lg mb-2">Submit</h2>
        <p className="text-sm text-muted mb-3">
          Once submitted, you can't edit. Your teacher will see your final version.
        </p>
        {submitError ? (
          <div role="alert" className="text-danger text-sm mb-2">
            {submitError}
          </div>
        ) : null}
        <Button onClick={finalize} disabled={submitting}>
          {submitting
            ? "Submitting…"
            : confirmSubmit
              ? "Click to confirm submission"
              : "Submit for grading"}
        </Button>
      </section>
    </div>
  );
}
