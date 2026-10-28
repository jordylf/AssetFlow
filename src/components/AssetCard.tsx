import { useRef, useState } from "react";
import { Star } from "lucide-react";
import type { Asset } from "../types";
import { AssetIcon } from "./AssetIcon";
import { categoryColors, formatDate, formatSize } from "../lib/format";
import { useThumbnail } from "../lib/thumbnails";
export function AssetArtwork({
  asset,
  thumbnails = true,
}: {
  asset: Asset;
  thumbnails?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const preview = useThumbnail(asset, thumbnails, ref);
  return (
    <div
      ref={ref}
      className={`asset-artwork art-${asset.category.toLowerCase()}`}
      style={
        {
          "--asset-color": categoryColors[asset.category],
        } as React.CSSProperties
      }
    >
      {preview.supported && !preview.failed ? (
        <>
          <span
            className={`thumbnail-placeholder ${loaded && preview.url ? "ready" : ""}`}
            aria-hidden="true"
          >
            <AssetIcon category={asset.category} size={30} />
          </span>
          {preview.url && (
            <img
              src={preview.url}
              onLoad={() => setLoaded(true)}
              className={loaded ? "thumbnail-loaded" : "thumbnail-pending"}
              alt={asset.name}
            />
          )}
        </>
      ) : (
        <>
          <div className="art-orbit" />
          <AssetIcon category={asset.category} size={40} />
          <span className="art-extension">{asset.extension || "FILE"}</span>
        </>
      )}
    </div>
  );
}
export function AssetCard({
  asset,
  favorite,
  onFavorite,
  onSelect,
  thumbnails,
}: {
  asset: Asset;
  favorite: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  thumbnails: boolean;
}) {
  return (
    <article className="asset-card">
      <button
        className="asset-open"
        onClick={onSelect}
        aria-label={`Inspect ${asset.name}`}
      >
        <AssetArtwork asset={asset} thumbnails={thumbnails} />
        <div className="asset-caption">
          <strong title={asset.name}>{asset.name}</strong>
          <div>
            <span>{asset.extension.toUpperCase() || "FILE"}</span>
            <i />
            {formatSize(asset.size)}
          </div>
          <div className="asset-date">
            {formatDate(asset.modified)}
            <span style={{ color: categoryColors[asset.category] }}>
              {asset.category}
            </span>
          </div>
        </div>
      </button>
      <button
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
        aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${asset.name}`}
        aria-pressed={favorite}
        onClick={onFavorite}
      >
        <Star size={14} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
