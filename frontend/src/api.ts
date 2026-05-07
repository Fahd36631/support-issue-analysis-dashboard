import type { AnalysisState, RegionAnalysis, RegionName } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
type UploadRegion = RegionName | "All Regions";

export async function fetchAnalysis(): Promise<AnalysisState> {
  const r = await fetch(`${API_BASE}/api/analysis`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadChats(
  files: File[],
  regions: UploadRegion[],
  period?: { month?: number; year?: number; dateOrder?: "AUTO" | "DMY" | "MDY" }
): Promise<AnalysisState> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  regions.forEach((rg) => fd.append("regions", rg));
  if (period?.month) {
    fd.append("month", String(period.month));
  }
  if (period?.year) {
    fd.append("year", String(period.year));
  }
  if (period?.dateOrder) {
    fd.append("dateOrder", period.dateOrder);
  }
  const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveRegion(region: RegionName, payload: RegionAnalysis): Promise<AnalysisState> {
  const r = await fetch(`${API_BASE}/api/analysis/${encodeURIComponent(region)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function downloadExcel(): Promise<Blob> {
  const r = await fetch(`${API_BASE}/api/export-excel`);
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

