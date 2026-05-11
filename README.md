# LMS — Self-hosted Canvas Replacement

Built incrementally. This bundle covers **steps 1, 2, 3a, and 3b-core**:

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
- **Step 3b-core**: Grading UI (score + general feedback editor), anchored
  highlight comments (select passage → comment), comment threads with
  resolve/unresolve, submission state actions (return/missing/excuse/reopen),
  posting policy (grades hidden until posted), per-student per-assignment
  overrides for due-date and close-date (IEP / 504 / makeup), attachment
  download via signed URLs, originality "writing signals" panel surfacing
  the stats from 3a. Plus three deferred fixes from 3a: `tokenVersion` for
  JWT revocation, walker-based empty-body detection, and pending invites
  revoked when their class is soft-deleted.

**Step 3c (next bundle)** will add: rubrics (define + attach + click-grade
+ auto-score), bulk actions (download all submissions as zip, mark missing
en masse, post all grades), and the Postgres-backed job worker.

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

## Manual test checklist for step 3b-core

The grading UI is the centerpiece; everything else hangs off it. Run as
teacher unless noted.

### Grading flow

- [ ] On an assignment with a SUBMITTED student, click "View submissions" → table lists all enrolled students, the submitter near the top with "needs grading"
- [ ] Filter "Needs grading" → only the submitters appear; "Missing / not started" → only the non-submitters; "Graded" → empty until you grade someone
- [ ] Click "Open" on a SUBMITTED row → lands on the grader page
- [ ] Enter a score, save → "Saved" indicator, submission row in the list now shows score with `(hidden)`
- [ ] As that student in another browser → assignment page still says "Submitted", no score visible
- [ ] Back as teacher → click "Save & post" → indicator flips to "Posted"
- [ ] As student → score is now visible on the assignment detail page AND on `/submit/preview` along with the rich-text feedback

### Anchored comments

- [ ] In the grader, select a passage of the submission body → an inline composer appears with the quoted passage shown
- [ ] Type a comment, click "Post comment" → comment appears in the right sidebar with the quote in italic above it, anchored comments sort to top
- [ ] Hover the comment in the sidebar (no highlight on the body yet — see known limitations)
- [ ] Click "Resolve" → comment dims and moves to the bottom; "Unresolve" reverses it
- [ ] Write a "General feedback" box comment without selecting anything → appears in the sidebar without a quote block
- [ ] Verify in DB: `select anchor_start, anchor_end, anchor_version_id from submission_comments order by created_at desc limit 1;` for an anchored comment — all three are populated, anchor_version_id matches the latest version row
- [ ] As student (after posting grade) → posted comments visible on `/submit/preview` with the quote; un-posted comments hidden

### Status actions

- [ ] Click "Return" on a graded submission → status flips to RETURNED, grade posts automatically, student can no longer edit
- [ ] Click "Reopen" → status flips to IN_PROGRESS, submittedAt cleared, postedAt cleared; as student you can edit and resubmit
- [ ] On a student who never submitted, click "Mark missing" → status MISSING; clicking it on an already-SUBMITTED row gives 409 INVALID_TRANSITION
- [ ] Click "Excuse" → status EXCUSED; gradebook math (step 5) will exclude this

### Per-student overrides

- [ ] Roster → click a student → "Assignments & overrides" table loads with all assignments
- [ ] Click "Add override" on a future assignment → datetime inputs appear → set a custom due date one week later → Save
- [ ] As that student → assignment detail page shows the OVERRIDE due date, not the assignment default
- [ ] As teacher, set the assignment's default `availableUntil` to 1 minute ago with REJECT policy. As that student → submit page still works because the override extends `availableUntil` (if you set it). Without the override, you'd see "Submissions closed."
- [ ] Click "Remove" on the override → confirm prompt → override row deleted; default dates resume

### Token version / force-logout

- [ ] Sign in as a student in Browser A. As teacher in Browser B: `curl -X POST -H "Cookie: <teacher-session-cookie>" /api/users/:studentUserId/force-logout` → 200
- [ ] In Browser A, navigate anywhere → session is gone, you're redirected to `/login`
- [ ] Reset your own password via `/login/reset` → after setting new password, any other browser session for that account is also kicked

### Revoked invite

- [ ] Send a single invite to `test@example.com`. Don't accept it.
- [ ] Soft-delete the class → audit log shows `invitesRevoked: 1`
- [ ] Open the invite email link → 410 GONE, "Invite revoked" page (or JSON if hit raw)

### Attachment downloads

- [ ] As teacher, open the grader for a submission with an attachment → click the filename → opens the file in a new tab (302 redirect to a signed R2 URL valid for 5 minutes)
- [ ] As a different student in the same class → `GET /api/attachments/:id/download` returns 404 (auth gate honors submission ownership)

## What's NOT here yet

- **Rubrics + bulk actions + job worker** — step 3c
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

1. **Email verification for join-code-path users.** Their `emailVerified` is
   null. The notification system in step 6 won't email them until we add a
   "verify your email" flow on first login. ~1 hour task.
2. **DOCX magic-byte check verifies the ZIP header only.** All Office files
   are zips, so a `.zip` renamed to `.docx` would pass when paired with the
   right MIME header. We'd need to parse the manifest to be sure. The
   MIME-type gate plus the extension check makes this a narrow edge case.
3. **Anchored comment highlights don't render in-line on the submission
   body.** The comment appears in the sidebar with the quoted passage, but
   the original passage in the body isn't visually highlighted. Doing this
   means walking the rendered DOM and wrapping text nodes between
   `anchorStart` and `anchorEnd` with a `<mark>` — possible but adds DOM
   complexity and risks breaking Tiptap's render. Deferred to step 3c.
4. **DOM Range → character offset walker (`src/lib/grading/range.ts`) is
   logic-only, no unit tests.** Needs jsdom or a browser-test runner to
   exercise. Verified by inspection but unproven against edge cases like
   selections that cross multiple block boundaries.
5. **`applyOverride` runs one extra query per assignment read.** For the
   single-teacher case (dozens of students) this is fine; if scale grows
   we'd batch overrides into the initial assignment query or cache per
   request.
6. **Dashboard "Upcoming this week" doesn't apply overrides.** A student
   with an extended due date will still see the assignment under its
   default due date in the dashboard, even though the submission flow
   correctly honors the override. Cosmetic for v1, fixable in step 5
   alongside gradebook math.

## Resolved (step 3b-core)

- `tokenVersion` column added to users; JWT carries `tv` claim; session
  callback rejects mismatches. Bumped on password reset; teacher can force
  logout via `POST /api/users/:userId/force-logout`.
- Empty-body detection replaced with `isTiptapDocEmpty` walker that counts
  non-whitespace text chars across the Tiptap tree.
- Class soft-delete now revokes pending invites (sets `revoked_at`); the
  accept endpoint returns clear errors (410 `INVITE_REVOKED`, 410
  `INVITE_EXPIRED`, 409 `INVITE_ALREADY_USED`) instead of silent 404s.

## Free-tier reality

- Railway ~$5/mo for app + Postgres
- Cloudflare R2 free up to 10 GB and free egress (essay PDFs/DOCXs land here in step 3a)
- Resend free 3000 emails/month — plenty for a single teacher
