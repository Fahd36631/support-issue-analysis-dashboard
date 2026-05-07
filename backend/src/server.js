import express from "express";
import cors from "cors";
import multer from "multer";
import unzipper from "unzipper";
import { z } from "zod";
import { REGIONS } from "./constants.js";
import { decodeChatBuffer, parseWhatsAppText } from "./whatsappParser.js";
import { analyzeMessages } from "./analyze.js";
import { buildWorkbook } from "./excelExport.js";
import { loadAnalysis, saveAnalysis, updateRegion } from "./storage.js";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const RegionSchema = z.enum(REGIONS);
const ALL_REGIONS_VALUE = "All Regions";
const DATE_ORDER_VALUES = ["AUTO", "DMY", "MDY"];

function parseUploadPeriod(reqBody) {
  const monthRaw = reqBody?.month;
  const yearRaw = reqBody?.year;
  const parsed = {};
  if (monthRaw != null && monthRaw !== "") {
    const month = Number(monthRaw);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    parsed.month = month;
  }
  if (yearRaw != null && yearRaw !== "") {
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    parsed.year = year;
  }
  return Object.keys(parsed).length ? parsed : null;
}

function parseDateOrder(reqBody) {
  const raw = String(reqBody?.dateOrder || "AUTO").toUpperCase();
  return DATE_ORDER_VALUES.includes(raw) ? raw : "AUTO";
}

function filterMessagesByMonthYear(messages, period) {
  if (!period) return messages;
  return messages.filter((m) => {
    const dateISO = String(m.dateISO || "");
    if (!dateISO) return false;
    const [yearStr, monthStr] = dateISO.split("-");
    const y = Number(yearStr);
    const mo = Number(monthStr);
    if (period.year && y !== period.year) return false;
    if (period.month && mo !== period.month) return false;
    return true;
  });
}

