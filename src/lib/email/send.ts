// Thin wrapper around Resend's HTTP API. We use fetch directly rather than
// the SDK because the SDK pulls in ~80kb of validation we don't need and
// the API surface is two endpoints.

interface SendEmailArgs {
  to: string;
  subject: string;
  // We send both — plaintext for accessibility and spam-filter happiness,
  // HTML for readability.
  text: string;
  html: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // In dev without Resend configured, log to console rather than failing.
    // Teachers should see invite links in their terminal so they can copy
    // them manually during testing.
    console.log("\n[email:dev] would send to:", args.to);
    console.log("[email:dev] subject:", args.subject);
    console.log("[email:dev] text:\n" + args.text + "\n");
    return;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  });

  if (!resp.ok) {
    // Don't include the request body in the error — it has the recipient.
    const status = resp.status;
    throw new Error(`Resend send failed: ${status}`);
  }
}

// Helper: escape user-controlled values before splicing into HTML emails.
// We only ever splice names and class titles, but discipline > convenience.
export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
