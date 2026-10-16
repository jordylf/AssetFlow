import type { KeyboardEvent } from "react";

// Keep native Tab/Enter behavior; arrow keys move between peers in a collection.
export function navigateItems(
  event: KeyboardEvent<HTMLElement>,
  selector: string,
  columns = 1,
) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const item = (event.target as HTMLElement).closest(selector);
  if (!item) return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(selector),
  );
  const index = items.indexOf(item as HTMLButtonElement);
  const offsets: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
    Home: -items.length,
    End: items.length,
  };
  if (index < 0 || !(event.key in offsets)) return;
  event.preventDefault();
  if (event.key === "ArrowUp" && index < columns) return;
  if (
    event.key === "ArrowDown" &&
    Math.floor(index / columns) === Math.floor((items.length - 1) / columns)
  )
    return;
  items[
    Math.max(0, Math.min(items.length - 1, index + offsets[event.key]))
  ]?.focus();
}
