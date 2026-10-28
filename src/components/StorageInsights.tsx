import { useMemo } from "react";
import {
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  HardDrive,
  ShieldCheck,
} from "lucide-react";
import type { Asset } from "../types";
import { categories, categoryColors, formatSize } from "../lib/format";
import { AssetIcon } from "./AssetIcon";
export function StorageInsights({
  assets,
  onSelect,
}: {
  assets: Asset[];
  onSelect: (asset: Asset) => void;
}) {
  const { total, distribution, largest } = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const a of assets)
      sizes.set(a.category, (sizes.get(a.category) ?? 0) + a.size);
    return {
      total: assets.reduce((n, a) => n + a.size, 0),
      distribution: categories
        .map((category) => ({ category, size: sizes.get(category) ?? 0 }))
        .filter((c) => c.size > 0)
        .sort((a, b) => b.size - a.size),
      largest: [...assets].sort((a, b) => b.size - a.size).slice(0, 4),
    };
  }, [assets]);
  return (
    <aside className="insights">
      <div className="section-heading">
        <h2>Storage Insights</h2>
        <ChartNoAxesColumnIncreasing size={15} />
      </div>
      <div className="storage-total">
        <HardDrive size={18} />
        <span>{formatSize(total)}</span>
        <small>project size</small>
      </div>
      <div className="distribution-bar">
        {distribution.length ? (
          distribution.map(({ category, size }) => (
            <span
              key={category}
              title={`${category}: ${formatSize(size)}`}
              style={{
                width: `${(size / total) * 100}%`,
                background: categoryColors[category],
              }}
            />
          ))
        ) : (
          <span className="distribution-empty" />
        )}
      </div>
      <div className="distribution-legend">
        {distribution.length ? (
          distribution.map(({ category, size }) => (
            <div key={category}>
              <span>
                <i style={{ background: categoryColors[category] }} />
                {category}
              </span>
              <span>{Math.round((size / total) * 100)}%</span>
            </div>
          ))
        ) : (
          <p>
            A clearer picture of your
            <br />
            project, right here.
          </p>
        )}
      </div>
      <div className="insights-divider" />
      <div className="section-heading small">
        <h3>Largest assets</h3>
        <span>TOP {largest.length || 4}</span>
      </div>
      <div className="largest-assets">
        {largest.length ? (
          largest.map((a) => (
            <button key={a.path} onClick={() => onSelect(a)}>
              <span
                className="largest-icon"
                style={{ color: categoryColors[a.category] }}
              >
                <AssetIcon category={a.category} size={18} />
              </span>
              <span className="largest-info">
                <strong title={a.name}>{a.name}</strong>
                <small>{formatSize(a.size)}</small>
              </span>
              <ArrowUpRight size={13} />
            </button>
          ))
        ) : (
          <div className="insights-placeholder">
            <div />
            <div />
            <div />
            <p>
              Open a project to see
              <br />
              what takes up space.
            </p>
          </div>
        )}
      </div>
      <div className="insight-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Look first. Move second.</strong>Every organization starts
          with
          <br />a preview. You're in control.
        </p>
      </div>
    </aside>
  );
}
