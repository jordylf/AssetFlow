import { useState } from "react";
import {
  ArrowRight,
  Box,
  CheckCheck,
  CircleAlert,
  FolderTree,
  Link2,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import type { OrganizationPlan, UndoStatus } from "../types";
import { formatSize } from "../lib/format";
import { Modal } from "./Modal";
export function OrganizationPreview({
  plan,
  busy,
  onClose,
  onConfirm,
  undo = null,
}: {
  undo?: UndoStatus | null;
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
  const [shown, setShown] = useState(400);
  const kept = plan.groups.filter((g) => g.destination);
  const blocked = plan.groups.filter((g) => g.blocked);
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
      {undo && plan.operations.length > 0 && (
        <div className="safety-note warning-note" role="note">
          <CircleAlert size={16} />
          <span>
            Confirming replaces the undo history: {undo.moves}{" "}
            {undo.moves === 1 ? "file" : "files"} from the last organization
            can no longer be restored from AssetFlow.
          </span>
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
      {plan.groups.length > 0 && (
        <section className="dependency-groups" aria-label="Dependency groups">
          <h4>
            <Link2 size={13} />
            Kept together
            <span>
              {kept.length} moving · {blocked.length} left in place
            </span>
          </h4>
          {plan.groups.map((g) => (
            <div
              key={g.models[0]}
              className={`dependency-group ${g.blocked ? "is-blocked" : ""}`}
            >
              <span className="dependency-icon">
                {g.blocked ? <CircleAlert size={14} /> : <Box size={14} />}
              </span>
              <div>
                <strong>
                  {g.models.length > 1
                    ? `${g.models.length} models share resources`
                    : g.models[0].split("/").pop()}
                </strong>
                <small>
                  {g.blocked
                    ? `Stays in place: ${g.blocked}`
                    : g.destination
                      ? `${g.files.length} files → ${g.destination}/ · relative paths preserved`
                      : `${g.files.length} files already organized together`}
                </small>
              </div>
            </div>
          ))}
        </section>
      )}
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
          {plan.operations.slice(0, shown).map((o) => (
            <div className="move-row" key={o.from}>
              <span title={o.from}>{pathLabel(o.from)}</span>
              <ArrowRight size={14} />
              <span title={o.to}>
                {pathLabel(o.to)}
                {o.group !== null && (
                  <small
                    className="rename-badge group-badge"
                    title="Moves with its model so relative references keep working"
                  >
                    Kept together
                  </small>
                )}
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
          {plan.operations.length > shown && (
            <button
              className="button secondary compact move-more"
              onClick={() => setShown((n) => n + 2000)}
            >
              Show more moves ({plan.operations.length - shown} remaining)
            </button>
          )}
        </div>
      ) : (
        <div className="organized-state">
          <CheckCheck size={36} />
          <p>Nice and tidy. Nothing to move.</p>
        </div>
      )}
      <p className="preview-footnote">
        Files are grouped by type into 01_References through 09_Others. GLTF
        and GLB models move together with the local files they reference.
        Duplicate names receive a safe numbered suffix. Empty source folders are
        kept. References inside other file types, such as Blender or video
        projects, are not updated. Only this organization can be undone
        afterwards; it replaces earlier undo history for this project.
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
