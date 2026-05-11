import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Server-component / server-action helper. Throws a redirect to /login if
// the caller isn't authed. Optionally enforces a role.
//
// Use this at the TOP of every protected page and every server action.
// API routes have their own variant below.
export async function requireSession(opts?: {
  role?: "TEACHER" | "TA" | "STUDENT" | Array<"TEACHER" | "TA" | "STUDENT">;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (opts?.role) {
    const allowed = Array.isArray(opts.role) ? opts.role : [opts.role];
    if (!allowed.includes(session.user.role)) {
      // Don't redirect to login — they ARE logged in, just not authorized.
      // The page-level error boundary will show "Forbidden."
      throw new Error("FORBIDDEN");
    }
  }

  return session;
}

// API-route variant. Returns { session } on success, or a Response on failure.
// Pattern at call site:
//   const r = await requireSessionApi();
//   if (r instanceof Response) return r;
//   const { session } = r;
export async function requireSessionApi(opts?: {
  role?: "TEACHER" | "TA" | "STUDENT" | Array<"TEACHER" | "TA" | "STUDENT">;
}): Promise<{ session: NonNullable<Awaited<ReturnType<typeof auth>>> } | Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (opts?.role) {
    const allowed = Array.isArray(opts.role) ? opts.role : [opts.role];
    if (!allowed.includes(session.user.role)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }
  return { session };
}
