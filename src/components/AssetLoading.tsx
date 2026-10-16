import { motion, useReducedMotion } from "framer-motion";
import { FolderSearch, ShieldCheck } from "lucide-react";

export function AssetLoading() {
  const reduceMotion = useReducedMotion();
  return (
    <div className="asset-loading" role="status" aria-live="polite">
      <div className="loading-copy">
        <span className="loading-icon">
          <FolderSearch size={23} />
        </span>
        <h3>Getting to know your project</h3>
        <p>Reading folders and classifying assets.</p>
        <span>
          <ShieldCheck size={12} />
          Your files stay exactly where they are.
        </span>
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <motion.div
            key={i}
            className="skeleton-card"
            animate={reduceMotion ? {} : { opacity: [0.35, 0.65, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.08 }}
          >
            <div />
            <span />
            <small />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
