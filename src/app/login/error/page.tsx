export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // We translate Auth.js error codes into messages a student can act on,
  // rather than showing "Configuration" or "Verification".
  const message =
    error === "Verification"
      ? "Your sign-in link has expired or already been used. Request a new one."
      : error === "AccessDenied"
        ? "Your account doesn't have access to this app. Ask your teacher to invite you."
        : "Something went wrong while signing in. Try again.";

  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-3xl mb-2">Sign-in problem</h1>
        <p className="text-muted text-sm">{message}</p>
        <p className="mt-6">
          <a href="/login" className="text-accent hover:underline text-sm">
            Back to sign in
          </a>
        </p>
      </div>
    </main>
  );
}
