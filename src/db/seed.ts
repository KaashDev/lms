import "dotenv/config";
import { db } from "@/db";
import { organizations, users, notificationPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

// Run with: pnpm db:seed
// Idempotent — re-running won't duplicate the org or user.
async function main() {
  const orgName = process.env.SEED_ORG_NAME ?? "My Classroom";
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerName = process.env.SEED_OWNER_NAME ?? "Teacher";

  if (!ownerEmail) {
    console.error("SEED_OWNER_EMAIL is required for first-time seeding.");
    process.exit(1);
  }

  // One organization. If you ever add more teachers, they'll join this one
  // (or you bump the schema to a real multi-tenant signup flow).
  let org = await db.query.organizations.findFirst();
  if (!org) {
    const [created] = await db
      .insert(organizations)
      .values({ name: orgName })
      .returning();
    org = created;
    console.log(`✓ Created organization: ${org.name} (${org.id})`);
  } else {
    console.log(`• Organization already exists: ${org.name}`);
  }

  // Bootstrap teacher account. No password set — they sign in with magic link
  // the first time, then set a password from settings if they want one.
  const existing = await db.query.users.findFirst({
    where: eq(users.email, ownerEmail.toLowerCase()),
  });
  if (!existing) {
    const [u] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        email: ownerEmail.toLowerCase(),
        name: ownerName,
        role: "TEACHER",
      })
      .returning();
    await db.insert(notificationPreferences).values({ userId: u.id });
    console.log(`✓ Created teacher: ${u.email}`);
  } else {
    console.log(`• Teacher already exists: ${existing.email}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
