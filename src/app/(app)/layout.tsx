import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/nav/sidebar";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Update lastActiveAt — useful for the roster column. Cheap enough to do
  // on every page render; if it becomes a hotspot we'll throttle to 5min
  // resolution.
  await db
    .update(users)
    .set({ lastActiveAt: new Date() })
    .where(eq(users.id, session.user.id))
    .catch(() => {}); // never block render

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar
        userName={session.user.name ?? session.user.email ?? "User"}
        userEmail={session.user.email ?? ""}
        role={session.user.role}
      />
      <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-10 max-w-6xl">
        {children}
      </main>
    </div>
  );
}