function formatAvailablePeriods(messages) {
  const byYear = new Map();
  for (const m of messages) {
    const dateISO = String(m.dateISO || "");
    const [yearStr, monthStr] = dateISO.split("-");
    const y = Number(yearStr);
    const mo = Number(monthStr);
    if (!Number.isInteger(y) || !Number.isInteger(mo)) continue;
    if (!byYear.has(y)) byYear.set(y, new Set());
    byYear.get(y).add(mo);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  const chunks = years.map((y) => {
    const months = Array.from(byYear.get(y)).sort((a, b) => a - b);
    return `${y}: [${months.join(", ")}]`;
  });
  return chunks.join(" | ");
}

function mergeRegionAnalysis(existing, incoming) {
  // Merge by summing daily counts and problem/showroom occurrences
  const dailyMap = new Map(existing.daily.map((d) => [d.date, { ...d }]));
  for (const d of incoming.daily) {
    const prev = dailyMap.get(d.date);
    dailyMap.set(d.date, prev ? { ...prev, messageCount: prev.messageCount + d.messageCount } : { ...d });
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const probMap = new Map();
  for (const p of existing.problemSummary || []) if (p.type !== "Total") probMap.set(p.type, p.occurrences);
  for (const p of incoming.problemSummary || []) {
    if (p.type === "Total") continue;
    probMap.set(p.type, (probMap.get(p.type) || 0) + p.occurrences);
  }
  const problemSummary = [
    ...Array.from(probMap.entries()).map(([type, occurrences]) => ({ type, occurrences }))
  ];

  const totalOccurrences = problemSummary.reduce((s, x) => s + x.occurrences, 0);
  problemSummary.sort((a, b) => REGIONS.length && 0); // keep insertion; frontend will reorder
  problemSummary.push({ type: "Total", occurrences: totalOccurrences });

  const showMap = new Map();
  for (const s of existing.showroomDowntime || []) if (s.showroom !== "Total") showMap.set(s.showroom, s.disconnections);
  for (const s of incoming.showroomDowntime || []) {
    if (s.showroom === "Total") continue;
    showMap.set(s.showroom, (showMap.get(s.showroom) || 0) + s.disconnections);
  }
  const showroomDowntime = Array.from(showMap.entries())
    .map(([showroom, disconnections]) => ({ showroom, disconnections }))
    .sort((a, b) => b.disconnections - a.disconnections);
  const totalDisconnections = showroomDowntime.reduce((s, x) => s + x.disconnections, 0);
  showroomDowntime.push({ showroom: "Total", disconnections: totalDisconnections });

  const totalMessages = daily.reduce((s, x) => s + x.messageCount, 0);

  return {
    ...existing,
    daily,
    problemSummary,
    showroomDowntime,
    totals: {
      totalMessages,
      totalOccurrences,
      totalDisconnections
    }
  };
}

async function extractTxtFromZip(buffer) {
  const directory = await unzipper.Open.buffer(buffer);
  const txtFiles = directory.files.filter(
    (f) => !f.path.endsWith("/") && f.path.toLowerCase().endsWith(".txt")
  );
  const results = [];
  for (const f of txtFiles) {
    const raw = await f.buffer();
    results.push({ name: f.path, content: decodeChatBuffer(raw) });
  }
  return results;
}

app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    const period = parseUploadPeriod(req.body);
    const dateOrder = parseDateOrder(req.body);
    // regions[] should align to files[]
    const regionsRaw = req.body.regions;
    const regions = Array.isArray(regionsRaw) ? regionsRaw : typeof regionsRaw === "string" ? [regionsRaw] : [];

    if (!files.length) return res.status(400).json({ error: "No files uploaded" });

    let analysis = await loadAnalysis();

    let parsedMessagesCount = 0;
    let allParsedMessagesCount = 0;
    const allMessagesForAvailability = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const selectedRegionRaw = regions[i] || regions[0] || "Central Region";
      const targetRegions =
        selectedRegionRaw === ALL_REGIONS_VALUE
          ? [...REGIONS]
          : [RegionSchema.parse(selectedRegionRaw)];
      const filename = file.originalname || `upload_${i}.txt`;

      let txtItems = [];
      if (filename.toLowerCase().endsWith(".zip")) {
        txtItems = await extractTxtFromZip(file.buffer);
      } else if (filename.toLowerCase().endsWith(".txt")) {
        txtItems = [{ name: filename, content: decodeChatBuffer(file.buffer) }];
      } else {
        continue;
      }

      const allMsgs = [];
      for (const item of txtItems) {
        const msgs = parseWhatsAppText(item.content, dateOrder);
        allMsgs.push(...msgs);
      }
      allParsedMessagesCount += allMsgs.length;
      allMessagesForAvailability.push(...allMsgs);
      const filteredMsgs = filterMessagesByMonthYear(allMsgs, period);
      parsedMessagesCount += filteredMsgs.length;
      const computed = analyzeMessages(filteredMsgs, period);

      for (const regionName of targetRegions) {
        const existing = analysis.regions[regionName];
        // Overwrite region with current upload scope (filtered month/year),
        // instead of accumulating historical uploads.
        analysis.regions[regionName] = {
          region: regionName,
          daily: computed.daily,
          problemSummary: computed.problemSummary,
          averageCalls: existing.averageCalls ?? 0,
          showroomDowntime: computed.showroomDowntime,
          totals: computed.totals
        };
      }
      analysis.updatedAt = new Date().toISOString();
    }

    if (parsedMessagesCount === 0) {
      const availability = formatAvailablePeriods(allMessagesForAvailability);
      const periodText =
        period?.month && period?.year
          ? `${period.month}/${period.year}`
          : period?.year
            ? `year ${period.year}`
            : period?.month
              ? `month ${period.month}`
              : "selected period";
      return res.status(400).json({
        error:
          allParsedMessagesCount > 0
            ? `No messages found for ${periodText}. Available periods in file: ${availability || "unknown"}.`
            : "No parseable WhatsApp messages were found. Please check export format/encoding (txt inside zip)."
      });
    }

    await saveAnalysis(analysis);
    return res.json(analysis);
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Upload failed" });
  }
});

app.get("/api/analysis", async (_req, res) => {
  const analysis = await loadAnalysis();
  res.json(analysis);
});

app.put("/api/analysis/:region", async (req, res) => {
  try {
    const regionName = RegionSchema.parse(req.params.region);
    const payload = req.body;
    if (!payload || payload.region !== regionName) {
      return res.status(400).json({ error: "Region payload mismatch" });
    }
    const analysis = await updateRegion(regionName, payload);
    res.json(analysis);
  } catch (e) {
    res.status(400).json({ error: e?.message || "Update failed" });
  }
});

app.get("/api/export-excel", async (_req, res) => {
  const analysis = await loadAnalysis();
  const wb = await buildWorkbook(analysis);
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="Monthly_Analysis.xlsx"');
  res.send(Buffer.from(buffer));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
});

