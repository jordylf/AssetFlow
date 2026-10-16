import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid2X2,
  Box,
  RotateCcw,
  ScanLine,
  Minus,
  Plus,
  Star,
  X,
  LoaderCircle,
  CircleAlert,
  FolderOpen,
  MousePointer2,
  ShieldCheck,
} from "lucide-react";
import {
  MathUtils,
  PerspectiveCamera,
  PMREMGenerator,
  Vector3,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Asset } from "../types";
import {
  loadLocalModel,
  type LoadedModel,
  type ModelMetadata,
} from "../lib/model";
import { formatDate, formatSize } from "../lib/format";
import { revealAsset } from "../lib/filesystem";
import "./ModelInspector.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; metadata: ModelMetadata }
  | { status: "error"; message: string };
type CameraAction = { type: "reset" | "in" | "out"; sequence: number };
const number = (value: number) =>
  value.toLocaleString(undefined, { maximumSignificantDigits: 6 });
const coordinates = (values: number[]) => values.map(number).join(" / ");

class ViewportBoundary extends Component<
  { children: ReactNode; onFailure: (message: string) => void },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error) {
    this.props.onFailure(
      `The graphics viewport could not start: ${error.message}`,
    );
  }
  render() {
    return this.state.error ? (
      <div className="model-state" role="alert">
        <CircleAlert size={28} />
        <h3>The 3D viewport is unavailable</h3>
        <p>{this.state.error}</p>
        <small>
          Check that hardware acceleration is enabled, then reopen this asset.
        </small>
      </div>
    ) : (
      this.props.children
    );
  }
}

function StudioScene({
  asset,
  grid,
  wireframe,
  action,
  onState,
  attempt,
}: {
  asset: Asset;
  grid: boolean;
  wireframe: boolean;
  action: CameraAction;
  onState: (state: LoadState) => void;
  attempt: number;
}) {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const [model, setModel] = useState<LoadedModel | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    let loaded: LoadedModel | null = null;
    setModel(null);
    onState({ status: "loading" });
    loadLocalModel(asset, gl, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) {
          result.dispose();
          return;
        }
        loaded = result;
        setModel(result);
        onState({ status: "ready", metadata: result.metadata });
        invalidate();
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          onState({
            status: "error",
            message: String(error instanceof Error ? error.message : error),
          });
      });
    return () => {
      abort.abort();
      loaded?.dispose();
    };
  }, [asset, gl, onState, attempt, invalidate]);

  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.65;
    room.dispose();
    pmrem.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, invalidate]);

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement);
    controls.current = orbit;
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
    orbit.minDistance = 0.08;
    orbit.maxDistance = 100;
    orbit.screenSpacePanning = true;
    gl.domElement.tabIndex = 0;
    gl.domElement.setAttribute(
      "aria-label",
      "Interactive 3D model. Drag to orbit, wheel to zoom, right-drag or arrow keys to pan. R resets the camera.",
    );
    const changed = () => invalidate();
    orbit.listenToKeyEvents(gl.domElement);
    orbit.addEventListener("change", changed);
    return () => {
      orbit.removeEventListener("change", changed);
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, gl, invalidate]);
  const fit = () => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return;
    const halfFov = Math.min(
      MathUtils.degToRad(camera.fov) / 2,
      Math.atan(
        (Math.tan(MathUtils.degToRad(camera.fov) / 2) * size.width) /
          size.height,
      ),
    );
    const distance = ((model?.radius ?? 2) / Math.sin(halfFov)) * 1.12;
    controls.current.enableDamping = false;
    controls.current.update();
    camera.position.copy(
      new Vector3(1.1, 0.7, 1.25).normalize().multiplyScalar(distance),
    );
    camera.near = 0.01;
    camera.far = 300;
    camera.updateProjectionMatrix();
    controls.current.target.set(0, 0, 0);
    controls.current.update();
    controls.current.saveState();
    controls.current.enableDamping = true;
    invalidate();
  };
  useEffect(fit, [camera, model, size.width, size.height]);
  useEffect(() => {
    if (action.type === "reset") {
      fit();
      return;
    }
    const orbit = controls.current;
    if (!orbit) return;
    const offset = camera.position.clone().sub(orbit.target);
    const distance = MathUtils.clamp(
      offset.length() * (action.type === "in" ? 0.8 : 1.25),
      0.08,
      100,
    );
    camera.position.copy(orbit.target).add(offset.setLength(distance));
    orbit.update();
    invalidate();
    // Actions are intentional clicks; viewport resize/model load has its own fitting effect.
  }, [action]);
  useFrame(() => controls.current?.update());

  useEffect(() => {
    const originals = new Map<Material, boolean>();
    for (const material of model?.materials ?? [])
      if ("wireframe" in material) {
        originals.set(material, Boolean(material.wireframe));
        material.wireframe = wireframe;
        material.needsUpdate = true;
      }
    invalidate();
    return () => {
      for (const [material, original] of originals) {
        if ("wireframe" in material) {
          material.wireframe = original;
          material.needsUpdate = true;
        }
      }
    };
  }, [model, wireframe, invalidate]);
  return (
    <>
      <color attach="background" args={["#191c1e"]} />
      <hemisphereLight args={["#ffffff", "#b6bdc2", 0.7]} />
      <directionalLight position={[5, 7, 5]} intensity={2.4} />
      <directionalLight position={[-5, 3, -4]} intensity={1.6} />
      {grid && (
        <gridHelper
          args={[12, 24, "#58615d", "#303739"]}
          position={[0, (model?.floor ?? -1.4) - 0.008, 0]}
        />
      )}
      {model && <primitive object={model.object} dispose={null} />}
    </>
  );
}

