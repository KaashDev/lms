# LMS — Self-hosted Canvas Replacement

Built incrementally. This bundle covers **steps 1, 2, and 3a**:

- **Step 1**: Drizzle schema for all features, Auth.js with three providers,
  Postgres rate limiting, role-checked session helpers, Railway deploy config.
- **Step 2**: Classes CRUD, roster management, single + bulk-CSV invites,
  student self-registration via invite link or join code, password reset
  flow, the authed app shell, dashboard, trash with 30-day restore.
- **Step 3a**: Essay assignment lifecycle — create / edit / duplicate /
  copy-to-class / publish / unpublish / soft-delete. Student submission
  with Tiptap rich text editor, PDF/DOCX file upload to S3-compatible
  storage (Cloudflare R2), 30-second autosave, manual save, paste detection
  on >100-char paste events, full version history, submission lifecycle
  (NOT_STARTED → IN_PROGRESS → SUBMITTED/LATE), originality stats helpers.

**Step 3b (next bundle)** will add: grading UI, anchored highlight comments,
rubrics, per-student overrides, bulk submission download, posting policy.

## Setup

```bash
# 1. Install
pnpm install

# 2. Env
cp .env.example .env
#   At minimum:
#   - AUTH_SECRET   (openssl rand -base64 32)
#   - AUTH_URL      (http://localhost:3000 for dev)
#   - SEED_OWNER_EMAIL (your email — becomes the teacher account)
#   Optional but recommended:
#   - RESEND_API_KEY + EMAIL_FROM (without them, email logs to console)
#   - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET

# 3. Database (local)
docker compose up -d
pnpm db:push    # apply schema
pnpm db:seed    # creates your org + teacher account

# 4. Run
pnpm dev
```

Visit `http://localhost:3000`. Click "Email me a sign-in link" with the email
in `SEED_OWNER_EMAIL`. If you didn't set up Resend, check your terminal — the
magic link prints to stdout in dev.

## Manual test checklist for step 2

Run these in order. Each should pass before moving on.

### Auth

- [ ] `/login` renders, switches between magic-link and password tabs
- [ ] Magic link with the seed email → check-email page; link in terminal works; lands on `/dashboard`
- [ ] `/login/reset` → submit your email → reset email logs to terminal → link works → password set → redirected to `/login` → can sign in with the new password
- [ ] Wrong password shows "Email or password is incorrect" (no enumeration of whether the email exists)
- [ ] Five failed password attempts from the same IP within a minute get rate-limited
- [ ] Google OAuth button works (if configured)

### Classes

- [ ] `/dashboard` shows "Create a class" when empty
- [ ] `/classes` → "New class" → fill title → creates → redirects to class detail
- [ ] Class detail shows student count (0), banner color, join code
- [ ] `/classes/[id]/settings` lets you edit title/term/description/banner, save persists
- [ ] Regenerating join code produces a different 8-char code with no `0/O/1/I/L`
- [ ] Archive → class disappears from default list, shows in `/classes?archived=1`
- [ ] Unarchive from settings restores it
- [ ] Delete (two-click confirmation) sends class to `/trash`
- [ ] `/trash` shows days-left, restore button brings the class back to `/classes`

### Invites

- [ ] In roster: single invite → an entry appears under "Pending invitations"
- [ ] Email logs to terminal (or to inbox if Resend configured) with a link
- [ ] Open the link in an incognito window → `/register` pre-filled with the invite email
- [ ] Create the student account (password ≥ 10 chars) → auto-signs in → lands on the class
- [ ] Roster now shows the student under "Enrolled"; pending invite is gone

### Bulk CSV import

- [ ] Roster → Bulk CSV tab → paste:
      ```
      name,email
      Alice Chen,alice@example.com
      Bob Park,bob@example.com
      not-valid-line,broken
      ```
