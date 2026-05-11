import { describe, it, expect } from "vitest";
import { parseRosterCsv } from "@/lib/csv/roster";

describe("parseRosterCsv", () => {
  it("parses a basic name,email CSV with header", () => {
    const csv = `name,email\nAlice,alice@example.com\nBob,bob@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
  });

  it("handles a UTF-8 BOM", () => {
    const csv = "\ufeffname,email\nAlice,alice@example.com";
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Alice");
  });

  it("handles columns in reversed order", () => {
    const csv = `email,name\nalice@example.com,Alice`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0]).toEqual({ email: "alice@example.com", name: "Alice" });
  });

  it("infers email-only when no header and one column", () => {
    const csv = `alice@example.com\nbob@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toEqual([
      { email: "alice@example.com", name: null },
      { email: "bob@example.com", name: null },
    ]);
  });

  it("infers name,email order when no header and two columns", () => {
    const csv = `Alice,alice@example.com\nBob,bob@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0]).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  it("lowercases emails", () => {
    const csv = `email\nALICE@Example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0].email).toBe("alice@example.com");
  });

  it("flags rows with invalid emails", () => {
    const csv = `email\nnot-an-email\nalice@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid email");
  });

  it("flags rows missing an email", () => {
    const csv = `name,email\nAlice,\nBob,bob@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Missing email");
  });

  it("handles CRLF line endings", () => {
    const csv = `name,email\r\nAlice,alice@example.com\r\nBob,bob@example.com\r\n`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = `name,email\n"Doe, Alice",alice@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0].name).toBe("Doe, Alice");
  });

  it("handles escaped quotes inside a quoted field", () => {
    const csv = `name,email\n"Alice ""Ace"" Cooper",alice@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0].name).toBe('Alice "Ace" Cooper');
  });

  it("deduplicates by email keeping the first occurrence", () => {
    const csv = `name,email\nAlice,alice@example.com\nAlly,alice@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Alice");
  });

  it("returns a clear error for empty input", () => {
    const result = parseRosterCsv("");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("trims whitespace from cells", () => {
    const csv = `name,email\n  Alice  ,  alice@example.com  `;
    const result = parseRosterCsv(csv);
    expect(result.rows[0]).toEqual({ name: "Alice", email: "alice@example.com" });
  });

  it("returns null name when name column is empty", () => {
    const csv = `name,email\n,alice@example.com`;
    const result = parseRosterCsv(csv);
    expect(result.rows[0].name).toBeNull();
  });
});
