import type { Asset } from "../types";
import { AssetCard } from "./AssetCard";
import { navigateItems } from "../lib/keyboard";
export function AssetGrid({
  assets,
  favorites,
  onFavorite,
  onSelect,
  thumbnails,
}: {
  assets: Asset[];
  favorites: string[];
  onFavorite: (path: string) => void;
  onSelect: (asset: Asset) => void;
  thumbnails: boolean;
}) {
  return (
    <div
      className="asset-grid"
      aria-label="Asset grid"
      onKeyDown={(event) =>
        navigateItems(
          event,
          ".asset-open",
          getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ")
            .length,
        )
      }
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.path}
          asset={asset}
          favorite={favorites.includes(asset.path)}
          onFavorite={() => onFavorite(asset.path)}
          onSelect={() => onSelect(asset)}
          thumbnails={thumbnails}
        />
      ))}
    </div>
  );
}
