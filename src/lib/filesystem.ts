import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project, OrganizationPlan, OrganizationResult } from "../types";
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
export const scanProject = (path: string) =>
  invoke<Project>("scan_project", { path });
export const prepareOrganization = () =>
  invoke<OrganizationPlan>("prepare_organization");
export const confirmOrganization = (planId: string) =>
  invoke<OrganizationResult>("confirm_organization", { planId });
export const cancelOrganization = () => invoke("cancel_organization");
export const revealAsset = (path: string) => invoke("reveal_asset", { path });
export function thumbnail(path: string, extension: string) {
  return desktop &&
    ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"].includes(extension)
    ? convertFileSrc(path)
    : undefined;
}
