import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Project,
  OrganizationPlan,
  OrganizationResult,
  UndoPlan,
  UndoResult,
  UndoStatus,
} from "../types";
export const desktop = isTauri();
export async function chooseProject() {
  if (!desktop)
    throw new Error(
      "Folder access is available in the AssetFlow desktop app. Run npm run desktop to open it.",
    );
  const path = await open({
    directory: true,
    multiple: false,
    title: "Open a creative project",
  });
  return typeof path === "string" ? path : null;
}
export async function scanProject(path: string) {
  return hydrateProject(await invoke<Project>("scan_project", { path }));
}
function hydrateProject(project: Project) {
  // Rust omits each asset's absolute path to keep the payload small; it is root + relative path.
  const base = project.path.replace(/[\\/]+$/, "");
  for (const asset of project.assets)
    asset.path = `${base}\\${asset.relativePath.replaceAll("/", "\\")}`;
  return project;
}
export const prepareOrganization = () =>
  invoke<OrganizationPlan>("prepare_organization");
export const confirmOrganization = (planId: string) =>
  invoke<OrganizationResult>("confirm_organization", { planId });
export const cancelOrganization = () => invoke("cancel_organization");
export const undoStatus = () => invoke<UndoStatus | null>("undo_status");
export const prepareUndo = () => invoke<UndoPlan>("prepare_undo");
export const confirmUndo = (planId: string, skipConflicts: boolean) =>
  invoke<UndoResult>("confirm_undo", { planId, skipConflicts });
export const cancelUndo = () => invoke("cancel_undo");
export const openAssetWith = (path: string) => invoke<void>("open_asset_with", { path });
export interface TechnicalMetadata {
  fields: { label: string; value: string }[];
  note: string | null;
}
export const readTechnicalMetadata = (path: string) =>
  invoke<TechnicalMetadata>("read_technical_metadata", { path });
export const exportContactSheet = (title: string, columns: number, assets: { path: string; thumbnail: string | null }[]) =>
  invoke<string | null>("export_contact_sheet", { title, columns, assets });
export const openSavedContactSheet = () => invoke<void>("open_saved_contact_sheet");
export const revealAsset = (path: string) => invoke("reveal_asset", { path });
export const imageExtensions = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"];
export const videoExtensions = ["mp4", "mov", "webm", "mkv"];
export const audioExtensions = ["wav", "mp3", "flac", "aac"];
export function thumbnail(path: string, extension: string) {
  return desktop &&
    ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"].includes(extension)
    ? convertFileSrc(path)
    : undefined;
}

export interface WatchLease { id: number; path: string; active: boolean; error: string | null; }
export const startProjectWatch = () => invoke<WatchLease>("start_project_watch");
export const stopProjectWatch = (id: number) => invoke<void>("stop_project_watch", { id });
export const refreshProject = async (expectedPath: string) => hydrateProject(await invoke<Project>("refresh_project", { expectedPath }));
export const closeProject = () => invoke<void>("close_project");
export const checkProjectHealth = () => invoke<import("../types").HealthReport>("check_project_health");
export const preparePackage = (paths: string[]) => invoke<import("../types").PackagePlan>("prepare_package", { paths });
export const cancelPackagePreview = (planId: string) => invoke<void>("cancel_package_preview", { planId });
export const cancelPackage = () => invoke<void>("cancel_package");
export const confirmPackage = (planId: string) => invoke<import("../types").PackageResult | null>("confirm_package", { planId });
export const openPackageFolder = () => invoke<void>("open_package_folder");
