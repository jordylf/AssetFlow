import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
export function Modal({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  className = "",
  hideHeading = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  className?: string;
  hideHeading?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture before a child's autoFocus runs; native showModal would remember that child.
  const opener = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener.current?.isConnected)
        opener.current.focus({ preventScroll: true });
    };
  }, []);
  return (
    <motion.dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""} ${className}`}
      aria-label={title}
      aria-busy={busy}
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {!hideHeading && (
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {children}
    </motion.dialog>
  );
}
