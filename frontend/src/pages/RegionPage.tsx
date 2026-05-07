import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EditableTable from "../components/EditableTable";
import { fetchAnalysis, saveRegion } from "../api";
import { REGIONS, type AnalysisState, type RegionAnalysis, type RegionName } from "../types";

function asRegionName(s: string | undefined): RegionName | null {
  if (!s) return null;
  const decoded = decodeURIComponent(s);
  return (REGIONS as string[]).includes(decoded) ? (decoded as RegionName) : null;
}

function recomputeTotals(region: RegionAnalysis): RegionAnalysis {
  const totalMessages = region.daily.reduce((s, x) => s + (Number(x.messageCount) || 0), 0);
  const totalOccurrences = region.problemSummary
    .filter((p) => p.type !== "Total")
    .reduce((s, x) => s + (Number(x.occurrences) || 0), 0);
  const totalDisconnections = region.showroomDowntime
    .filter((s) => s.showroom !== "Total")
    .reduce((sum, x) => sum + (Number(x.disconnections) || 0), 0);

  const problemSummary = region.problemSummary.filter((p) => p.type !== "Total");
  const showroomDowntime = region.showroomDowntime.filter((s) => s.showroom !== "Total");

  return {
    ...region,
    problemSummary: [...problemSummary, { type: "Total", occurrences: totalOccurrences }],
    showroomDowntime: [...showroomDowntime, { showroom: "Total", disconnections: totalDisconnections }],
    totals: { totalMessages, totalOccurrences, totalDisconnections }
  };
}

export default function RegionPage() {
  const { regionName } = useParams();
  const name = asRegionName(regionName);
  const [state, setState] = useState<AnalysisState | null>(null);
  const [draft, setDraft] = useState<RegionAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalysis()
      .then((s) => {
        setState(s);
        if (name) setDraft(s.regions[name]);
      })
      .catch((e) => setError(e?.message || "Failed to load"));
  }, [name]);

  const totals = useMemo(() => (draft ? recomputeTotals(draft).totals : null), [draft]);

  if (!name) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Region not found</h2>
        <div className="muted">
          Go back to <Link to="/preview">Preview</Link>.
        </div>
      </div>
    );
  }

  const region = draft;
  if (!region) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <h2>{name}</h2>
        <div className="muted">{error ? error : "Loading..."}</div>
      </div>
    );
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    try {
      const normalized = recomputeTotals(region);
      const next = await saveRegion(name, normalized);
      setState(next);
      setDraft(next.regions[name]);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="card" style={{ gridColumn: "span 12" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>{name}</h2>
            <div className="muted">Edit the data below. Click Save to store edits (used by Excel export).</div>
          </div>
          <div className="row">
            <Link className="btn" to="/preview">
              Back
            </Link>
            <button className="btn primary" onClick={onSave} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
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
          <div className="muted">Total occurrences</div>
          <div className="value">{totals?.totalOccurrences ?? 0}</div>
        </div>
      </div>
      <div className="card" style={{ gridColumn: "span 4" }}>
        <div className="kpi">
          <div className="muted">Total disconnections</div>
          <div className="value">{totals?.totalDisconnections ?? 0}</div>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "span 8" }}>
        <h2>Daily message counts</h2>
        <EditableTable
          rows={region.daily}
          onChange={(next) => setDraft({ ...region, daily: next })}
          rowKey={(r) => r.date}
          columns={[
            { key: "week", header: "Week", width: "18%", editable: true },
            { key: "date", header: "Date", width: "42%", editable: true },
            { key: "messageCount", header: "Number of Messages", width: "40%", editable: true, isNumber: true }
          ]}
        />
      </div>

      <div className="card" style={{ gridColumn: "span 4" }}>
        <h2>Average calls</h2>
        <div className="muted">Average of Calls This Month (Ext. & Mobile)</div>
        <div style={{ height: 10 }} />
        <input
          className="input"
          inputMode="numeric"
          value={region.averageCalls ?? 0}
          onChange={(e) => setDraft({ ...region, averageCalls: Number(e.target.value || 0) })}
        />
      </div>

      <div className="card" style={{ gridColumn: "span 6" }}>
        <h2>Problem occurrences</h2>
        <EditableTable
          rows={region.problemSummary}
          onChange={(next) => setDraft({ ...region, problemSummary: next })}
          columns={[
            { key: "type", header: "Type of problem", editable: true },
            { key: "occurrences", header: "Number of Occurrences", editable: true, isNumber: true }
          ]}
          rowKey={(r, i) => `${r.type}-${i}`}
        />
      </div>

      <div className="card" style={{ gridColumn: "span 6" }}>
        <h2>Showroom internet downtime</h2>
        <EditableTable
          rows={region.showroomDowntime}
          onChange={(next) => setDraft({ ...region, showroomDowntime: next })}
          columns={[
            { key: "showroom", header: "Showroom", editable: true },
            { key: "disconnections", header: "Number of Disconnections", editable: true, isNumber: true }
          ]}
          rowKey={(r, i) => `${r.showroom}-${i}`}
        />
      </div>
    </div>
  );
}

