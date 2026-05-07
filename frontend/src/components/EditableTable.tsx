import { useMemo } from "react";

type Column<T> = {
  key: keyof T;
  header: string;
  width?: string;
  editable?: boolean;
  isNumber?: boolean;
};

export default function EditableTable<T extends Record<string, any>>(props: {
  rows: T[];
  columns: Column<T>[];
  onChange: (next: T[]) => void;
  rowKey?: (row: T, idx: number) => string;
}) {
  const { rows, columns, onChange, rowKey } = props;
  const colStyles = useMemo(
    () => columns.map((c) => ({ width: c.width || "auto" })),
    [columns]
  );

  return (
    <table>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={String(c.key)} style={colStyles[i]}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={rowKey ? rowKey(r, idx) : String(idx)}>
            {columns.map((c) => {
              const val = r[c.key];
              if (!c.editable) return <td key={String(c.key)}>{String(val ?? "")}</td>;
              return (
                <td key={String(c.key)}>
                  <input
                    className="input"
                    style={{ padding: "8px 10px" }}
                    value={val ?? ""}
                    inputMode={c.isNumber ? "numeric" : undefined}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = rows.map((row, i) => {
                        if (i !== idx) return row;
                        const updated: any = { ...row };
                        updated[c.key] = c.isNumber ? (raw === "" ? 0 : Number(raw)) : raw;
                        return updated;
                      });
                      onChange(next);
                    }}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

