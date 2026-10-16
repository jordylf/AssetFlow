export type AssetCategory =
  | "References"
  | "Design"
  | "Models"
  | "Textures"
  | "Video"
  | "Audio"
  | "Exports"
  | "Documents"
  | "Other";
export type AssetKind =
  | "Images"
  | "Textures"
  | "3D Models"
  | "Videos"
  | "Audio"
  | "Design Files"
  | "Documents"
  | "Other";
export interface Asset {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  modified: number;
  category: AssetCategory;
  kind: AssetKind;
}
export interface Project {
  name: string;
  path: string;
  assets: Asset[];
  warnings: string[];
  scannedAt: number;
}
export interface MoveOperation {
  from: string;
  to: string;
  size: number;
}
export interface OrganizationPlan {
  id: string;
  operations: MoveOperation[];
  unchanged: number;
}
export interface OrganizationResult {
  moved: number;
  errors: string[];
}
export interface RecentProject {
  name: string;
  path: string;
  openedAt: number;
}
export type View = "Projects" | "Recent" | "Favorites";
