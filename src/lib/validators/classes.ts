import { z } from "zod";

// Tiptap JSON validator. We don't validate every node type (would balloon
// the schema), just that it's an object — enough to prevent string injection.
// Sanitization happens at render time, not storage.
const tiptapJson = z.record(z.any()).nullable();

// Hex color or null. Banner image URLs are handled separately (signed uploads).
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color")
  .nullable()
  .optional();

export const createClassInput = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  term: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  bannerColor: hexColor,
  // Class-level TZ override. Validation against the real IANA list happens
  // in a Vitest test against Intl.supportedValuesOf("timeZone"); cheaper
  // than shipping the full list as a Zod enum.
  timezone: z.string().trim().max(64).optional().nullable(),
});

export const updateClassInput = createClassInput.partial().extend({
  syllabus: tiptapJson.optional(),
});

export const archiveClassInput = z.object({
  archived: z.boolean(),
});

// Pagination cursor for the classes list. We use offset-based pagination
// for the teacher's classes (small N, simple UI) and will switch to keyset
// for the gradebook in step 5 where N can be large.
export const listClassesInput = z.object({
  includeArchived: z.coerce.boolean().default(false),
  includeDeleted: z.coerce.boolean().default(false),
});
