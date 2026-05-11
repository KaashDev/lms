import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  hashToken,
  generateJoinCode,
  inviteExpiry,
  INVITE_TTL_DAYS,
} from "@/lib/invites/tokens";

describe("invite tokens", () => {
  it("generates a raw token + matching hash", () => {
    const { raw, hash } = generateInviteToken();
    expect(raw.length).toBeGreaterThan(40); // 32 bytes base64url ≈ 43 chars
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(hashToken(raw)).toBe(hash);
  });

  it("hashing is deterministic", () => {
    expect(hashToken("hello")).toBe(hashToken("hello"));
    expect(hashToken("hello")).not.toBe(hashToken("world"));
  });

  it("raw tokens are unique across many generations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(generateInviteToken().raw);
    }
    expect(set.size).toBe(1000);
  });

  it("raw token only contains URL-safe characters", () => {
    for (let i = 0; i < 50; i++) {
      const { raw } = generateInviteToken();
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("join codes", () => {
  it("uses 8 chars from an unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(8);
      // Forbidden chars: 0, O, 1, I, L
      expect(code).not.toMatch(/[0OIL1]/);
    }
  });

  it("produces different codes", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) set.add(generateJoinCode());
    // Statistically essentially impossible to collide at this rate
    expect(set.size).toBe(100);
  });
});

describe("inviteExpiry", () => {
  it("returns a date in the future, configured days out", () => {
    const exp = inviteExpiry();
    const diffMs = exp.getTime() - Date.now();
    const days = diffMs / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(INVITE_TTL_DAYS - 0.01);
    expect(days).toBeLessThan(INVITE_TTL_DAYS + 0.01);
  });
});
