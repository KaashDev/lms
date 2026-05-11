"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Input, Label } from "@/components/ui/primitives";

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteToken = params.get("token");
  const initialJoinCode = params.get("code") ?? "";

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          password,
          inviteToken: inviteToken ?? undefined,
          joinCode: !inviteToken && joinCode ? joinCode : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "EMAIL_TAKEN") {
          setError("An account with this email already exists. Try signing in instead.");
        } else if (data.error === "INVITE_INVALID") {
          setError("Your invite link is invalid or has expired. Ask your teacher to resend it.");
        } else if (data.error === "EMAIL_MISMATCH") {
          setError("This email doesn't match the one your teacher invited.");
        } else if (data.error === "INVALID_CODE") {
          setError("That join code doesn't match any class.");
        } else {
          setError("Couldn't create your account. Double-check the fields.");
        }
        return;
      }

      // Sign in immediately with the new password.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) {
        // If they registered via join code (not invite), the enrollment still
        // needs to be made — call /api/join now that we're authed.
        if (!inviteToken && joinCode) {
          await fetch("/api/join", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: joinCode }),
          });
        }
        router.push("/dashboard");
      } else {
        setError("Account created. Please sign in.");
      }
    });
  }

  const hasInvite = !!inviteToken;

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-2 text-center">Create your account</h1>
        <p className="text-muted text-sm text-center mb-6">
          {hasInvite
            ? "Your teacher invited you. Set a password to finish."
            : "Enter your join code from your teacher."}
        </p>

        <form onSubmit={submit} className="card p-6 space-y-3">
          <div>
            <Label htmlFor="name" required>
              Your name
            </Label>
            <Input
              id="name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // If they came in via invite, the email is fixed.
              readOnly={hasInvite && !!params.get("email")}
            />
          </div>
          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted mt-1">At least 10 characters.</p>
          </div>

          {!hasInvite ? (
            <div>
              <Label htmlFor="code" required>
                Class join code
              </Label>
              <Input
                id="code"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7HF93XQ"
                maxLength={12}
                style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
              />
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="text-danger text-sm">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs">
          Already have an account?{" "}
          <a href="/login" className="text-accent hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
