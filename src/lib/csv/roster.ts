// Minimal RFC 4180-ish CSV parser. We don't pull in papaparse (~50kb) for
// what's a couple-hundred-line one-shot import. Handles:
//   - UTF-8 BOM
//   - CRLF and LF
//   - Quoted fields with embedded commas/quotes (escaped as "")
//   - Trailing newline
//
// Does NOT handle:
//   - Multi-byte delimiters
//   - Streaming for huge files (we cap at 200 rows anyway)

export interface ParsedRosterRow {
  name: string | null;
  email: string;
}

export interface CsvParseResult {
  rows: ParsedRosterRow[];
  errors: Array<{ row: number; message: string }>;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote: "" inside a quoted field becomes "
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"' && cur.length === 0) {
        // Quote at start of field opens quoted mode. Quotes mid-field are
        // treated as literal — non-conformant but matches what Excel emits
        // when someone types a stray " in a name.
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Parse a CSV string into roster rows.
 *
 * Expected header (case-insensitive, in any order): `name`, `email`.
 * If only one column is present, it's assumed to be email.
 *
 * Returns rows AND errors — partial success is fine, the teacher decides
 * what to do with broken lines in the UI.
 */
export function parseRosterCsv(input: string): CsvParseResult {
  const errors: CsvParseResult["errors"] = [];
  const rows: ParsedRosterRow[] = [];

  const text = stripBom(input).replace(/\r\n/g, "\n").trim();
  if (!text) return { rows, errors: [{ row: 0, message: "Empty file" }] };

  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { rows, errors: [{ row: 0, message: "No rows" }] };

  // Header detection: first row contains "email" (case-insensitive) → headered.
  const firstCells = parseLine(lines[0]).map((c) => c.trim().toLowerCase());
  const hasHeader = firstCells.some((c) => c === "email");

  let emailIdx = 0;
  let nameIdx = -1;
  let dataStart = 0;

  if (hasHeader) {
    emailIdx = firstCells.indexOf("email");
    nameIdx = firstCells.indexOf("name");
    dataStart = 1;
  } else {
    // No header. If 2 columns assume "name, email"; if 1 assume "email".
    const ncols = parseLine(lines[0]).length;
    if (ncols >= 2) {
      nameIdx = 0;
      emailIdx = 1;
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const cells = parseLine(lines[i]).map((c) => c.trim());
    const lineNumber = i + 1; // 1-indexed for the teacher's UI
    const email = (cells[emailIdx] ?? "").toLowerCase();
    if (!email) {
      errors.push({ row: lineNumber, message: "Missing email" });
      continue;
    }
    // Very simple email shape check; full validation happens in Zod later.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: lineNumber, message: `Invalid email: ${email}` });
      continue;
    }
    const name = nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() || null : null;
    rows.push({ email, name });
  }

  // Deduplicate by email, keeping the first occurrence. Common when teachers
  // paste from two sources.
  const seen = new Set<string>();
  const deduped: ParsedRosterRow[] = [];
  for (const r of rows) {
    if (seen.has(r.email)) continue;
    seen.add(r.email);
    deduped.push(r);
  }

  return { rows: deduped, errors };
}
