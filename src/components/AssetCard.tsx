import { useState } from "react";
import { Star } from "lucide-react";
import type { Asset } from "../types";
import { AssetIcon } from "./AssetIcon";
import { categoryColors, formatDate, formatSize } from "../lib/format";
import { thumbnail } from "../lib/filesystem";
export function AssetArtwork({
  asset,
  thumbnails = true,
}: {
  asset: Asset;
  thumbnails?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = thumbnails ? thumbnail(asset.path, asset.extension) : undefined;
  return (
    <div
      className={`asset-artwork art-${asset.category.toLowerCase()}`}
      style={
        {
          "--asset-color": categoryColors[asset.category],
        } as React.CSSProperties
      }
    >
      {src && !failed ? (
        <>
          <span
            className={`thumbnail-placeholder ${loaded ? "ready" : ""}`}
            aria-hidden="true"
          >
            <AssetIcon category={asset.category} size={30} />
          </span>
          <img
            loading="lazy"
            src={src}
            onError={() => setFailed(true)}
            onLoad={() => setLoaded(true)}
            className={loaded ? "thumbnail-loaded" : "thumbnail-pending"}
            alt={asset.name}
          />
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
