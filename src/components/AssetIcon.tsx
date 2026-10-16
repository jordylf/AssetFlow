import {
  AudioLines,
  Box,
  File,
  FileImage,
  FileText,
  Film,
  Layers,
  Palette,
  ScanLine,
  type LucideIcon,
} from "lucide-react";
import type { AssetCategory } from "../types";
export const icons: Record<AssetCategory, LucideIcon> = {
  References: FileImage,
  Design: Palette,
  Models: Box,
  Textures: ScanLine,
  Video: Film,
  Audio: AudioLines,
  Exports: Layers,
  Documents: FileText,
  Other: File,
};
export function AssetIcon({
  category,
  size = 24,
}: {
  category: AssetCategory;
  size?: number;
}) {
  const Icon = icons[category];
  return <Icon size={size} strokeWidth={1.35} />;
}
