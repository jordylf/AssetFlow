import { Star } from "lucide-react";
import type { Asset } from "../types";
import { AssetIcon } from "./AssetIcon";
import { categoryColors, formatDate, formatSize } from "../lib/format";
import { navigateItems } from "../lib/keyboard";
export function AssetList({
  assets,
  favorites,
  onFavorite,
  onSelect,
}: {
  assets: Asset[];
  favorites: string[];
  onFavorite: (path: string) => void;
  onSelect: (asset: Asset) => void;
}) {
  return (
    <div
      className="asset-table-wrap"
      onKeyDown={(event) => navigateItems(event, ".file-name-button")}
    >
      <table className="asset-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Size</th>
            <th>Modified</th>
            <th>
              <span className="sr-only">Favorite</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.path}>
              <td>
                <button
                  className="file-name-button"
                  onClick={() => onSelect(a)}
                >
                  <span style={{ color: categoryColors[a.category] }}>
                    <AssetIcon category={a.category} size={20} />
                  </span>
                  <span>
                    <strong>{a.name}</strong>
                    <small title={a.relativePath}>{a.relativePath}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className="category-tag">
                  <i style={{ background: categoryColors[a.category] }} />
                  {a.category}
                </span>
              </td>
              <td>{formatSize(a.size)}</td>
              <td>{formatDate(a.modified)}</td>
              <td>
                <button
                  className={`icon-button ${favorites.includes(a.path) ? "is-favorite" : ""}`}
                  onClick={() => onFavorite(a.path)}
                  aria-label={`Toggle favorite for ${a.name}`}
                  aria-pressed={favorites.includes(a.path)}
                >
                  <Star
                    size={14}
                    fill={favorites.includes(a.path) ? "currentColor" : "none"}
                  />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
