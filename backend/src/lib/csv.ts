/** Minimal CSV parser (RFC4180-ish). First row = headers. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows = splitCsvRows(text.trim().replace(/^\uFEFF/, ""));
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const data: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((c) => !c.trim())) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (cells[c] ?? "").trim();
    }
    data.push(obj);
  }

  return { headers, rows: data };
}

function splitCsvRows(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      result.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // skip; handle \r\n via \n
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    result.push(row);
  }

  return result;
}

export function splitTags(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[|;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseBool(value: string | undefined, defaultValue = true): boolean {
  if (value == null || value === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  return defaultValue;
}
