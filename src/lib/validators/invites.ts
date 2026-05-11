import { z } from "zod";

// Standard email parsing. We lowercase + trim before storage everywhere.
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const inviteOneInput = z.object({
  email: emailField,
  // Optional display name — if the teacher has it from a roster sheet, we
  // pre-fill the user row on accept.
  name: z.string().trim().max(200).optional().nullable(),
  role: z.enum(["STUDENT", "TA"]).default("STUDENT"),
});

// Bulk invite: up to 200 emails per call to keep the request size sane.
// CSV parsing happens client-side (or in the API route via the csv lib);
// this just validates the parsed result.
export const inviteBulkInput = z.object({
  invites: z
    .array(inviteOneInput)
    .min(1, "Add at least one student")
    .max(200, "Import up to 200 students at a time"),
});

// Self-registration from a class join code.
export const joinByCodeInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(6, "Join codes are at least 6 characters")
    .max(12),
});

// Self-registration from an invite token (?token=...).
export const acceptInviteInput = z.object({
  token: z.string().min(16).max(128),
});

export const updateEnrollmentInput = z.object({
  status: z.enum(["ACTIVE", "DEACTIVATED", "REMOVED"]).optional(),
  teacherNotes: z.string().max(10_000).optional().nullable(),
});

// Account creation — password path. Used after invite accept if the student
// chooses to set a password rather than rely on magic links.
export const registerWithPasswordInput = z.object({
  email: emailField,
  name: z.string().trim().min(1).max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200, "Too long"),
  // The invite token they came in with. Required — there's no open signup.
  inviteToken: z.string().min(16).max(128).optional(),
  joinCode: z.string().trim().toUpperCase().min(6).max(12).optional(),
}).refine((d) => d.inviteToken || d.joinCode, {
  message: "Registration requires an invite token or a class join code",
  path: ["inviteToken"],
});
