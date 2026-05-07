import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadChats } from "../api";
import { REGIONS, type RegionName } from "../types";

type UploadRegion = RegionName | "All Regions";
type Selected = { file: File; region: UploadRegion };

export default function UploadPage() {
  const nav = useNavigate();
  const now = new Date();
  const [selected, setSelected] = useState<Selected[]>([]);
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [year, setYear] = useState<string>("all");
  const [dateOrder, setDateOrder] = useState<"AUTO" | "DMY" | "MDY">("AUTO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFiles = selected.length;
  const totalBytes = useMemo(() => selected.reduce((s, x) => s + x.file.size, 0), [selected]);

  function onPickFiles(files: FileList | null) {
    if (!files) return;
    const next: Selected[] = [];
    for (const f of Array.from(files)) {
      next.push({ file: f, region: "All Regions" });
    }
    setSelected(next);
  }

  async function onUpload() {
    setError(null);
    setBusy(true);
    try {
      await uploadChats(
        selected.map((s) => s.file),
        selected.map((s) => s.region),
        {
          month: month === "all" ? undefined : Number(month),
          year: year === "all" ? undefined : Number(year),
          dateOrder
        }
      );
      nav("/preview");
    } catch (e: any) {
      let msg = e?.message || "Upload failed";
      try {
        const parsed = JSON.parse(msg);
        msg = parsed?.error || msg;
      } catch {}
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="card" style={{ gridColumn: "span 12" }}>
        <h2>Upload WhatsApp chat exports</h2>
        <div className="muted">
          Supported: <b>.txt</b> exports and <b>.zip</b> containing WhatsApp <b>.txt</b> files. You can upload multiple
          files and assign each one to a region.
        </div>
        <div style={{ height: 12 }} />
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ minWidth: 180 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Filter Month
            </div>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">All Months</option>
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Filter Year
            </div>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">All Years</option>
              {Array.from({ length: 7 }).map((_, i) => {
                const y = now.getFullYear() - 4 + i;
                return (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <div className="muted" style={{ marginBottom: 6 }}>
              Date Format
            </div>
            <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as "AUTO" | "DMY" | "MDY")}>
              <option value="AUTO">Auto Detect</option>
              <option value="DMY">DD/MM/YYYY</option>
              <option value="MDY">MM/DD/YYYY</option>
            </select>
          </div>
        </div>
        <input className="input" type="file" multiple accept=".txt,.zip" onChange={(e) => onPickFiles(e.target.files)} />
      </div>

      <div className="card" style={{ gridColumn: "span 8" }}>
        <h2>Files</h2>
        {selected.length === 0 ? (
          <div className="muted">Pick files to begin.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: "55%" }}>File</th>
                <th style={{ width: "25%" }}>Region</th>
                <th style={{ width: "20%" }}>Size</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((s, idx) => (
                <tr key={`${s.file.name}-${idx}`}>
                  <td>{s.file.name}</td>
                  <td>
                    <select
                      value={s.region}
                      onChange={(e) => {
                        const v = e.target.value as UploadRegion;
                        setSelected((prev) => prev.map((p, i) => (i === idx ? { ...p, region: v } : p)));
                      }}
                    >
                      <option value="All Regions">All Regions</option>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{Math.round(s.file.size / 1024)} KB</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ gridColumn: "span 4" }}>
        <h2>Upload</h2>
        <div className="kpi">
          <div className="muted">Files</div>
          <div className="value">{totalFiles}</div>
        </div>
        <div style={{ height: 10 }} />
        <div className="kpi">
          <div className="muted">Total size</div>
          <div className="value">{Math.round(totalBytes / 1024)} KB</div>
        </div>
        <div style={{ height: 14 }} />
        <button className="btn primary" disabled={busy || selected.length === 0} onClick={onUpload}>
          {busy ? "Uploading..." : "Upload & Analyze"}
        </button>
        {error ? (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</div>
        ) : null}
      </div>
    </div>
  );
}

