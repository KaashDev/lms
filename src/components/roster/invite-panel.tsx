"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";
import { parseRosterCsv } from "@/lib/csv/roster";

type InviteResultKind = "invited" | "already_enrolled" | "already_invited" | "error";

interface InviteResult {
  kind: InviteResultKind;
  email: string;
  message?: string;
}

export function InvitePanel({ classId }: { classId: string }) {
  const [mode, setMode] = useState<"single" | "csv">("single");
  return (
    <div className="card p-4">
      <h2 className="font-display text-lg mb-3">Invite students</h2>
      <div className="flex gap-2 text-sm mb-4" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "single"}
          onClick={() => setMode("single")}
          className={`px-3 py-1 rounded border ${mode === "single" ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          Single
        </button>
        <button
          role="tab"
          aria-selected={mode === "csv"}
          onClick={() => setMode("csv")}
          className={`px-3 py-1 rounded border ${mode === "csv" ? "border-accent text-accent" : "border-border text-muted"}`}
        >
          Bulk CSV
        </button>
      </div>
      {mode === "single" ? (
        <SingleInviteForm classId={classId} />
      ) : (
        <BulkInviteForm classId={classId} />
      )}
    </div>
  );
}

function SingleInviteForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"STUDENT" | "TA">("STUDENT");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name: name || null, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ kind: "error", email, message: "Couldn't send invite" });
        return;
      }
      setResult(data.result);
      if (data.result?.kind === "invited") {
        setEmail("");
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="invite-email" required>
            Email
          </Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "STUDENT" | "TA")}
          className="input"
        >
          <option value="STUDENT">Student</option>
          <option value="TA">Teaching Assistant</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send invite"}
      </Button>
      {result ? <ResultMessage result={result} /> : null}
    </form>
  );
}

function ResultMessage({ result }: { result: InviteResult }) {
  const styles: Record<InviteResultKind, string> = {
    invited: "border-success/40 bg-success/5 text-success",
    already_enrolled: "border-warning/40 bg-warning/5 text-warning",
    already_invited: "border-warning/40 bg-warning/5 text-warning",
    error: "border-danger/40 bg-danger/5 text-danger",
  };
  const labels: Record<InviteResultKind, string> = {
    invited: "Invite sent",
    already_enrolled: "Already enrolled",
    already_invited: "Invite already pending",
    error: result.message ?? "Error",
  };
  return (
    <div role="status" className={`rounded border text-sm px-3 py-2 ${styles[result.kind]}`}>
      {labels[result.kind]}: {result.email}
    </div>
  );
}

function BulkInviteForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<{
    rows: { email: string; name: string | null }[];
    errors: { row: number; message: string }[];
  } | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [summary, setSummary] = useState<{
    invited: number;
    alreadyEnrolled: number;
    alreadyInvited: number;
    errors: number;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setCsvText(text);
      const result = parseRosterCsv(text);
      setParsed(result);
      setResults(null);
      setSummary(null);
    });
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setCsvText(e.target.value);
    if (e.target.value.trim()) {
      setParsed(parseRosterCsv(e.target.value));
    } else {
      setParsed(null);
    }
    setResults(null);
    setSummary(null);
  }

  async function submit() {
    if (!parsed || parsed.rows.length === 0) return;
    startTransition(async () => {
      const res = await fetch(`/api/classes/${classId}/invite/bulk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invites: parsed.rows.map((r) => ({
            email: r.email,
            name: r.name,
            role: "STUDENT",
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setResults(data.results ?? []);
      setSummary(data.summary ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Paste CSV or upload a file. Expected columns:{" "}
        <code className="bg-surface-2 px-1 rounded">name, email</code>. Up to 200 students per
        import.
      </p>
      <div>
        <Label htmlFor="csv-file">CSV file</Label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="block text-sm file:mr-3 file:btn-secondary file:cursor-pointer cursor-pointer"
        />
      </div>
      <div>
        <Label htmlFor="csv-text">Or paste</Label>
        <textarea
          id="csv-text"
          value={csvText}
          onChange={handleTextChange}
          rows={6}
          className="input font-mono text-xs"
          placeholder={`name,email\nAlice Chen,alice@example.com\nBob Park,bob@example.com`}
        />
      </div>

      {parsed ? (
        <div className="space-y-2">
          <p className="text-sm">
            <strong>{parsed.rows.length}</strong> valid row
            {parsed.rows.length === 1 ? "" : "s"}
            {parsed.errors.length > 0 ? (
              <>
                , <strong className="text-danger">{parsed.errors.length}</strong> error
                {parsed.errors.length === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
          {parsed.errors.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Show errors</summary>
              <ul className="mt-2 text-xs text-danger space-y-0.5">
                {parsed.errors.map((e, i) => (
                  <li key={i}>
                    Line {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Button
            onClick={submit}
            disabled={pending || parsed.rows.length === 0}
          >
            {pending
              ? `Sending ${parsed.rows.length} invites...`
              : `Send ${parsed.rows.length} invite${parsed.rows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}

      {summary ? (
        <div className="card p-3 bg-surface-2">
          <h3 className="text-sm font-medium mb-1">Done</h3>
          <ul className="text-sm space-y-0.5">
            <li className="text-success">{summary.invited} invited</li>
            <li className="text-muted">{summary.alreadyEnrolled} already enrolled</li>
            <li className="text-muted">{summary.alreadyInvited} already invited</li>
            {summary.errors > 0 ? (
              <li className="text-danger">{summary.errors} errors</li>
            ) : null}
          </ul>
          {results && summary.errors > 0 ? (
            <details className="text-sm mt-2">
              <summary className="cursor-pointer text-muted">Show error details</summary>
              <ul className="mt-2 text-xs text-danger space-y-0.5">
                {results
                  .filter((r) => r.kind === "error")
                  .map((r, i) => (
                    <li key={i}>
                      {r.email}: {r.message}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
