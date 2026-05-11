import { randomBytes, createHash, randomInt } from "node:crypto";

// Invite token strategy:
//   - Generate 32 bytes of crypto randomness, base64url-encode → ~43 chars.
//   - Send the raw value in the email link.
//   - Store SHA-256(raw) in the DB. If the DB leaks, the raw tokens are
//     not recoverable. We can still look up by hash on accept.
//
// We use SHA-256 (not argon2) because:
//   1) Tokens are 256 bits of entropy — they're not bruteforce-able.
//   2) Accept-flow happens per-click; we don't want 100ms hash overhead
//      on every page hit when the link is shared in a chat.
//
// Argon2 is for human-chosen passwords. SHA-256 is for high-entropy tokens.

const TOKEN_BYTES = 32;

export function generateInviteToken(): { raw: string; hash: string } {
  const buf = randomBytes(TOKEN_BYTES);
  const raw = buf.toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Join codes are different: 8 characters from an unambiguous alphabet
// (no 0/O/1/I/L). Short enough to type on a chalkboard, long enough to
// resist guessing if you're not authed (~ 32^8 = 1 trillion combinations).
// Brute-forcing would also trip the rate limiter.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_LENGTH = 8;

export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return out;
}

// Default invite lifetime: 14 days. Long enough for a teacher to send the
// invite Sunday and have a student accept it after class on Friday. Short
// enough that abandoned links eventually expire.
export const INVITE_TTL_DAYS = 14;

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
