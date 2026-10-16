import { Search, X } from "lucide-react";
import type { RefObject } from "react";
export function SearchBar({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="search-bar">
      <Search size={16} />
      <input
        ref={inputRef}
        aria-label="Search assets"
        placeholder="Search assets..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
          if (event.key === "ArrowDown") {
            const first = document.querySelector<HTMLButtonElement>(
              ".asset-open, .file-name-button",
            );
            if (first) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      />
      {value ? (
        <button
          className="icon-button"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      ) : (
        <kbd>/</kbd>
      )}
    </div>
  );
}
