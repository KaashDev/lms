import { test, expect } from "@playwright/test";

// Smoke test for the step-2 happy path. Assumes:
//   - the dev server is running at PLAYWRIGHT_BASE_URL (default localhost:3000)
//   - the seed teacher account exists with SEED_OWNER_EMAIL
//   - that teacher has a password set (via the password reset flow, or
//     a manual hash insert during test setup)
//
// In CI you'd swap the password login for a programmatic JWT signer that
// drops a session cookie directly, but for a single smoke test we go the
// long way to actually exercise the real flow.
//
// Submission-flow assertions for assignments land in step 3.
test("teacher creates a class, invites a student, sees the roster", async ({ page }) => {
  const teacherEmail = process.env.TEST_TEACHER_EMAIL;
  const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
  if (!teacherEmail || !teacherPassword) {
    test.skip(
      true,
      "Set TEST_TEACHER_EMAIL and TEST_TEACHER_PASSWORD env vars to run the smoke test"
    );
    return;
  }

  await page.goto("/login");
  // Switch to the password tab.
  await page.getByRole("tab", { name: /password/i }).click();
  await page.getByLabel(/^email/i).fill(teacherEmail);
  await page.getByLabel(/^password/i).fill(teacherPassword);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);

  // Create a class.
  await page.getByRole("link", { name: /classes/i }).first().click();
  await page.getByRole("button", { name: /new class/i }).click();

  const title = `Smoke Test ${Date.now()}`;
  await page.getByLabel(/^title/i).fill(title);
  await page.getByRole("button", { name: /create class/i }).click();

  // Lands on class detail.
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Go to roster, send a single invite.
  await page.getByRole("link", { name: /roster/i }).click();
  await page.getByLabel(/email/i).first().fill(`smoke-${Date.now()}@example.com`);
  await page.getByRole("button", { name: /send invite/i }).click();
  await expect(page.getByText(/invite sent/i)).toBeVisible({ timeout: 10_000 });

  // Pending invitations section should now show the email.
  await expect(page.getByText(/pending invitations/i)).toBeVisible();
});
