import type { AssetCategory } from "../types";
import { AssetIcon } from "./AssetIcon";
import { categoryColors, formatSize } from "../lib/format";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
export function StatCard({
  label,
  category,
  count,
  size,
  active,
  onClick,
  total,
}: {
  label: string;
  category: AssetCategory;
  count: number;
  size: number;
  active: boolean;
  onClick: () => void;
  total: number;
}) {
  return (
    <button
      className={`stat-card ${active ? "selected" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title={active ? `Clear ${label} filter` : `Show ${label.toLowerCase()}`}
      style={
        { "--stat-color": categoryColors[category] } as React.CSSProperties
      }
    >
      <div className="stat-label">
        <span style={{ color: categoryColors[category] }}>
          <AssetIcon category={category} size={16} />
        </span>
        {label}
      </div>
      <motion.div
        className="stat-value"
        key={count}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {count.toLocaleString()}
      </motion.div>
      <div className="stat-size">{formatSize(size)}</div>
      <span className="stat-track" aria-hidden="true">
        <span
          style={{
            width:
              total && count ? `${Math.max(3, (count / total) * 100)}%` : "0%",
          }}
        />
      </span>
      {active && <Check className="stat-check" size={12} />}
    </button>
  );
}