- [ ] Preview shows "2 valid rows, 1 error" with "Invalid email: broken" in expanded errors
- [ ] Send invites → summary shows "2 invited"
- [ ] Re-running the same CSV shows "2 already invited" instead of duplicates
- [ ] `.csv` file upload works equivalently
- [ ] CSV with UTF-8 BOM and CRLF endings parses cleanly (covered by unit tests)

### Join code path

- [ ] Incognito → `/register` → fill name/email/password/joinCode → enrolled
- [ ] Sign in as that student → see the class on `/dashboard`
- [ ] `/join` with the same code while signed in → idempotent, "already enrolled"
- [ ] Regenerating the code in settings invalidates the old one immediately

### Roster

- [ ] Sort ascending/descending by clicking column headers
- [ ] Search filters by name + email
- [ ] Click a student → profile page with private notes textarea
- [ ] Save notes → reload → persist
- [ ] Change status to Deactivated → "Deactivated" badge appears
- [ ] Remove student (two-click confirm) → disappears from roster
- [ ] Re-invite the removed student → reactivated, not duplicated

### Authorization

- [ ] Hit `/api/classes/<some-other-teacher-id>` with curl using your session cookie → 404
- [ ] Sign out, hit `/api/classes` directly → 401
- [ ] Sign in as a student → `/classes/[id]/settings` → 404 (no leak of existence)
- [ ] Student can see classes they're enrolled in but cannot reach roster or settings

### Mobile

- [ ] On a phone (or browser at 380px wide): sidebar collapses, hamburger toggles, focus rings visible

### Tests

```bash
pnpm test                    # 15 CSV + 7 token + 13 originality cases
pnpm test:e2e                # set TEST_TEACHER_EMAIL + TEST_TEACHER_PASSWORD first
```

## Manual test checklist for step 3a

These exercise the new assignment + submission flow. R2 is required for the
upload tests (set `S3_*` in your `.env`); the rest work without it.

### Assignment CRUD (as teacher)

- [ ] `/classes/:id/assignments` shows "New assignment" button, no items yet
- [ ] Create a draft: title only, save as draft → lands on assignment detail with `DRAFT` badge
- [ ] Edit the assignment → set instructions (try bold/italic/heading), points, dueAt → save
- [ ] Publish from the detail page → badge flips to `PUBLISHED`
- [ ] Duplicate from the detail page → new assignment in `DRAFT`, time fields cleared, title `"(copy)"` appended
- [ ] Copy-to-class via API: `curl -X POST /api/classes/:id/assignments/:aid/copy-to -d '{"targetClassId":"..."}'` → assignment appears in the target class as `DRAFT`
- [ ] Soft-delete the assignment → gone from list → `PUT /api/classes/:id/assignments/:aid` restores it
- [ ] Try to delete twice (already in trash) → idempotent: succeeds

### Student-facing visibility

- [ ] Sign in as a student → assignment list shows only `PUBLISHED` items
- [ ] Set `availableFrom` to one hour in the future → assignment hidden from student
- [ ] Set `availableFrom` to one hour in the past → visible again

### Submission flow (as student)

- [ ] Click "Start submission" → lands on `/submit` with an empty editor
- [ ] Type some text, wait 30s → "Saved" indicator
- [ ] Press Cmd/Ctrl+S → immediate save
- [ ] Paste >100 chars from another document → immediate save with `fromPaste=true` (verify with `select * from submission_versions order by created_at desc limit 1;`)
- [ ] Reload the page → text persists, status is `IN_PROGRESS`
- [ ] Upload a PDF → appears in attachment list with size
- [ ] Try to upload a `.txt` file → client-side rejection ("Only PDF or DOCX")
- [ ] Try to upload a `.exe` renamed to `.pdf` → server-side rejection (magic-byte check) with "File contents don't match"
- [ ] Try to upload a 30MB file → rejection: "File too large"
- [ ] Click "Submit for grading" once → button changes to "Click to confirm submission"
- [ ] Click again → redirects to `/submit/preview`, status is `SUBMITTED` (or `LATE` if past `dueAt`)
- [ ] Try to navigate back to `/submit` → message: "Already submitted"
- [ ] Try to PATCH the submission via the API after submitting → 409 `SUBMISSION_LOCKED`

