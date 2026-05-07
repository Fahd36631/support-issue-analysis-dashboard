import ExcelJS from "exceljs";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { REGIONS, PROBLEM_TYPES_IN_ORDER } from "./constants.js";

const GREEN = "FF92D050"; // header
const BLUE_TOTAL = "FFB7DEE8"; // total rows
const LIGHT_GREEN = "FFC6EFCE"; // week col cells
const GRAY = "FFE7E6E6"; // problem rows

function borderAll(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } }
  };
}

function styleHeaderRow(row) {
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    c.font = { bold: true, color: { argb: "FF000000" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    borderAll(c);
  });
  row.height = 20;
}

function styleTotalRow(row) {
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_TOTAL } };
    c.font = { bold: true };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    borderAll(c);
  });
}

function styleBodyCell(cell, { fillArgb } = {}) {
  if (fillArgb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  borderAll(cell);
}

function isoToDate(value) {
  // Keep date-only behavior without timezone shifting
  const [y, m, d] = String(value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

async function makeCharts(regionData) {
  const width = 700;
  const height = 380;
  const chartCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: "white" });

  const labels = regionData.daily.map((d) => d.date);
  const values = regionData.daily.map((d) => d.messageCount);
  const barConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Number of Messages",
          data: values,
          backgroundColor: "#4F81BD"
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxRotation: 90, minRotation: 45 } },
        y: { beginAtZero: true }
      }
    }
  };

  const donutLabels = PROBLEM_TYPES_IN_ORDER;
  const donutValues = donutLabels.map(
    (t) => regionData.problemSummary.find((x) => x.type === t)?.occurrences || 0
  );
  const donutConfig = {
    type: "doughnut",
    data: {
      labels: donutLabels,
      datasets: [
        {
          data: donutValues,
          backgroundColor: ["#9BBB59", "#4F81BD", "#F79646", "#8064A2", "#C0504D"]
        }
      ]
    },
    options: {
      plugins: { legend: { position: "right" } }
    }
  };

  const [barPng, donutPng] = await Promise.all([
    chartCanvas.renderToBuffer(barConfig),
    chartCanvas.renderToBuffer(donutConfig)
  ]);
  return { barPng, donutPng };
}

function autoFitColumns(ws, fromCol, toCol) {
  for (let c = fromCol; c <= toCol; c++) {
    let max = 10;
    ws.getColumn(c).eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      const s = v == null ? "" : typeof v === "string" ? v : String(v);
      max = Math.max(max, Math.min(45, s.length + 2));
    });
    ws.getColumn(c).width = max;
  }
}

