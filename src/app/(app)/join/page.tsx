"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "INVALID_CODE") setError("That code doesn't match any class.");
        else if (data.error === "RATE_LIMITED") setError("Too many attempts. Try again in a minute.");
        else if (res.status === 401) router.push(`/login?callbackUrl=/join`);
        else setError("Couldn't join. Try again.");
        return;
      }
      const data = await res.json();
      router.push(`/classes/${data.classId}`);
    });
  }

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-6 text-center">Join a class</h1>
        <form onSubmit={submit} className="card p-6 space-y-3">
          <div>
            <Label htmlFor="code" required>
              Class code
            </Label>
            <Input
              id="code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7HF93XQ"
              maxLength={12}
              autoComplete="off"
              style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
            />
          </div>
          {error ? (
            <div role="alert" className="text-danger text-sm">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Joining..." : "Join class"}
          </Button>
        </form>
      </div>
    </main>
  );
}
