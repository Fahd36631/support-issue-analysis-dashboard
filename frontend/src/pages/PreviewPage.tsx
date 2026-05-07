import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { downloadExcel, fetchAnalysis } from "../api";
import { REGIONS, type AnalysisState, type RegionAnalysis, type RegionName } from "../types";

function computeTopIssue(region: RegionAnalysis) {
  const rows = region.problemSummary.filter((r) => r.type !== "Total");
  const top = rows.reduce((best, cur) => (cur.occurrences > (best?.occurrences ?? -1) ? cur : best), rows[0]);
  return top?.type || "N/A";
}

function computeTopDowntime(region: RegionAnalysis) {
  const rows = region.showroomDowntime.filter((r) => r.showroom !== "Total");
  const top = rows.reduce((best, cur) => (cur.disconnections > (best?.disconnections ?? -1) ? cur : best), rows[0]);
  return top?.showroom || "N/A";
}

export default function PreviewPage() {
  const [state, setState] = useState<AnalysisState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysis()
      .then(setState)
      .catch((e) => setError(e?.message || "Failed to load analysis"));
  }, []);

  const totals = useMemo(() => {
    if (!state) return null;
    let totalMessages = 0;
    let totalOcc = 0;
    let totalDisc = 0;
    for (const r of REGIONS) {
      totalMessages += state.regions[r].totals?.totalMessages || 0;
      totalOcc += state.regions[r].totals?.totalOccurrences || 0;
      totalDisc += state.regions[r].totals?.totalDisconnections || 0;
    }
    return { totalMessages, totalOcc, totalDisc };
  }, [state]);

  const sampleRegion: RegionName = "Central Region";
  const region = state?.regions?.[sampleRegion];

  async function onExport() {
    setError(null);
    setBusy(true);
    try {
      const blob = await downloadExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Monthly_Analysis.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Analysis Preview</h2>
        <div className="muted">{error ? error : "Loading..."}</div>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card" style={{ gridColumn: "span 12" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Dashboard Preview</h2>
            <div className="muted">Totals across all regions. You can edit per-region details before exporting.</div>
          </div>
          <button className="btn primary" onClick={onExport} disabled={busy}>
            {busy ? "Exporting..." : "Export Excel"}
          </button>
        </div>
        {error ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      </div>

      <div className="card" style={{ gridColumn: "span 4" }}>
        <div className="kpi">
          <div className="muted">Total messages</div>
          <div className="value">{totals?.totalMessages ?? 0}</div>
        </div>
      </div>
      <div className="card" style={{ gridColumn: "span 4" }}>
        <div className="kpi">
          <div className="muted">Total issue occurrences</div>
          <div className="value">{totals?.totalOcc ?? 0}</div>
        </div>
      </div>
      <div className="card" style={{ gridColumn: "span 4" }}>
        <div className="kpi">
          <div className="muted">Total network disconnections</div>
          <div className="value">{totals?.totalDisc ?? 0}</div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "span 6" }}>
        <h2>Daily messages (sample: {sampleRegion})</h2>
        {region?.daily?.length ? (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={region.daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="messageCount" name="Number of Messages" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="muted">No daily data yet. Upload chats first.</div>
        )}
      </div>

      <div className="card" style={{ gridColumn: "span 6" }}>
        <h2>Issue breakdown (sample: {sampleRegion})</h2>
        {region?.problemSummary?.length ? (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip />
                <Pie
                  data={region.problemSummary.filter((p) => p.type !== "Total")}
                  dataKey="occurrences"
                  nameKey="type"
                  innerRadius={70}
                  outerRadius={110}
                >
                  {region.problemSummary
                    .filter((p) => p.type !== "Total")
                    .map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={["#16a34a", "#2563eb", "#f59e0b", "#7c3aed", "#ef4444"][idx % 5]}
                      />
                    ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="muted">No issue data yet.</div>
        )}
      </div>

      <div className="card" style={{ gridColumn: "span 12" }}>
        <h2>Regions</h2>
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th>Total messages</th>
              <th>Total occurrences</th>
              <th>Top issue type</th>
              <th>Top downtime showroom</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((r) => {
              const rg = state.regions[r];
              return (
                <tr key={r}>
                  <td>{r}</td>
                  <td>{rg.totals?.totalMessages ?? 0}</td>
                  <td>{rg.totals?.totalOccurrences ?? 0}</td>
                  <td>{computeTopIssue(rg)}</td>
                  <td>{computeTopDowntime(rg)}</td>
                  <td>
                    <Link className="btn" to={`/region/${encodeURIComponent(r)}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