export default function ModelInspector({
  asset,
  favorite,
  onFavorite,
  onClose,
}: {
  asset: Asset;
  favorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
}) {
  const [grid, setGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [action, setAction] = useState<CameraAction>({
    type: "reset",
    sequence: 0,
  });
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState("");
  const data = state.status === "ready" ? state.metadata : null;
  const command = (type: CameraAction["type"]) =>
    setAction((current) => ({ type, sequence: current.sequence + 1 }));
  return (
    <div className="model-inspector-shell">
      <header className="model-header">
        <span className="model-header-icon">
          <Box size={20} strokeWidth={1.5} />
        </span>
        <div>
          <span className="model-eyebrow">
            3D ASSET INSPECTOR <i /> {asset.extension.toUpperCase()}
          </span>
          <h2 title={asset.name}>{asset.name}</h2>
        </div>
        <div className="model-header-actions">
          <span className="model-readonly">
            <ShieldCheck size={12} />
            Read only
          </span>
          <button
            className={`icon-button ${favorite ? "is-favorite" : ""}`}
            onClick={onFavorite}
            aria-label="Toggle favorite"
            aria-pressed={favorite}
            title="Toggle favorite"
          >
            <Star size={17} fill={favorite ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-button"
            aria-label="Close 3D inspector"
            title="Close · Esc"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="model-workspace">
        <section className="model-stage" aria-label="Model preview">
          <div className="model-toolbar">
            <span className="studio-label">
              <span className="status-dot" />
              STUDIO<span>Y UP</span>
            </span>
            <div role="group" aria-label="Viewport display">
              <button
                className={grid ? "active" : ""}
                aria-label="Toggle grid"
                aria-pressed={grid}
                onClick={() => setGrid((value) => !value)}
                title="Toggle ground grid"
              >
                <Grid2X2 size={14} />
                <span>Grid</span>
              </button>
              <button
                className={wireframe ? "active" : ""}
                aria-label="Toggle wireframe"
                aria-pressed={wireframe}
                onClick={() => setWireframe((value) => !value)}
                title="Toggle mesh wireframe"
              >
                <ScanLine size={14} />
                <span>Wireframe</span>
              </button>
              <i />
              <button
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => command("in")}
                disabled={!data}
              >
                <Plus size={15} />
              </button>
              <button
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => command("out")}
                disabled={!data}
              >
                <Minus size={15} />
              </button>
              <button
                aria-label="Reset camera"
                title="Fit model · R"
                onClick={() => command("reset")}
                disabled={!data}
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>
          <div
            className="model-canvas"
            onKeyDown={(event) => {
              if (
                event.target instanceof HTMLCanvasElement &&
                event.key.toLowerCase() === "r"
              ) {
                event.preventDefault();
                command("reset");
              }
            }}
          >
            <ViewportBoundary
              key={attempt}
              onFailure={(message) => setState({ status: "error", message })}
            >
              <Canvas
                frameloop="demand"
                dpr={[1, 1.75]}
                camera={{ fov: 38, position: [5, 3, 5], near: 0.01, far: 300 }}
                gl={{ antialias: true, alpha: false }}
                fallback={
                  <div className="model-state" role="alert">
                    <CircleAlert size={28} />
                    <h3>WebGL is unavailable</h3>
                    <p>Enable hardware acceleration to inspect this model.</p>
                  </div>
                }
              >
                <StudioScene
                  asset={asset}
                  grid={grid}
                  wireframe={wireframe}
                  action={action}
                  onState={setState}
                  attempt={attempt}
                />
              </Canvas>
            </ViewportBoundary>
            {state.status === "loading" && (
              <div className="model-state model-state-overlay" role="status">
                <span className="model-loading-icon">
                  <Box size={29} strokeWidth={1.3} />
                </span>
                <h3>Preparing your model</h3>
                <p>Reading geometry, materials, and textures.</p>
                <span>
                  <LoaderCircle size={13} className="spin" />
                  Loading locally
                </span>
              </div>
            )}
            {state.status === "error" && (
              <div className="model-state model-state-overlay" role="alert">
                <CircleAlert size={28} />
                <h3>This model couldn’t be loaded</h3>
                <p>{state.message}</p>
                <button
                  className="button secondary"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  <RotateCcw size={14} />
                  Try again
                </button>
              </div>
            )}
            {data && !data.meshes && (
              <div className="model-empty-note">
                <Box size={17} />
                No mesh geometry in the default scene.
              </div>
            )}
          </div>
          <footer className="model-viewport-footer">
            <span>
              <MousePointer2 size={12} />
              Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Right-drag
              to pan
            </span>
            <span>
              <kbd>R</kbd> Fit model
            </span>
          </footer>
        </section>
        <aside className="model-properties" aria-label="Model metadata">
          <div className="model-properties-heading">
            ASSET DETAILS<span>LOCAL</span>
          </div>
          <dl className="model-file-properties">
            <div>
              <dt>File name</dt>
              <dd title={asset.name}>{asset.name}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatSize(asset.size)}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>glTF 2.0 / {asset.extension.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Modified</dt>
              <dd>{formatDate(asset.modified)}</dd>
            </div>
          </dl>
          <div className="model-meta-section">
            <h3>
              Geometry
              <span>
                {data
                  ? `${data.meshes} ${data.meshes === 1 ? "mesh" : "meshes"}`
                  : "—"}
              </span>
            </h3>
            <div className="model-geometry-stats">
              <div>
                <span>Vertices</span>
                <strong data-testid="model-vertices">
                  {data?.vertices.toLocaleString() ?? "—"}
                </strong>
              </div>
              <div>
                <span>Triangles</span>
                <strong data-testid="model-triangles">
                  {data?.triangles.toLocaleString() ?? "—"}
                </strong>
              </div>
            </div>
          </div>
          <div className="model-meta-section">
            <h3>
              Materials
              <span data-testid="model-materials">
                {data?.materials.length ?? "—"}
              </span>
            </h3>
            {data ? (
              <ul className="model-resource-list">
                {data.materials.map((material, i) => (
                  <li key={i}>
                    <i
                      className="material-swatch"
                      style={{ background: material.color ?? "#858e88" }}
                    />
                    <span title={material.name}>{material.name}</span>
                  </li>
                ))}
                {!data.materials.length && (
                  <li className="model-resource-empty">
                    No materials in this scene
                  </li>
                )}
              </ul>
            ) : (
              <p className="model-meta-placeholder">Waiting for model data</p>
            )}
          </div>
          <div className="model-meta-section">
            <h3>
              Textures
              <span data-testid="model-textures">
                {data?.textures.length ?? "—"}
              </span>
            </h3>
            {data ? (
              <ul className="model-resource-list">
                {data.textures.map((texture, i) => (
                  <li key={i}>
                    <Grid2X2 size={13} />
                    <span title={texture.name}>{texture.name}</span>
                    <small>
                      {texture.width && texture.height
                        ? `${texture.width}×${texture.height}`
                        : "—"}
                    </small>
                  </li>
                ))}
                {!data.textures.length && (
                  <li className="model-resource-empty">
                    No textures in this scene
                  </li>
                )}
              </ul>
            ) : (
              <p className="model-meta-placeholder">Waiting for model data</p>
            )}
          </div>
          <div className="model-meta-section">
            <h3>
              Bounding box<span>SOURCE UNITS</span>
            </h3>
            <div className="model-bounds" data-testid="model-bounds">
              {(["X", "Y", "Z"] as const).map((axis, i) => (
                <div key={axis}>
                  <span className={`model-axis axis-${axis.toLowerCase()}`}>
                    {axis}
                  </span>
                  <span>{data ? number(data.bounds.size[i]) : "—"}</span>
                </div>
              ))}
            </div>
            {data && (
              <dl className="model-bound-extents">
                <div>
                  <dt>Min</dt>
                  <dd>{coordinates(data.bounds.min)}</dd>
                </div>
                <div>
                  <dt>Max</dt>
                  <dd>{coordinates(data.bounds.max)}</dd>
                </div>
              </dl>
            )}
          </div>
          <p className="model-data-note">
            Default scene · geometry totals include instances. Preview centering
            and wireframe never change the source file.
          </p>
          <div className="model-source-path" title={asset.relativePath}>
            {asset.relativePath}
          </div>
          <button
            className="button secondary full-width"
            onClick={() => {
              setActionError("");
              void revealAsset(asset.path).catch((error) =>
                setActionError(String(error)),
              );
            }}
          >
            <FolderOpen size={14} />
            Show in File Explorer
          </button>
          {actionError && (
            <p className="model-action-error" role="alert">
              {actionError}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
