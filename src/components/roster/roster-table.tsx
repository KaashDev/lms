"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Student {
  enrollmentId: string;
  userId: string;
  name: string | null;
  email: string;
  role: "STUDENT" | "TA";
  status: "ACTIVE" | "DEACTIVATED" | "REMOVED";
  lastActiveAt: string | null;
  enrolledAt: string;
  currentGrade: number | null;
  missingCount: number | null;
}

type SortKey = "name" | "email" | "lastActiveAt" | "currentGrade" | "missingCount";

export function RosterTable({
  students,
  classId,
}: {
  students: Student[];
  classId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");

  // We do filter + sort client-side because rosters are bounded (~150 max
  // per the spec). Above that we'd switch to server-side pagination.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = students;
    if (q) {
      list = list.filter(
        (s) =>
          (s.name?.toLowerCase().includes(q) ?? false) ||
          s.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, query]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      // Nulls always sort last regardless of direction. Surprising students
      // by hiding "never seen" at the top is worse than a small consistency
      // break.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function fmt(d: string | null) {
    if (!d) return "—";
    const date = new Date(d);
    const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="roster-search" className="sr-only">
          Search students
        </label>
        <input
          id="roster-search"
          type="search"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input max-w-sm"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Class roster</caption>
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <SortHeader k="name" current={sortKey} dir={sortDir} onClick={toggleSort}>
                Name
              </SortHeader>
              <SortHeader k="email" current={sortKey} dir={sortDir} onClick={toggleSort}>
                Email
              </SortHeader>
              <SortHeader k="lastActiveAt" current={sortKey} dir={sortDir} onClick={toggleSort}>
                Last active
              </SortHeader>
              <SortHeader k="currentGrade" current={sortKey} dir={sortDir} onClick={toggleSort}>
                Grade
              </SortHeader>
              <SortHeader k="missingCount" current={sortKey} dir={sortDir} onClick={toggleSort}>
                Missing
              </SortHeader>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  {students.length === 0
                    ? "No students enrolled yet. Invite some above."
                    : "No students match your search."}
                </td>
              </tr>
            ) : (
              sorted.map((s) => (
                <tr key={s.enrollmentId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/classes/${classId}/students/${s.userId}`}
                      className="text-fg hover:text-accent"
                    >
                      {s.name ?? <span className="italic text-muted">(no name)</span>}
                    </Link>
                    {s.status === "DEACTIVATED" ? (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                        Deactivated
                      </span>
                    ) : null}
                    {s.role === "TA" ? (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                        TA
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">{s.email}</td>
                  <td className="px-3 py-2 text-muted">{fmt(s.lastActiveAt)}</td>
                  <td className="px-3 py-2 text-muted">
                    {s.currentGrade != null ? `${s.currentGrade}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {s.missingCount != null ? s.missingCount : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/classes/${classId}/students/${s.userId}`}
                      className="text-xs text-accent hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        {sorted.length} of {students.length} students
      </p>
    </div>
  );
}

function SortHeader({
  k,
  current,
  dir,
  onClick,
  children,
}: {
  k: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = current === k;
  return (
    <th scope="col" className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onClick(k)}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className="flex items-center gap-1 hover:text-fg"
      >
        {children}
        {active ? <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
