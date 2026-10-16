import { useEffect, useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "./Modal";

export interface PaletteCommand {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  disabled?: boolean;
  shortcut?: string;
  active?: boolean;
}

export function CommandPalette({
  commands,
  onRun,
  onClose,
}: {
  commands: PaletteCommand[];
  onRun: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const filtered = commands.filter((command) =>
    `${command.label} ${command.detail}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const enabled = filtered.filter((command) => !command.disabled);
  const selected = enabled[active] ?? enabled[0];
  useEffect(() => {
    document
      .getElementById(`${id}-${selected?.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [id, selected?.id]);

  return (
    <Modal
      title="Command palette"
      onClose={onClose}
      className="command-palette"
      hideHeading
    >
      <div className="palette-search">
        <Search size={19} strokeWidth={1.6} />
        <input
          autoFocus
          role="combobox"
          aria-label="Search commands"
          aria-expanded="true"
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={selected ? `${id}-${selected.id}` : undefined}
          placeholder="What would you like to do?"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive((current) =>
                enabled.length
                  ? (Math.min(current, enabled.length - 1) +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      enabled.length) %
                    enabled.length
                  : 0,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (selected) onRun(selected.id);
            }
          }}
        />
        <button
          className="palette-escape"
          onClick={onClose}
          aria-label="Close command palette"
        >
          <kbd>Esc</kbd>
        </button>
      </div>
      <div className="palette-section-label">
        {query ? "RESULTS" : "WORKSPACE COMMANDS"}
        <span>{filtered.length}</span>
      </div>
      <div
        id={`${id}-results`}
        role="listbox"
        aria-label="Commands"
        className="palette-results"
      >
        {filtered.map((command) => (
          <div
            key={command.id}
            id={`${id}-${command.id}`}
            role="option"
            aria-label={command.label}
            aria-selected={selected?.id === command.id}
            aria-disabled={!!command.disabled}
            onMouseDown={(event) => event.preventDefault()}
            className={`palette-option ${selected?.id === command.id ? "selected" : ""} ${command.disabled ? "disabled" : ""}`}
            onPointerMove={() => {
              const index = enabled.indexOf(command);
              if (index >= 0) setActive(index);
            }}
            onClick={() => {
              if (!command.disabled) onRun(command.id);
            }}
          >
            <span className="command-icon">
              <command.icon size={18} strokeWidth={1.5} />
            </span>
            <span className="command-copy">
              <strong>{command.label}</strong>
              <small>{command.detail}</small>
            </span>
            {command.active && <span className="command-current">Current</span>}
            {command.shortcut ? (
              <kbd>{command.shortcut}</kbd>
            ) : (
              selected?.id === command.id && (
                <CornerDownLeft className="command-enter" size={15} />
              )
            )}
          </div>
        ))}
        {!filtered.length && (
          <div className="palette-empty">
            <SearchX size={24} />
            <strong>No matching commands</strong>
            <p>Try “open”, “view”, or “settings”.</p>
          </div>
        )}
      </div>
      <div className="palette-footer">
        <span>
          <kbd>
            <ArrowUp size={10} />
            <ArrowDown size={10} />
          </kbd>
          Navigate
        </span>
        <span>
          <kbd>
            <CornerDownLeft size={11} />
          </kbd>
          Run command
        </span>
        <span className="palette-brand">AssetFlow</span>
      </div>
    </Modal>
  );
}
