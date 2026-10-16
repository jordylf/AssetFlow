import {
  ArrowRight,
  CheckCheck,
  FolderTree,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import type { OrganizationPlan } from "../types";
import { formatSize } from "../lib/format";
import { Modal } from "./Modal";
export function OrganizationPreview({
  plan,
  busy,
  onClose,
  onConfirm,
}: {
  plan: OrganizationPlan;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const destinations = Object.entries(
    plan.operations.reduce<Record<string, number>>((counts, operation) => {
      const folder = operation.to.split("/")[0];
      counts[folder] = (counts[folder] || 0) + 1;
      return counts;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const pathLabel = (path: string) => {
    const slash = path.lastIndexOf("/");
    return (
      <>
        <span className="path-directory">{path.slice(0, slash + 1)}</span>
        <strong>{path.slice(slash + 1)}</strong>
      </>
    );
  };
  return (
    <Modal
      title="Organization Preview"
      onClose={onClose}
      busy={busy}
      wide
      className="organization-modal"
    >
      <div className="preview-intro">
        <span className="preview-icon">
          <FolderTree size={24} />
        </span>
        <div>
          <span className="eyebrow">REVIEW BEFORE YOU MOVE</span>
          <h3>A place for every asset.</h3>
          <p>
            {plan.operations.length
              ? `Review ${plan.operations.length} proposed moves before making a change.`
              : "Everything is already in the right place."}
          </p>
        </div>
      </div>
      {destinations.length > 0 && (
        <div className="destination-chips" aria-label="Destination folders">
          {destinations.map(([folder, count]) => (
            <span key={folder}>
              <FolderTree size={12} />
              {folder.replace(/^\d+_/, "")}
              <b>{count}</b>
            </span>
          ))}
        </div>
      )}
      <div className="safety-note">
        <ShieldCheck size={16} />
        <span>
          No files have been moved. Existing files will never be overwritten.
        </span>
      </div>
      <div className="move-summary">
        <span>
          <strong>{plan.operations.length}</strong> files to organize
        </span>
        <span>
          {formatSize(plan.operations.reduce((n, o) => n + o.size, 0))}
        </span>
        <span>{plan.unchanged} already organized</span>
      </div>
      {plan.operations.length > 0 ? (
        <div
          className="move-table"
          tabIndex={0}
          aria-label="Proposed file movements"
        >
          <div className="move-table-head">
            <span>BEFORE</span>
            <span />
            <span>AFTER</span>
          </div>
          {plan.operations.map((o) => (
            <div className="move-row" key={o.from}>
              <span title={o.from}>{pathLabel(o.from)}</span>
              <ArrowRight size={14} />
              <span title={o.to}>
                {pathLabel(o.to)}
                {o.from.split("/").pop() !== o.to.split("/").pop() && (
                  <small
                    className="rename-badge"
                    title="Safe filename to avoid overwriting an existing asset"
                  >
                    Renamed
                  </small>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="organized-state">
          <CheckCheck size={36} />
          <p>Nice and tidy. Nothing to move.</p>
        </div>
      )}
      <p className="preview-footnote">
        Files are grouped by type into 01_References through 09_Others.
        Duplicate names receive a safe numbered suffix. Empty source folders are
        kept.
      </p>
      <div className="modal-actions">
        <span className="preview-action-note">
          {busy ? (
            <>
              <LoaderCircle size={13} className="spin" />
              Moving files safely…
            </>
          ) : (
            <>
              <ShieldCheck size={13} />
              You’re in control
            </>
          )}
        </span>
        <button className="button secondary" onClick={onClose} disabled={busy}>
          {plan.operations.length ? "Cancel" : "Close"}
        </button>
        {plan.operations.length > 0 && (
          <motion.button
            className="button primary"
            disabled={busy}
            onClick={onConfirm}
            whileTap={{ scale: 0.99 }}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <CheckCheck size={15} />
            )}{" "}
            {busy ? "Organizing…" : "Confirm Organization"}
          </motion.button>
        )}
      </div>
    </Modal>
  );
}