export async function buildWorkbook(analysis) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monthly Analysis App";
  wb.created = new Date();

  for (const regionName of REGIONS) {
    const region = analysis.regions[regionName];
    const ws = wb.addWorksheet(regionName);

    // Layout constants
    // Daily table: A1:C?
    // Problem table: E1:F?
    // Average calls: E9:F9
    // Showroom table: E11:F?

    ws.getColumn("A").width = 14;
    ws.getColumn("B").width = 16;
    ws.getColumn("C").width = 20;
    ws.getColumn("E").width = 28;
    ws.getColumn("F").width = 20;

    // Daily header
    ws.getRow(1).values = ["Week", "Date", "Number of Messages"];
    styleHeaderRow(ws.getRow(1));

    // Daily rows grouped by week
    let r = 2;
    for (const row of region.daily) {
      ws.getCell(`A${r}`).value = row.week;
      const dateValue = isoToDate(row.date);
      ws.getCell(`B${r}`).value = dateValue || row.date;
      if (dateValue) ws.getCell(`B${r}`).numFmt = "d/m/yyyy";
      ws.getCell(`C${r}`).value = row.messageCount;
      styleBodyCell(ws.getCell(`A${r}`), { fillArgb: LIGHT_GREEN });
      styleBodyCell(ws.getCell(`B${r}`));
      styleBodyCell(ws.getCell(`C${r}`));
      r++;
    }

    // Merge contiguous week labels in column A for cleaner monthly layout
    let blockStart = 2;
    for (let i = 3; i <= r; i++) {
      const prev = ws.getCell(`A${i - 1}`).value;
      const cur = i < r ? ws.getCell(`A${i}`).value : null;
      if (prev !== cur) {
        const blockEnd = i - 1;
        if (blockEnd > blockStart) {
          ws.mergeCells(`A${blockStart}:A${blockEnd}`);
          const mergedTop = ws.getCell(`A${blockStart}`);
          mergedTop.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          mergedTop.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GREEN } };
          borderAll(mergedTop);
        }
        blockStart = i;
      }
    }

    // Total row for daily
    ws.getCell(`A${r}`).value = "Total";
    ws.getCell(`B${r}`).value = "";
    ws.getCell(`C${r}`).value = region.totals?.totalMessages || region.daily.reduce((s, x) => s + x.messageCount, 0);
    styleTotalRow(ws.getRow(r));
    const dailyEndRow = r;

    // Problem table header at E1:F1
    ws.getCell("E1").value = "Type of problem";
    ws.getCell("F1").value = "Number of Occurrences";
    styleHeaderRow(ws.getRow(1)); // already styled A-C; also styles E-F because row 1 now has values? ensure cells:
    // Row 1 may not include E/F in values; style explicitly:
    styleBodyCell(ws.getCell("E1"), { fillArgb: GREEN });
    styleBodyCell(ws.getCell("F1"), { fillArgb: GREEN });
    ws.getCell("E1").font = { bold: true };
    ws.getCell("F1").font = { bold: true };

    // Problem rows
    const problems = region.problemSummary?.length
      ? region.problemSummary
      : [
          ...PROBLEM_TYPES_IN_ORDER.map((t) => ({ type: t, occurrences: 0 })),
          { type: "Total", occurrences: 0 }
        ];

    let pr = 2;
    for (const p of problems) {
      ws.getCell(`E${pr}`).value = p.type;
      ws.getCell(`F${pr}`).value = p.occurrences;
      const isTotal = p.type === "Total";
      if (isTotal) {
        styleTotalRow(ws.getRow(pr));
      } else {
        styleBodyCell(ws.getCell(`E${pr}`), { fillArgb: GRAY });
        styleBodyCell(ws.getCell(`F${pr}`), { fillArgb: GRAY });
      }
      pr++;
    }

    // Average calls row at E9:F9 (fixed position for consistent structure)
    const avgRow = 9;
    ws.getCell(`E${avgRow}`).value = "Average of Calls This Month (Ext. & Mobile)";
    ws.getCell(`F${avgRow}`).value = region.averageCalls ?? 0;
    styleBodyCell(ws.getCell(`E${avgRow}`), { fillArgb: "FFFFFFFF" });
    styleBodyCell(ws.getCell(`F${avgRow}`), { fillArgb: "FFFFFFFF" });
    ws.getCell(`E${avgRow}`).font = { bold: true };

    // Showroom table header at E11:F11
    const showHeaderRow = 11;
    ws.getCell(`E${showHeaderRow}`).value = "Showroom";
    ws.getCell(`F${showHeaderRow}`).value = "Number of Disconnections";
    styleBodyCell(ws.getCell(`E${showHeaderRow}`), { fillArgb: GREEN });
    styleBodyCell(ws.getCell(`F${showHeaderRow}`), { fillArgb: GREEN });
    ws.getCell(`E${showHeaderRow}`).font = { bold: true };
    ws.getCell(`F${showHeaderRow}`).font = { bold: true };

    const showrooms = region.showroomDowntime?.length
      ? region.showroomDowntime
      : [{ showroom: "Total", disconnections: 0 }];

    let sr = showHeaderRow + 1;
    for (const s of showrooms) {
      ws.getCell(`E${sr}`).value = s.showroom;
      ws.getCell(`F${sr}`).value = s.disconnections;
      const isTotal = s.showroom === "Total";
      if (isTotal) styleTotalRow(ws.getRow(sr));
      else {
        styleBodyCell(ws.getCell(`E${sr}`));
        styleBodyCell(ws.getCell(`F${sr}`));
      }
      sr++;
    }

    // Insert charts (as images) to the right (H column area)
    const { barPng, donutPng } = await makeCharts(region);
    const barId = wb.addImage({ buffer: barPng, extension: "png" });
    const donutId = wb.addImage({ buffer: donutPng, extension: "png" });

    ws.addImage(barId, {
      tl: { col: 7, row: 1 }, // H2
      ext: { width: 650, height: 330 }
    });
    ws.addImage(donutId, {
      tl: { col: 7, row: 19 }, // H20
      ext: { width: 650, height: 330 }
    });

    // Final touches
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
    autoFitColumns(ws, 1, 6);

    // Keep the daily table visually consistent even if short
    ws.getRow(1).height = 22;
    ws.getRow(dailyEndRow).height = 20;
  }

  return wb;
}

