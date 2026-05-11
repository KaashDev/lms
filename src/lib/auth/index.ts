import NextAuth, { type DefaultSession } from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";

// Augment the session type so `session.user.role` and `.organizationId`
// are strongly typed at every call site.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "TEACHER" | "TA" | "STUDENT";
      organizationId: string;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // We use JWT sessions because Credentials provider doesn't work with
  // database sessions in Auth.js v5 without a workaround. JWT is fine for
  // a single-region app and lets all three providers share one session model.
  session: { strategy: "jwt" },

  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Auto-link Google logins to existing accounts by verified email.
      // Safe because Google verifies the email before sending it to us.
      allowDangerousEmailAccountLinking: true,
    }),

    // Custom email provider. Auth.js's built-in Resend provider has shifted
    // imports between v5 betas; calling sendEmail ourselves keeps things
    // working regardless. The "server" field is required by the Nodemailer
    // provider's type but unused since we override sendVerificationRequest.
    Nodemailer({
      server: "",
      from: process.env.EMAIL_FROM ?? "noreply@example.com",
      async sendVerificationRequest({ identifier, url }) {
        await sendEmail({
          to: identifier,
          subject: "Your sign-in link",
          text: `Sign in to your account:\n\n${url}\n\nIf you didn't request this, ignore the email.`,
          html: `<!doctype html><html><body style="font-family: system-ui, sans-serif; padding: 24px;">
            <h1 style="font-size: 20px;">Sign in</h1>
            <p>Click the link below to sign in. It expires in 24 hours.</p>
            <p><a href="${url}" style="background:#0f766e;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Sign in</a></p>
            <p style="color:#64646a;font-size:14px;">Or paste this link into your browser:<br>${url}</p>
            <p style="color:#64646a;font-size:14px;">If you didn't request this, you can safely ignore the email.</p>
          </body></html>`,
        });
      },
    }),

    Credentials({
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        // Rate-limit by IP — 5 attempts per 60s. Cheap and stops the
        // dumbest credential-stuffing attempts.
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const ok = await checkRateLimit(`login:${ip}`, 5, 60);
        if (!ok) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        // Constant-time-ish: always do a verify call, even on no-user, so we
        // don't leak account existence via response timing.
        const hash = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAA$AAAA";
        const valid = await verifyPassword(hash, password);

        if (!user || !valid) return null;
        if (user.deletedAt || user.deactivatedAt) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  callbacks: {
    // On signin (any provider), enrich the JWT with role + org so we don't
    // hit the DB on every authed page render.
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, user.id as string),
          columns: { id: true, role: true, organizationId: true, tokenVersion: true },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          // `tv` claim is checked on every session resolve. If a teacher
          // bumps a user's tokenVersion (password change, force-logout,
          // suspected compromise), all live JWTs for that user become
          // invalid on the next page request without us touching session
          // storage. JWT-strategy auth can't be revoked otherwise.
          token.tv = dbUser.tokenVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!token || !session.user) return session;

      // Token-version revocation check. We pay one DB read per resolve;
      // for our scale (one teacher, dozens of students) this is fine.
      // If this ever shows up in a profile we can cache for ~30s with a
      // signed in-memory cache keyed by token.uid.
      if (typeof token.uid === "string") {
        const current = await db.query.users.findFirst({
          where: eq(users.id, token.uid),
          columns: { tokenVersion: true, deactivatedAt: true, deletedAt: true },
        });
        // Missing, deactivated, or deleted users get an empty session.
        // Returning the session unmodified would let `auth()` succeed
        // and then `requireSessionApi` would happily authorize. Force
        // a logout by clearing the user fields — downstream guards
        // treat that as unauthenticated.
        if (!current || current.deactivatedAt || current.deletedAt) {
          return { ...session, user: undefined as any };
        }
        if (current.tokenVersion !== token.tv) {
          return { ...session, user: undefined as any };
        }
      }

      session.user.id = token.uid as string;
      session.user.role = token.role as "TEACHER" | "TA" | "STUDENT";
      session.user.organizationId = token.organizationId as string;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login/error",
  },

  // Never log full request bodies or tokens.
  logger: {
    error(error) {
      console.error("[auth]", error.name, error.message);
    },
    warn(code) {
      console.warn("[auth]", code);
    },
    debug() {
      // intentionally silent in prod
    },
  },
});
