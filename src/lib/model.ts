import { invoke } from "@tauri-apps/api/core";
import {
  Box3,
  BufferGeometry,
  Group,
  LoadingManager,
  Material,
  Mesh,
  Texture,
  Vector3,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { Asset } from "../types";

export interface ModelMetadata {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: { name: string; color: string | null }[];
  textures: { name: string; width: number; height: number }[];
  bounds: { min: number[]; max: number[]; size: number[] };
}
export interface LoadedModel {
  object: Group;
  metadata: ModelMetadata;
  floor: number;
  radius: number;
  materials: Material[];
  dispose: () => void;
}
type Manifest = {
  buffers?: { uri?: string }[];
  images?: { uri?: string; mimeType?: string }[];
};

function manifestFrom(data: ArrayBuffer): Manifest {
  if (
    data.byteLength >= 20 &&
    new DataView(data).getUint32(0, true) === 0x46546c67
  ) {
    const view = new DataView(data);
    if (
      view.getUint32(4, true) !== 2 ||
      view.getUint32(16, true) !== 0x4e4f534a
    )
      throw new Error("This is not a valid glTF 2.0 binary.");
    const size = view.getUint32(12, true);
    if (20 + size > data.byteLength)
      throw new Error("The GLB file is incomplete.");
    return JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, size)));
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
}
async function readResource(modelPath: string, resource: string | null) {
  const result = await invoke<ArrayBuffer | number[]>("read_model_resource", {
    modelPath,
    resource,
  });
  return result instanceof ArrayBuffer ? result : new Uint8Array(result).buffer;
}
function textureSet(materials: Iterable<Material>) {
  const textures = new Set<Texture>();
  for (const material of materials)
    for (const value of Object.values(material))
      if (value instanceof Texture) textures.add(value);
  return textures;
}
function disposeScenes(scenes: Object3D[]) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  for (const scene of scenes)
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      }
    });
  const images = new Set<ImageBitmap>();
  for (const texture of textureSet(materials)) {
    if (
      typeof ImageBitmap !== "undefined" &&
      texture.source.data instanceof ImageBitmap
    )
      images.add(texture.source.data);
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
function inspect(gltf: GLTF): LoadedModel {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene, true);
  if (bounds.isEmpty()) bounds.set(new Vector3(), new Vector3());
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  if (![...size.toArray(), ...center.toArray()].every(Number.isFinite))
    throw new Error("The model contains invalid geometry bounds.");
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  const materials = new Set<Material>();
  scene.traverse((object) => {
    if ("isLight" in object && object.isLight) object.visible = false;
    if (!(object instanceof Mesh)) return;
    meshes++;
    const instances =
      "isInstancedMesh" in object && object.isInstancedMesh
        ? Number((object as Mesh & { count: number }).count)
        : 1;
    const count = object.geometry.getAttribute("position")?.count ?? 0;
    vertices += count * instances;
    triangles +=
      Math.floor((object.geometry.index?.count ?? count) / 3) * instances;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      materials.add(material);
  });
  const textures = textureSet(materials);
  const metadata: ModelMetadata = {
    vertices,
    triangles,
    meshes,
    materials: [...materials].map((material, i) => ({
      name: material.name || `Material ${i + 1}`,
      color:
        "color" in material &&
        material.color &&
        typeof material.color === "object" &&
        "getHexString" in material.color
          ? `#${(material.color as { getHexString: () => string }).getHexString()}`
          : null,
    })),
    textures: [...textures].map((texture, i) => ({
      name: texture.name || `Texture ${i + 1}`,
      width: Number(
        (texture.image as { width?: number } | undefined)?.width ?? 0,
      ),
      height: Number(
        (texture.image as { height?: number } | undefined)?.height ?? 0,
      ),
    })),
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      size: size.toArray(),
    },
  };
  const max = Math.max(size.x, size.y, size.z);
  const scale = max > 0 ? 2.8 / max : 1;
  const offset = new Group();
  offset.position.copy(center).negate();
  offset.add(scene);
  const object = new Group();
  object.add(offset);
  object.scale.setScalar(scale);
  return {
    object,
    metadata,
    materials: [...materials],
    floor: (-size.y * scale) / 2,
    radius: Math.max((size.length() * scale) / 2, 0.6),
    dispose: () => disposeScenes(gltf.scenes),
  };
}

