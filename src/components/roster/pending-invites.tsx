"use client";

import { useState } from "react";

interface Invite {
  id: string;
  email: string;
  role: "STUDENT" | "TA";
  expires: string;
  createdAt: string;
}

export function PendingInvitesList({
  classId,
  invites,
}: {
  classId: string;
  invites: Invite[];
}) {
  // We don't have the raw invite tokens here (only the teacher's email
  // recipient has the link) so "copy link" isn't possible without a resend.
  // We render a simple list with status. Resend / revoke = step 6 polish.
  return (
    <section className="card p-4">
      <h2 className="font-display text-lg mb-3">Pending invitations</h2>
      <ul className="divide-y divide-border">
        {invites.map((i) => {
          const daysLeft = Math.max(
            0,
            Math.ceil((new Date(i.expires).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          );
          return (
            <li key={i.id} className="py-2 flex items-center justify-between text-sm">
              <span className="text-fg">
                {i.email}
                {i.role === "TA" ? (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                    TA
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted">
                Expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
