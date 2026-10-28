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
  /** Index into OrganizationPlan.groups for files that move together. */
  group: number | null;
}
export interface DependencyGroup {
  name: string;
  models: string[];
  files: string[];
  destination: string | null;
  blocked: string | null;
}
export interface OrganizationPlan {
  id: string;
  operations: MoveOperation[];
  unchanged: number;
  groups: DependencyGroup[];
}
export interface UndoStatus {
  organizedAt: number;
  moves: number;
  interrupted: boolean;
}
export interface UndoItem {
  from: string;
  to: string;
  size: number;
  conflict: string | null;
}
export interface UndoPlan {
  id: string;
  organizedAt: number;
  interrupted: boolean;
  items: UndoItem[];
  alreadyRestored: number;
}
export interface UndoResult {
  restored: number;
  skipped: number;
  remaining: number;
  errors: string[];
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

export interface HealthIssue { severity: "error" | "warning"; path: string; message: string; }
export interface HealthReport { path: string; checkedAt: number; files: number; models: number; errors: number; warnings: number; issues: HealthIssue[]; truncated: boolean; }
export interface PackageItem { path: string; size: number; category: string; dependency: boolean; }
export interface PackagePlan { id: string; files: PackageItem[]; totalBytes: number; requested: number; issues: string[]; notes: string[]; }
export interface PackageResult { path: string; copied: number; total: number; complete: boolean; error: string | null; }
export interface PackageProgress { id: string; copied: number; total: number; bytes: number; totalBytes: number; file: string; }
