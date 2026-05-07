import { DateTime } from "luxon";

// WhatsApp exported chats commonly look like:
// "12/31/23, 9:15 PM - Name: message"
// "31/12/2023, 21:15 - Name: message"
// Messages can be multiline; continuation lines do not start with date pattern.

// Supports:
// 12/31/23, 9:15 PM - Name: text
// 31/12/2023, 21:15 - Name: text
// [31/12/2023, 21:15:22] Name: text
// Arabic AM/PM markers: ص / م
const LINE_PATTERNS = [
  /^(\[)?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*([AP]M|ص|م))?(\])?\s*-\s*([^:]+):\s*([\s\S]*)$/i,
  /^(\[)?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*([AP]M|ص|م))?(\])?\s*([^:]+):\s*([\s\S]*)$/i
];

function normalizeAmPm(ampm) {
  if (!ampm) return "";
  const clean = ampm.trim().toUpperCase();
  if (clean === "ص") return "AM";
  if (clean === "م") return "PM";
  return clean;
}

function dateFormatsByOrder(order) {
  const dmy = [
    "d/M/yy, h:mm a",
    "d/M/yyyy, h:mm a",
    "d/M/yy, h:mm:ss a",
    "d/M/yyyy, h:mm:ss a",
    "d/M/yy, H:mm",
    "d/M/yyyy, H:mm",
    "d/M/yy, H:mm:ss",
    "d/M/yyyy, H:mm:ss"
  ];
  const mdy = [
    "M/d/yy, h:mm a",
    "M/d/yyyy, h:mm a",
    "M/d/yy, h:mm:ss a",
    "M/d/yyyy, h:mm:ss a",
    "M/d/yy, H:mm",
    "M/d/yyyy, H:mm",
    "M/d/yy, H:mm:ss",
    "M/d/yyyy, H:mm:ss"
  ];
  const common = [
    "d.M.yy, H:mm",
    "d.M.yyyy, H:mm",
    "d.M.yy, H:mm:ss",
    "d.M.yyyy, H:mm:ss",
    "d-M-yy, H:mm",
    "d-M-yyyy, H:mm",
    "d-M-yy, H:mm:ss",
    "d-M-yyyy, H:mm:ss",
    "M-d-yy, H:mm",
    "M-d-yyyy, H:mm",
    "M-d-yy, H:mm:ss",
    "M-d-yyyy, H:mm:ss"
  ];
  return order === "MDY" ? [...mdy, ...dmy, ...common] : [...dmy, ...mdy, ...common];
}

function detectDateOrder(lines) {
  // Infer from unambiguous dates:
  // if first token > 12 => DMY, if second token > 12 => MDY
  let dmyHits = 0;
  let mdyHits = 0;
  for (const line of lines) {
    const m = LINE_PATTERNS.map((p) => line.match(p)).find(Boolean);
    if (!m) continue;
    const dateStr = m[2] || "";
    const parts = dateStr.split(/[\/.\-]/).map((x) => Number(x));
    if (parts.length < 3) continue;
    const a = parts[0];
    const b = parts[1];
    if (a > 12 && b <= 12) dmyHits++;
    if (b > 12 && a <= 12) mdyHits++;
  }
  return mdyHits > dmyHits ? "MDY" : "DMY";
}

function parseDate(dateStr, timeStr, ampm, order = "DMY") {
  const candidates = [];
  const normalizedAmPm = normalizeAmPm(ampm);
  const t = normalizedAmPm ? `${timeStr} ${normalizedAmPm}` : timeStr;

  for (const fmt of dateFormatsByOrder(order)) {
    candidates.push(DateTime.fromFormat(`${dateStr}, ${t}`, fmt));
  }

  const dt = candidates.find((c) => c.isValid);
  return dt?.isValid ? dt : null;
}

export function parseWhatsAppText(content, preferredOrder = "AUTO") {
  const normalized = String(content || "")
    .replace(/\uFEFF/g, "")
    .replace(/\u200E/g, "")
    .replace(/\u202A|\u202B|\u202C/g, "");
  const lines = normalized.replace(/\r\n/g, "\n").split("\n");
  const dateOrder = preferredOrder === "DMY" || preferredOrder === "MDY" ? preferredOrder : detectDateOrder(lines);
  const messages = [];

  let current = null;
  for (const line of lines) {
    const m = LINE_PATTERNS.map((p) => line.match(p)).find(Boolean);
    if (m) {
      if (current) messages.push(current);
      const [, , dateStr, timeStr, ampm, , author, bodyStart] = m;
      const dt = parseDate(dateStr, timeStr, ampm, dateOrder);
      current = {
        datetime: dt?.toISO() ?? null,
        dateISO: dt?.toISODate() ?? null,
        author: (author || "").trim(),
        text: (bodyStart || "").trim()
      };
    } else if (current) {
      // continuation line
      const extra = line.trimEnd();
      if (extra.length > 0) current.text += `\n${extra}`;
    }
  }
  if (current) messages.push(current);

  // Filter system messages or unparsed timestamps
  return messages.filter((m) => m.dateISO && m.text);
}

export function decodeChatBuffer(buffer) {
  // Try utf8 first, fallback to utf16le for WhatsApp exports from some Windows environments.
  const utf8 = buffer.toString("utf8");
  const utf8Parsed = parseWhatsAppText(utf8);
  if (utf8Parsed.length > 0) return utf8;

  const utf16 = buffer.toString("utf16le");
  const utf16Parsed = parseWhatsAppText(utf16);
  if (utf16Parsed.length > 0) return utf16;

  // final fallback, still return utf8 for debugging consistency
  return utf8;
}

