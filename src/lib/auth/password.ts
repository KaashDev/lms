import argon2 from "argon2";

// argon2id is the OWASP-recommended variant. These parameters target
// roughly 100ms on a modern server CPU — fast enough not to UX-block,
// slow enough to deter offline attacks.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    // argon2.verify throws on malformed hashes. Treat as a non-match
    // rather than leaking that the stored value is corrupt.
    return false;
  }
}