### Late + closed behavior

- [ ] Create assignment with `dueAt` 1 minute in the past, late policy = ACCEPT → student submits → status = `LATE`
- [ ] Create assignment with `availableUntil` 1 minute in the past, late policy = REJECT → student visits `/submit` → "Submissions closed" page (no editor)
- [ ] Same closed assignment, hit `/api/.../submissions/start` directly → 404 (student access blocked)

### Version history (verify in DB)

- [ ] After ~3 minutes of typing, `select count(*) from submission_versions where submission_id=:sid;` → roughly equals minutes spent (one per 30s, plus paste events)
- [ ] After a single paste, `select from_paste, paste_char_count from submission_versions order by created_at desc limit 1;` → `from_paste=true`, char count matches what was pasted

### Dashboard

- [ ] As student with a future assignment due in 3 days → "Upcoming this week" lists it
- [ ] As teacher after a student submits → "Needs grading" shows the class with `N submissions to grade`

## What's NOT here yet

- **Grading UI, anchored comments, rubrics, overrides, bulk download** — step 3b
- **Quizzes + QTI** — step 4
- **Gradebook math** — step 5
- **Announcements, messaging, notifications beyond invites** — step 6
- **Calendar, accessibility audit polish** — step 7
- **`.imscc` Canvas import** — step 8
- **Export-everything zip + full audit log UI** — step 9

The schema for all of these is already in place from step 1.

## Architecture notes

**Tailwind v3, not v4.** v4's CSS-first config is nice but the docs are still
catching up. You asked for boring + well-documented; v3 wins.

**No shadcn CLI.** Button, Input, Label, modal are small enough to own. We
can add radix back when we need Combobox/Popover.

**Auth provider is Nodemailer-with-custom-sender rather than Resend.**
Auth.js v5's Resend provider import path has churned across betas; calling
our own `sendEmail` from the Nodemailer provider works consistently and
keeps a single email codepath.

**`teacherNotes` on the enrollment row, not a separate table.** Per our
conversation. If we later need audited history of notes we can add a
`note_versions` table; the column stays where it is.

**Removed students get `status=REMOVED` AND `deletedAt` set.** The two flags
overlap. The distinction lets us hide them from default queries while
keeping them recoverable. Belt + braces.

## Known gaps still to address

1. **`tokenVersion` for JWT invalidation.** Not strictly needed yet, but
   adding it before step 3b (the grading interface is when device-loss
   scenarios actually matter) is easier now than later.
2. **Email verification for join-code-path users.** Their `emailVerified` is
   null. The notification system in step 6 won't email them until we add a
   "verify your email" flow on first login. ~1 hour task.
3. **Revoke pending invites when a class is deleted.** Currently cascade-deletes
   the invite rows but the email links 404 silently. Cheap fix, do it with step 3b.
4. **Empty-body detection on submit is heuristic.** We measure `JSON.stringify(body).length > 50` — works because Tiptap's empty doc serializes to ~30 chars, but a single typed space + Enter could create a doc that scrapes past. Real fix: walk the doc and count text nodes. Not urgent.
5. **DOCX magic-byte check verifies the ZIP header only.** All Office files are zips, so a `.zip` renamed to `.docx` would pass when paired with the right MIME header. We'd need to parse the manifest to be sure. The MIME-type gate plus the extension check makes this a narrow edge case.

## Free-tier reality

- Railway ~$5/mo for app + Postgres
- Cloudflare R2 free up to 10 GB and free egress (essay PDFs/DOCXs land here in step 3a)
- Resend free 3000 emails/month — plenty for a single teacher
