import fs from "node:fs/promises";
import path from "node:path";
import { REGIONS } from "./constants.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "analysis.json");

function emptyRegion(regionName) {
  return {
    region: regionName,
    daily: [],
    problemSummary: [],
    averageCalls: 0,
    showroomDowntime: [],
    totals: {
      totalMessages: 0,
      totalOccurrences: 0,
      totalDisconnections: 0
    }
  };
}

export function emptyAnalysis() {
  const regions = {};
  for (const r of REGIONS) regions[r] = emptyRegion(r);
  return { regions, updatedAt: new Date().toISOString() };
}

export async function loadAnalysis() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Ensure all regions exist
    for (const r of REGIONS) {
      if (!parsed?.regions?.[r]) parsed.regions[r] = emptyRegion(r);
    }
    return parsed;
  } catch {
    const initial = emptyAnalysis();
    await saveAnalysis(initial);
    return initial;
  }
}

export async function saveAnalysis(analysis) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(analysis, null, 2), "utf8");
}

export async function updateRegion(regionName, regionPayload) {
  const analysis = await loadAnalysis();
  analysis.regions[regionName] = regionPayload;
  analysis.updatedAt = new Date().toISOString();
  await saveAnalysis(analysis);
  return analysis;
}

