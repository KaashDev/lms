import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl">Welcome back</h1>
          <p className="text-muted text-sm mt-1">Sign in to your classroom.</p>
        </header>
        <div className="card p-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Got a class join code?{" "}
          <a href="/register" className="text-accent hover:underline">
            Join a class
          </a>
        </p>
      </div>
    </main>
  );
}