export async function loadLocalModel(
  asset: Asset,
  renderer: WebGLRenderer,
  signal: AbortSignal,
): Promise<LoadedModel> {
  const urls: string[] = [];
  const resources = new Map<string, string>();
  const failures: string[] = [];
  const check = () => {
    if (signal.aborted)
      throw new DOMException("Model loading cancelled.", "AbortError");
  };
  const manager = new LoadingManager();
  manager.onError = (url) =>
    failures.push(
      [...resources.entries()].find(([, value]) => value === url)?.[0] ??
        "an embedded image or decoder",
    );
  const decoders = new URL("/decoders/", window.location.href).href;
  manager.setURLModifier((url) => {
    const local = resources.get(url);
    if (local) return local;
    if (
      url.startsWith("blob:") ||
      url.startsWith("data:") ||
      url.startsWith(decoders) ||
      url.startsWith("/decoders/")
    )
      return url;
    throw new Error(
      "Models may only reference local files inside the open project.",
    );
  });
  const draco = new DRACOLoader(manager)
    .setDecoderPath(`${decoders}draco/`)
    .setWorkerLimit(2);
  const ktx = new KTX2Loader(manager)
    .setTranscoderPath(`${decoders}basis/`)
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const initializeBasis = ktx.init.bind(ktx);
  ktx.init = () =>
    initializeBasis().then(() => {
      ktx.workerPool.setWorkerCreator(() => {
        const worker = new Worker(`${decoders}basis/worker.js`);
        const transcoderBinary = ktx.transcoderBinary!.slice(0);
        worker.postMessage(
          { type: "init", config: ktx.workerConfig, transcoderBinary },
          [transcoderBinary],
        );
        return worker;
      });
    });
  let gltf: GLTF | undefined;
  try {
    const data = await readResource(asset.path, null);
    check();
    const manifest = manifestFrom(data);
    let bytes = data.byteLength;
    for (const entry of [
      ...(manifest.buffers ?? []),
      ...(manifest.images ?? []),
    ]) {
      const uri = entry.uri;
      if (!uri || uri.startsWith("data:") || resources.has(uri)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || /^[\\/]/.test(uri))
        throw new Error(
          "This model references an external URL or absolute path. Keep its resources inside the project.",
        );
      let decoded: string;
      try {
        decoded = decodeURIComponent(uri);
      } catch {
        throw new Error(`Invalid resource URI: ${uri}`);
      }
      check();
      const resource = await readResource(asset.path, decoded);
      check();
      bytes += resource.byteLength;
      if (bytes > 768 * 1024 * 1024)
        throw new Error(
          "This model exceeds the lightweight inspector’s 768 MB resource budget.",
        );
      const mime =
        "mimeType" in entry && typeof entry.mimeType === "string"
          ? entry.mimeType
          : ((
              {
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                webp: "image/webp",
                avif: "image/avif",
                ktx2: "image/ktx2",
              } as Record<string, string>
            )[decoded.split(".").pop()?.toLowerCase() ?? ""] ??
            "application/octet-stream");
      const url = URL.createObjectURL(new Blob([resource], { type: mime }));
      urls.push(url);
      resources.set(uri, url);
    }
    const loader = new GLTFLoader(manager)
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx)
      .setMeshoptDecoder(MeshoptDecoder);
    gltf = await loader.parseAsync(data, "");
    check();
    if (failures.length)
      throw new Error(
        `Could not decode ${failures.join(", ")}. Check the model’s textures and resources.`,
      );
    return inspect(gltf);
  } catch (error) {
    if (gltf) disposeScenes(gltf.scenes);
    throw error;
  } finally {
    for (const url of urls) URL.revokeObjectURL(url);
    draco.dispose();
    ktx.dispose();
  }
}
