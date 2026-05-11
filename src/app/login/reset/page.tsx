"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show success — even if the email isn't on file. Prevents
      // enumeration. The server only actually emails if it matches.
      setDone(true);
    });
  }

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-2 text-center">Reset password</h1>
        {done ? (
          <p className="text-muted text-sm text-center">
            If that email is on file, we sent a reset link. It expires in 30 minutes.
          </p>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-3">
            <div>
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-xs">
          <a href="/login" className="text-accent hover:underline">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
