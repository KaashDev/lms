export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-3xl mb-2">Check your email</h1>
        <p className="text-muted text-sm">
          We sent a sign-in link{email ? <> to <strong className="text-fg">{email}</strong></> : null}.
          Click it to finish signing in. The link expires in 24 hours.
        </p>
        <p className="text-muted text-xs mt-6">
          Didn't get it? Check your spam folder, then{" "}
          <a href="/login" className="text-accent hover:underline">
            try again
          </a>
          .
        </p>
      </div>
    </main>
  );
}
