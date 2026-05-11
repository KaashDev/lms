"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { RichRenderer } from "@/components/editor/rich-renderer";
import { RichEditor } from "@/components/editor/rich-editor";
import { selectionToOffsets } from "@/lib/grading/range";

interface Student {
  id: string;
  name: string | null;
  email: string;
}

interface AssignmentMeta {
  id: string;
  pointsPossible: number;
  autoPostGrades: boolean;
}

interface SubmissionMeta {
  id: string;
  status: string;
  body: unknown | null;
  score: number | null;
  feedback: unknown | null;
  submittedAt: string | null;
  gradedAt: string | null;
  postedAt: string | null;
}

interface Attachment {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
}

interface Comment {
  id: string;
  parentId: string | null;
  authorId: string;
  body: string;
  anchorVersionId: string | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
}

interface StaticStats {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  vocabularyDiversity: number;
  sentenceLengthStdDev: number;
}

interface VersionSignals {
  totalVersions: number;
  totalTimeMinutes: number;
  largestPasteChars: number;
  pasteCount: number;
  effectiveWpm: number;
  largestJumpFraction: number;
}

interface Props {
  classId: string;
  student: Student;
  assignment: AssignmentMeta;
  submission: SubmissionMeta;
  attachments: Attachment[];
  comments: Comment[];
  latestVersionId: string | null;
  stats: { static: StaticStats; versions: VersionSignals; versionCount: number };
}

