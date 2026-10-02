/* Compact, paginated table. Large lists (850 people, 1,000 rows) are never rendered at once.
   Keep the identifier, status and primary action visible: put them in the first and last columns. */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./primitives";
import { Icon } from "./icons";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: string | number;
  align?: "left" | "right";
  nowrap?: boolean;
  /** Provide to make the column sortable. */
  sort?: (a: T, b: T) => number;
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, selectedKey, pageSize = 25, empty, caption, initialSort, footerNote, minWidth,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  selectedKey?: string | null;
  pageSize?: number;
  empty?: ReactNode;
  caption?: string;
  initialSort?: { key: string; dir: 1 | -1 };
  footerNote?: ReactNode;
  minWidth?: number;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    return rows.slice().sort((a, b) => col.sort!(a, b) * sort.dir);
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page > pages - 1) setPage(0); }, [pages, page]);
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  if (!rows.length) return <div>{empty}</div>;
  return (
    <div>
      <div className="ph-tablewrap">
        <table className="ph-table" style={{ minWidth }}>
          {caption ? <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.width, textAlign: c.align || "left" }} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}>
                    {c.sort ? (
                      <button type="button" className="ph-link" onClick={() => setSort(active ? { key: c.key, dir: (sort!.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 })} style={{ color: active ? "var(--ink)" : "var(--faint)", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                        {c.header}{active ? <Icon name={sort!.dir === 1 ? "up" : "down"} size={11} stroke={2} /> : null}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} className={(onRowClick ? "ph-row" : "") + (selectedKey === k ? " sel" : "")} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "num" : undefined} style={{ whiteSpace: c.nowrap === false ? "normal" : "nowrap", textAlign: c.align || "left" }}>{c.cell(r)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ph-row-flex" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--surface-faint)", fontSize: 12, color: "var(--faint)", flexWrap: "wrap" }}>
        <span className="ph-grow ph-num">
          Showing {Math.min(sorted.length, page * pageSize + 1)} to {Math.min(sorted.length, page * pageSize + pageSize)} of {sorted.length}
          {footerNote ? <span> {footerNote}</span> : null}
        </span>
        {pages > 1 ? (
          <span className="ph-wrap" style={{ gap: 6 }}>
            <Button size="sm" variant="ghost" icon="chevronLeft" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page" />
            <span className="ph-num">Page {page + 1} of {pages}</span>
            <Button size="sm" variant="ghost" icon="chevronRight" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
