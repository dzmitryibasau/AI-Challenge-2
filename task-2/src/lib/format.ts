// Shared utilities: CSV, ICS, date helpers, slugify
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function formatDateRange(startISO: string, endISO: string, tz?: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
    });
  return `${fmt(s)} — ${fmt(e)}${tz ? ` (${tz})` : ""}`;
}

export function isPast(endISO: string): boolean {
  return new Date(endISO).getTime() < Date.now();
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCSV(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  // UTF-8 BOM for Excel
  return "\ufeff" + lines.join("\r\n");
}

export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
export function buildICS(opts: {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startISO: string;
  endISO: string;
  url?: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenSeat//EN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@openseat`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(opts.startISO))}`,
    `DTEND:${icsDate(new Date(opts.endISO))}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    opts.description ? `DESCRIPTION:${icsEscape(opts.description)}` : "",
    opts.location ? `LOCATION:${icsEscape(opts.location)}` : "",
    opts.url ? `URL:${icsEscape(opts.url)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function randomToken(len = 24): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
