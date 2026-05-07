export type RegionName =
  | "Central Region"
  | "Eastern Region"
  | "Western Region"
  | "Southern Region"
  | "Northern Region";

export type DailyRow = { week: string; date: string; messageCount: number };
export type ProblemRow = { type: string; occurrences: number };
export type ShowroomRow = { showroom: string; disconnections: number };

export type RegionAnalysis = {
  region: RegionName;
  daily: DailyRow[];
  problemSummary: ProblemRow[];
  averageCalls: number;
  showroomDowntime: ShowroomRow[];
  totals: {
    totalMessages: number;
    totalOccurrences: number;
    totalDisconnections: number;
  };
};

export type AnalysisState = {
  regions: Record<RegionName, RegionAnalysis>;
  updatedAt: string;
};

export const REGIONS: RegionName[] = [
  "Central Region",
  "Eastern Region",
  "Western Region",
  "Southern Region",
  "Northern Region"
];

