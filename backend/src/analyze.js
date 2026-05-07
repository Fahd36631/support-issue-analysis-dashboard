import {
  KEYWORDS,
  NETWORK_DOWNTIME_KEYWORDS,
  PROBLEM_TYPES_IN_ORDER,
  SHOWROOM_PATTERNS
} from "./constants.js";

function normalize(s) {
  return (s || "").toString().toLowerCase();
}

export function classifyProblemType(messageText) {
  const t = normalize(messageText);
  if (!t) return null;

  // Prefer more specific printer/network etc in requested order
  for (const type of PROBLEM_TYPES_IN_ORDER) {
    const kws = KEYWORDS[type] || [];
    if (kws.some((k) => t.includes(normalize(k)))) return type;
  }

  // Keywords map includes SAP under "SAP" key, but our order uses "SAP"
  // In case mismatch ever happens:
  if (KEYWORDS.SAP?.some((k) => t.includes(normalize(k)))) return "SAP";

  return null;
}

export function isNetworkDowntime(messageText) {
  const t = normalize(messageText);
  return NETWORK_DOWNTIME_KEYWORDS.some((k) => t.includes(normalize(k)));
}

export function detectShowroomName(messageText) {
  const raw = (messageText || "").toString();
  const textLow = raw.toLowerCase();

  // Match showroom names exactly like colleague script first.
  for (const [showroom, patterns] of Object.entries(SHOWROOM_PATTERNS)) {
    if (patterns.some((p) => textLow.includes(String(p).toLowerCase()))) {
      return showroom;
    }
  }

  // Heuristic: look for "Showroom <name>" or "Branch <name>" or Arabic "فرع"
  const m1 = raw.match(/\b(Showroom|Branch)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9 \-_]{1,40})/i);
  if (m1?.[2]) return m1[2].trim();
  const m2 = raw.match(/(?:فرع|معرض)\s*[:\-]?\s*([\u0600-\u06FF0-9][\u0600-\u06FF0-9 \-_]{1,40})/);
  if (m2?.[1]) return m2[1].trim();
  return "Unknown Showroom";
}

export function computeWeekLabel(dateISO) {
  // Week groups based on day-of-month (1-7 => Week 1, ... 29-31 => Week 5)
  const day = Number(String(dateISO).slice(-2));
  const weekNum = Math.min(5, Math.max(1, Math.ceil(day / 7)));
  return `Week ${weekNum}`;
}

function buildDailyRows(dailyMap, period) {
  // If a specific month+year is selected, force full month distribution
  // so the report always contains all days (with zeros where no messages).
  if (period?.month && period?.year) {
    const daysInMonth = new Date(period.year, period.month, 0).getDate();
    const rows = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateISO = `${period.year}-${String(period.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      rows.push({
        week: computeWeekLabel(dateISO),
        date: dateISO,
        messageCount: dailyMap.get(dateISO) || 0
      });
    }
    return rows;
  }

  return Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateISO, count]) => ({
      week: computeWeekLabel(dateISO),
      date: dateISO,
      messageCount: count
    }));
}

export function analyzeMessages(messages, period = null) {
  // daily counts
  const dailyMap = new Map(); // dateISO -> count
  const problemCounts = new Map(); // type -> count
  const showroomDown = new Map(); // showroom -> disconnections

  for (const m of messages) {
    dailyMap.set(m.dateISO, (dailyMap.get(m.dateISO) || 0) + 1);

    const type = classifyProblemType(m.text);
    if (type) problemCounts.set(type, (problemCounts.get(type) || 0) + 1);

    if (isNetworkDowntime(m.text)) {
      const showroom = detectShowroomName(m.text);
      showroomDown.set(showroom, (showroomDown.get(showroom) || 0) + 1);
    }
  }

  const daily = buildDailyRows(dailyMap, period);

  const problemSummary = PROBLEM_TYPES_IN_ORDER.map((t) => ({
    type: t,
    occurrences: problemCounts.get(t) || 0
  }));

  const totalMessages = daily.reduce((sum, r) => sum + r.messageCount, 0);
  const totalOccurrences = problemSummary.reduce((sum, r) => sum + r.occurrences, 0);

  const showroomDowntime = Array.from(showroomDown.entries())
    .map(([showroom, disconnections]) => ({ showroom, disconnections }))
    .sort((a, b) => b.disconnections - a.disconnections);

  const totalDisconnections = showroomDowntime.reduce((s, r) => s + r.disconnections, 0);

  return {
    daily,
    problemSummary: [...problemSummary, { type: "Total", occurrences: totalOccurrences }],
    showroomDowntime: [
      ...showroomDowntime,
      ...(showroomDowntime.length ? [{ showroom: "Total", disconnections: totalDisconnections }] : [])
    ],
    totals: { totalMessages, totalOccurrences, totalDisconnections }
  };
}