export function Grader({
  classId,
  student,
  assignment,
  submission,
  attachments,
  comments: initialComments,
  latestVersionId,
  stats,
}: Props) {
  const router = useRouter();

  // ---------------- Grade form ----------------
  const [scoreInput, setScoreInput] = useState<string>(
    submission.score != null ? String(submission.score) : ""
  );
  const [feedback, setFeedback] = useState<unknown | null>(submission.feedback);
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeSaved, setGradeSaved] = useState(false);

  // ---------------- Comments ----------------
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [pendingAnchor, setPendingAnchor] = useState<{
    start: number;
    end: number;
    quote: string;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [generalCommentDraft, setGeneralCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);

  // Re-sync if server data refreshes.
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  // ---------------- Status actions ----------------
  const [actionPending, startAction] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  async function saveGrade(opts: { post?: boolean } = {}) {
    setGradeError(null);
    setSavingGrade(true);
    setGradeSaved(false);
    try {
      const score =
        scoreInput === "" ? null : Number(scoreInput);
      if (score != null && (Number.isNaN(score) || score < 0)) {
        setGradeError("Score must be a non-negative number.");
        setSavingGrade(false);
        return;
      }
      const res = await fetch(`/api/submissions/${submission.id}/grade`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          score,
          feedback,
          ...(opts.post !== undefined ? { post: opts.post } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGradeError(data.message ?? "Couldn't save grade.");
        return;
      }
      setGradeSaved(true);
      setTimeout(() => setGradeSaved(false), 1500);
      router.refresh();
    } finally {
      setSavingGrade(false);
    }
  }

  function doAction(action: "RETURN" | "MISSING" | "EXCUSE" | "REOPEN") {
    setActionError(null);
    startAction(async () => {
      const res = await fetch(`/api/submissions/${submission.id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.message ?? "Action failed.");
        return;
      }
      router.refresh();
    });
  }

  // Track text selection inside the body. If non-empty, show the
  // "Comment on this passage" affordance with the anchor coordinates.
  function captureSelection() {
    if (!bodyRef.current) return;
    const range = selectionToOffsets(bodyRef.current);
    if (range) {
      setPendingAnchor(range);
    }
  }

  async function postAnchoredComment() {
    if (!pendingAnchor || !commentDraft.trim()) return;
    if (!latestVersionId) {
      setCommentError("No version snapshot exists yet — student hasn't typed anything.");
      return;
    }
    setPostingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: commentDraft.trim(),
          anchorVersionId: latestVersionId,
          anchorStart: pendingAnchor.start,
          anchorEnd: pendingAnchor.end,
          anchorQuote: pendingAnchor.quote,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCommentError(data.message ?? "Couldn't post comment.");
        return;
      }
      const data = await res.json();
      setComments((prev) => [
        ...prev,
        {
          ...data.comment,
          author: { id: "me", name: "You", email: "" },
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        },
      ]);
      setPendingAnchor(null);
      setCommentDraft("");
      // Clear DOM selection so it doesn't look like the highlight is still active.
      window.getSelection()?.removeAllRanges();
    } finally {
      setPostingComment(false);
    }
  }

  async function postGeneralComment() {
    if (!generalCommentDraft.trim()) return;
    setPostingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: generalCommentDraft.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCommentError(data.message ?? "Couldn't post comment.");
        return;
      }
      const data = await res.json();
      setComments((prev) => [
        ...prev,
        {
          ...data.comment,
          author: { id: "me", name: "You", email: "" },
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        },
      ]);
      setGeneralCommentDraft("");
    } finally {
      setPostingComment(false);
    }
  }

  async function toggleResolved(commentId: string, currentResolved: boolean) {
    // Optimistic.
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, resolvedAt: currentResolved ? null : new Date().toISOString() }
          : c
      )
    );
    const res = await fetch(
      `/api/submissions/${submission.id}/comments/${commentId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: !currentResolved }),
      }
    );
    if (!res.ok) {
      // Revert.
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, resolvedAt: currentResolved ? new Date().toISOString() : null }
            : c
        )
      );
    }
  }

  // Sort comments: unresolved anchored first by anchorStart, then unresolved
  // general by createdAt, then resolved last.
  const sortedComments = [...comments].sort((a, b) => {
    const ar = a.resolvedAt ? 1 : 0;
    const br = b.resolvedAt ? 1 : 0;
    if (ar !== br) return ar - br;
    if (a.anchorStart != null && b.anchorStart != null) {
      return a.anchorStart - b.anchorStart;
    }
    if (a.anchorStart != null) return -1;
    if (b.anchorStart != null) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      {/* ----------- Left: submission body + comments ----------- */}
      <div className="space-y-4">
        <section className="card p-4">
          <header className="flex items-center justify-between mb-2">
            <h2 className="font-display text-lg">Submission</h2>
            <div className="text-xs text-muted">
              {submission.submittedAt
                ? `Submitted ${new Date(submission.submittedAt).toLocaleString()}`
                : submission.status === "MISSING"
                  ? "Marked missing"
                  : "Not submitted"}
            </div>
          </header>
          {submission.body ? (
            <div
              ref={bodyRef}
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              className="prose-content max-w-none px-1"
            >
              <RichRenderer content={submission.body} />
            </div>
          ) : attachments.length === 0 ? (
            <p className="text-muted text-sm italic">No content submitted.</p>
          ) : (
            <p className="text-muted text-sm italic">No text body. See attached file(s) below.</p>
          )}

          {pendingAnchor ? (
            <div className="mt-3 p-3 border border-accent/40 rounded bg-accent/5">
              <p className="text-xs text-muted mb-2">
                Commenting on:{" "}
                <span className="italic">"{pendingAnchor.quote.slice(0, 100)}{pendingAnchor.quote.length > 100 ? "…" : ""}"</span>
              </p>
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={3}
                className="input w-full resize-y"
                placeholder="Your comment…"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingAnchor(null);
                    setCommentDraft("");
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={postAnchoredComment}
                  disabled={!commentDraft.trim() || postingComment}
                >
                  {postingComment ? "Posting…" : "Post comment"}
                </Button>
              </div>
            </div>
          ) : (
            submission.body ? (
              <p className="text-xs text-muted mt-3">
                Select any passage in the submission to add an inline comment.
              </p>
            ) : null
          )}
        </section>

        {attachments.length > 0 ? (
          <section className="card p-4">
            <h2 className="font-display text-lg mb-2">Attached files</h2>
            <ul className="divide-y divide-border">
              {attachments.map((a) => (
                <li key={a.id} className="py-2 flex justify-between items-center text-sm">
                  <a
                    href={`/api/attachments/${a.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {a.filename}
                  </a>
                  <span className="text-muted text-xs">
                    {(a.sizeBytes / 1024).toFixed(0)} KB · {a.contentType.split("/").pop()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---- Originality panel ---- */}
        <details className="card p-4">
          <summary className="cursor-pointer font-display text-lg select-none">
            Writing signals
            <span className="text-xs text-muted font-sans ml-2">
              (notice these, don't conclude from them)
            </span>
          </summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <Stat label="Words" value={stats.static.wordCount.toString()} />
            <Stat label="Sentences" value={stats.static.sentenceCount.toString()} />
            <Stat
              label="Avg sentence length"
              value={`${stats.static.avgSentenceLength.toFixed(1)} words`}
            />
            <Stat
              label="Sentence length variance (stddev)"
              value={stats.static.sentenceLengthStdDev.toFixed(1)}
              note={
                stats.static.sentenceLengthStdDev < 3
                  ? "Low — unusually uniform"
                  : undefined
              }
            />
            <Stat
              label="Vocabulary diversity"
              value={stats.static.vocabularyDiversity.toFixed(2)}
              note="Type-token ratio (unique/total words)"
            />
            <Stat
              label="Versions saved"
              value={stats.versionCount.toString()}
            />
            <Stat
              label="Effective writing time"
              value={`${stats.versions.totalTimeMinutes.toFixed(0)} min`}
              note="Gaps over 5 minutes excluded"
            />
            <Stat
              label="Effective WPM"
              value={stats.versions.effectiveWpm.toFixed(0)}
            />
            <Stat
              label="Paste events"
              value={`${stats.versions.pasteCount}${stats.versions.largestPasteChars ? ` (largest ${stats.versions.largestPasteChars} chars)` : ""}`}
              note={
                stats.versions.largestPasteChars > 500
                  ? "Significant paste detected"
                  : undefined
              }
            />
            <Stat
              label="Largest single-version jump"
              value={`${(stats.versions.largestJumpFraction * 100).toFixed(0)}%`}
              note={
                stats.versions.largestJumpFraction > 0.5
                  ? "Most of the doc arrived at once"
                  : undefined
              }
            />
          </div>
          <p className="text-xs text-muted mt-3">
            These are signals, not verdicts. A student with strong outline habits or who
            drafts elsewhere may legitimately show "low variance" or "large paste"
            patterns. Use these as a reason to ask, not as evidence.
          </p>
        </details>
      </div>

      {/* ----------- Right: grading panel + comments ----------- */}
      <aside className="space-y-4">
        <section className="card p-4">
          <h2 className="font-display text-lg mb-3">Grade</h2>

          {/* Status indicators */}
          <div className="text-xs space-y-1 mb-3">
            <div>
              Status: <span className="text-fg">{submission.status}</span>
            </div>
            {submission.gradedAt ? (
              <div className="text-muted">
                Graded {new Date(submission.gradedAt).toLocaleString()}
              </div>
            ) : null}
            <div>
              Visible to student:{" "}
              {submission.postedAt ? (
                <span className="text-success">Posted</span>
              ) : (
                <span className="text-warning">Hidden</span>
              )}
            </div>
          </div>

          <label className="block text-sm mb-1">
            Score (out of {assignment.pointsPossible})
          </label>
          <input
            type="number"
            min={0}
            max={10000}
            step={0.5}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            className="input w-full"
            placeholder="—"
          />

          <label className="block text-sm mt-3 mb-1">General feedback</label>
          <RichEditor
            initialContent={feedback}
            onChange={setFeedback}
            ariaLabel="General feedback"
            placeholder="Overall comments on this submission…"
          />

          {gradeError ? (
            <div role="alert" className="text-danger text-xs mt-2">
              {gradeError}
            </div>
          ) : null}
          {gradeSaved ? (
            <div className="text-success text-xs mt-2" aria-live="polite">
              Saved
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 mt-3">
            <Button onClick={() => saveGrade()} disabled={savingGrade} size="sm">
              {savingGrade ? "Saving…" : "Save"}
            </Button>
            {submission.postedAt ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => saveGrade({ post: false })}
                disabled={savingGrade}
              >
                Hide from student
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => saveGrade({ post: true })}
                disabled={savingGrade}
              >
                Save & post
              </Button>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="font-display text-lg mb-2">Status</h2>
          {actionError ? (
            <div role="alert" className="text-danger text-xs mb-2">
              {actionError}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => doAction("RETURN")}
              disabled={actionPending}
            >
              Return
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => doAction("REOPEN")}
              disabled={actionPending}
            >
              Reopen
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => doAction("MISSING")}
              disabled={actionPending}
            >
              Mark missing
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => doAction("EXCUSE")}
              disabled={actionPending}
            >
              Excuse
            </Button>
          </div>
          <p className="text-xs text-muted mt-2">
            Return posts the grade and locks editing. Reopen unlocks for the student.
          </p>
        </section>

        <section className="card p-4">
          <h2 className="font-display text-lg mb-2">Comments</h2>

          {/* General-comment input */}
          <textarea
            value={generalCommentDraft}
            onChange={(e) => setGeneralCommentDraft(e.target.value)}
            rows={2}
            className="input w-full resize-y text-sm"
            placeholder="Comment on the whole submission…"
          />
          <div className="flex justify-end mt-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={postGeneralComment}
              disabled={!generalCommentDraft.trim() || postingComment}
            >
              Post
            </Button>
          </div>
          {commentError ? (
            <div role="alert" className="text-danger text-xs mt-1">
              {commentError}
            </div>
          ) : null}

          {sortedComments.length === 0 ? (
            <p className="text-muted text-xs mt-3 italic">No comments yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sortedComments.map((c) => (
                <li
                  key={c.id}
                  className={`p-2 rounded border text-sm ${
                    c.resolvedAt
                      ? "border-border bg-surface-2 opacity-60"
                      : c.anchorStart != null
                        ? "border-accent/30 bg-accent/5"
                        : "border-border bg-surface-2"
                  }`}
                  onMouseEnter={() => setHoveredCommentId(c.id)}
                  onMouseLeave={() => setHoveredCommentId(null)}
                >
                  {c.anchorQuote ? (
                    <div className="text-xs text-muted italic mb-1 border-l-2 border-accent/40 pl-2">
                      "{c.anchorQuote.slice(0, 100)}{c.anchorQuote.length > 100 ? "…" : ""}"
                    </div>
                  ) : null}
                  <div className="whitespace-pre-wrap">{c.body}</div>
                  <div className="flex justify-between items-center mt-1 text-xs text-muted">
                    <span>
                      {c.author.name ?? c.author.email}
                      {" · "}
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleResolved(c.id, !!c.resolvedAt)}
                      className="text-xs hover:text-fg"
                    >
                      {c.resolvedAt ? "Unresolve" : "Resolve"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-fg">{value}</div>
      {note ? <div className="text-xs text-warning mt-0.5">{note}</div> : null}
    </div>
  );
}
