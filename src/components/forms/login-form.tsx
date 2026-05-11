"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui/primitives";

// We use the client-side signIn helper so we can show inline errors rather
// than redirect to Auth.js's default error page. The page is a server-rendered
// shell, but the form is interactive.
export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [mode, setMode] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleEmailMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("nodemailer", {
        email,
        redirect: false,
        callbackUrl,
      });
      if (res?.error) {
        setError("Couldn't send the sign-in link. Double-check the address.");
        return;
      }
      router.push(`/login/check-email?email=${encodeURIComponent(email)}`);
    });
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });
      if (res?.error || !res?.ok) {
        setError("Email or password is incorrect.");
        return;
      }
      router.push(callbackUrl);
    });
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => signIn("google", { callbackUrl })}
      >
        Continue with Google
      </Button>

      <div className="relative flex items-center" role="separator" aria-label="or">
        <div className="flex-grow h-px bg-border" />
        <span className="px-3 text-xs text-muted uppercase tracking-wider">or</span>
        <div className="flex-grow h-px bg-border" />
      </div>

      <div className="flex gap-2 text-sm" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "email"}
          onClick={() => setMode("email")}
          className={`flex-1 py-2 rounded border ${
            mode === "email" ? "border-accent text-accent" : "border-border text-muted"
          }`}
        >
          Email link
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          onClick={() => setMode("password")}
          className={`flex-1 py-2 rounded border ${
            mode === "password" ? "border-accent text-accent" : "border-border text-muted"
          }`}
        >
          Password
        </button>
      </div>

      {mode === "email" ? (
        <form onSubmit={handleEmailMagicLink} className="space-y-3">
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
            {pending ? "Sending..." : "Email me a sign-in link"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handlePassword} className="space-y-3">
          <div>
            <Label htmlFor="email-pw" required>
              Email
            </Label>
            <Input
              id="email-pw"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password" required>
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
          <div className="text-right">
            <a href="/login/reset" className="text-xs text-muted hover:text-accent">
              Forgot password?
            </a>
          </div>
        </form>
      )}

      {error ? (
        <div
          role="alert"
          className="rounded border border-danger/40 bg-danger/5 text-danger text-sm px-3 py-2"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
