"use client";

import { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function ResetConfirmPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "INVALID_OR_EXPIRED"
            ? "This reset link is invalid or has expired."
            : "Couldn't reset your password. Try again."
        );
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    });
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <p className="text-muted text-sm">Missing reset token. Check the link in your email.</p>
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-2 text-center">Choose a new password</h1>
        {done ? (
          <p className="text-success text-sm text-center mt-6">
            Password updated. Redirecting you to sign in...
          </p>
        ) : (
          <form onSubmit={submit} className="card p-6 space-y-3">
            <div>
              <Label htmlFor="pw" required>
                New password
              </Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted mt-1">At least 10 characters.</p>
            </div>
            <div>
              <Label htmlFor="confirm" required>
                Confirm password
              </Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error ? (
              <div role="alert" className="text-danger text-sm">
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving..." : "Set password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
