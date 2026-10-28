import { useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  History,
  LoaderCircle,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import type { UndoPlan } from "../types";
import { formatDate, formatSize } from "../lib/format";
import { Modal } from "./Modal";

export function UndoPreview({
  plan,
  busy,
  onClose,
  onConfirm,
}: {
  plan: UndoPlan;
  busy: boolean;
  onClose: () => void;
  onConfirm: (skipConflicts: boolean) => void;
}) {
  const [shown, setShown] = useState(400);
  const conflicts = plan.items.filter((i) => i.conflict);
  const ready = plan.items.length - conflicts.length;
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
      title="Undo Organization"
      onClose={onClose}
      busy={busy}
      wide
      className="organization-modal"
    >
      <div className="preview-intro">
        <span className="preview-icon">
          <History size={24} />
        </span>
        <div>
          <span className="eyebrow">REVIEW BEFORE YOU RESTORE</span>
          <h3>Put things back where they were.</h3>
          <p>
            Organized {formatDate(plan.organizedAt)}. {ready} of{" "}
            {plan.items.length} files can return to their original location.
          </p>
        </div>
      </div>
      {plan.interrupted && (
        <div className="safety-note warning-note" role="note">
          <CircleAlert size={16} />
          <span>
            The last organization did not finish. Only files that were actually
            moved are listed.
          </span>
        </div>
      )}
      <div className="safety-note">
        <ShieldCheck size={16} />
        <span>
          No files have been moved yet. Nothing is overwritten or renamed; files
          that cannot return safely are listed with the reason.
        </span>
      </div>
      <div className="move-summary">
        <span>
          <strong>{ready}</strong> files to restore
        </span>
        {conflicts.length > 0 && (
          <span className="conflict-count">
            <strong>{conflicts.length}</strong> need attention
          </span>
        )}
        <span>
          {formatSize(
            plan.items
              .filter((i) => !i.conflict)
              .reduce((n, i) => n + i.size, 0),
          )}
        </span>
        {plan.alreadyRestored > 0 && (
          <span>{plan.alreadyRestored} already restored</span>
        )}
      </div>
      <div className="move-table" tabIndex={0} aria-label="Files to restore">
        <div className="move-table-head">
          <span>ORGANIZED</span>
          <span />
          <span>ORIGINAL</span>
        </div>
        {plan.items.slice(0, shown).map((item) => (
          <div
            className={`move-row ${item.conflict ? "is-conflict" : ""}`}
            key={item.from}
          >
            <span title={item.from}>{pathLabel(item.from)}</span>
            <ArrowRight size={14} />
            <span title={item.to}>
              {pathLabel(item.to)}
              {item.conflict && (
                <small className="conflict-reason">{item.conflict}</small>
              )}
            </span>
          </div>
        ))}
        {plan.items.length > shown && (
          <button
            className="button secondary compact move-more"
            onClick={() => setShown((n) => n + 2000)}
          >
            Show more files ({plan.items.length - shown} remaining)
          </button>
        )}
      </div>
      <p className="preview-footnote">
        {conflicts.length > 0
          ? "Skipped files stay in their organized location and remain undoable after you resolve the conflict. "
          : ""}
        Folders created during organization are kept. If a move fails, the files
        restored before it stay restored and the rest remain undoable.
      </p>
      <div className="modal-actions">
        <span className="preview-action-note">
          {busy ? (
            <>
              <LoaderCircle size={13} className="spin" />
              Restoring files safely…
            </>
          ) : (
            <>
              <ShieldCheck size={13} />
              You’re in control
            </>
          )}
        </span>
        <button className="button secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {ready > 0 && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => onConfirm(conflicts.length > 0)}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Undo2 size={15} />
            )}{" "}
            {conflicts.length
              ? `Restore ${ready}, skip ${conflicts.length}`
              : `Restore ${ready} ${ready === 1 ? "file" : "files"}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
