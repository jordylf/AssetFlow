const { chromium } = require(process.env.ASSETFLOW_PLAYWRIGHT || "playwright");

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR4nGN8+PAhAzbAhFV00EoAABE4ArMNF1DjAAAAAElFTkSuQmCC",
  "base64",
);
function build(geometry, embedded) {
  geometry.computeBoundingBox();
  const arrays = [
    geometry.attributes.position.array,
    geometry.attributes.normal.array,
    geometry.attributes.uv.array,
    geometry.index.array,
  ];
  const chunks = arrays.map((a) =>
    Buffer.from(a.buffer, a.byteOffset, a.byteLength),
  );
  let offset = 0;
  const views = chunks.map((buffer, i) => {
    const view = {
      buffer: 0,
      byteOffset: offset,
      byteLength: buffer.length,
      target: i === 3 ? 34963 : 34962,
    };
    offset += buffer.length;
    return view;
  });
  const min = geometry.boundingBox.min.toArray(),
    max = geometry.boundingBox.max.toArray();
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: embedded ? [0, 0, 0] : [120, -30, 50] }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    buffers: [
      {
        byteLength: offset,
        ...(embedded ? {} : { uri: "../mesh%20data/geometry.bin" }),
      },
    ],
    bufferViews: views,
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: geometry.attributes.position.count,
        type: "VEC3",
        min,
        max,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: geometry.attributes.normal.count,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: geometry.attributes.uv.count,
        type: "VEC2",
      },
      {
        bufferView: 3,
        componentType:
          geometry.index.array instanceof Uint16Array ? 5123 : 5125,
        count: geometry.index.count,
        type: "SCALAR",
      },
    ],
    materials: [
      {
        name: "Satin ceramic",
        pbrMetallicRoughness: {
          baseColorFactor: [0.55, 0.7, 0.62, 1],
          metallicFactor: 0.3,
          roughnessFactor: 0.32,
          baseColorTexture: { index: 0 },
        },
      },
    ],
    textures: [{ source: 0 }],
    images: [
      {
        name: "Base color",
        ...(embedded
          ? { bufferView: 4, mimeType: "image/png" }
          : { uri: "../textures/base%20color.png" }),
      },
    ],
  };
  if (embedded) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: png.length });
    chunks.push(png);
    offset += png.length;
    doc.buffers[0].byteLength = offset;
  }
  const bytes = Buffer.concat(chunks);
  return {
    doc,
    bytes,
    vertices: geometry.attributes.position.count,
    triangles: geometry.index.count / 3,
  };
}
function glb({ doc, bytes }) {
  const json = Buffer.from(JSON.stringify(doc));
  const jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 32);
  const binPad = Buffer.alloc((4 - (bytes.length % 4)) % 4);
  const length =
    12 + 8 + json.length + jsonPad.length + 8 + bytes.length + binPad.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(length, 8);
  header.writeUInt32LE(json.length + jsonPad.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8);
  bin.writeUInt32LE(bytes.length + binPad.length);
  bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, jsonPad, bin, bytes, binPad]);
}
(async () => {
  const { BoxGeometry, TorusKnotGeometry } = await import("three");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "AssetFlow 3D QA "));
  for (const folder of ["Models", "textures", "mesh data"])
    fs.mkdirSync(path.join(root, folder));
  const box = build(new BoxGeometry(2, 3, 4), false),
    knot = build(new TorusKnotGeometry(1, 0.3, 120, 16), true);
  fs.writeFileSync(
    path.join(root, "Models", "Offset box.gltf"),
    JSON.stringify(box.doc),
  );
  fs.writeFileSync(path.join(root, "mesh data", "geometry.bin"), box.bytes);
  fs.writeFileSync(path.join(root, "textures", "base color.png"), png);
  fs.writeFileSync(path.join(root, "Studio knot.glb"), glb(knot));
  fs.writeFileSync(
    path.join(root, "Broken.gltf"),
    JSON.stringify({
      ...box.doc,
      buffers: [{ uri: "missing.bin", byteLength: box.bytes.length }],
    }),
  );
  fs.writeFileSync(
    path.join(root, "Remote.gltf"),
    JSON.stringify({
      ...box.doc,
      buffers: [
        {
          uri: "https://example.com/private.bin",
          byteLength: box.bytes.length,
        },
      ],
    }),
  );
  const snapshot = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? snapshot(path.join(dir, e.name))
          : [
              createHash("sha256")
                .update(fs.readFileSync(path.join(dir, e.name)))
                .digest("hex"),
            ],
      )
      .sort();
  const original = snapshot(root);
  const browser = await chromium.connectOverCDP(
    process.env.ASSETFLOW_CDP || "http://127.0.0.1:9223",
  );
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.getByRole("heading", { name: "Your work, in order." }).waitFor();
  await page.waitForTimeout(250);
  if (new URL(page.url()).hostname === 'tauri.localhost') {
    const policies = await page.evaluate(async()=>({main:(await fetch('/')).headers.get('content-security-policy'),worker:(await fetch('/decoders/basis/worker.js')).headers.get('content-security-policy')}));
    assert.ok(policies.main && !policies.main.includes("'unsafe-eval'"),'The app must keep its strict script policy');
    assert.ok(policies.worker?.includes("'unsafe-eval'") && policies.worker.includes("connect-src 'none'"),'Only the isolated decoder worker may evaluate JS, with no network access');
  }
  await page.evaluate(async (root) => {
    await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
      event: "tauri://drag-drop",
      payload: { paths: [root], position: { x: 400, y: 300 } },
    });
  }, root);
  await page
    .getByRole("heading", { name: path.basename(root), exact: true })
    .waitFor();
  const dialog = page.getByRole("dialog", { name: "3D asset inspector" });
  await page
    .getByRole("button", { name: "Inspect Offset box.gltf", exact: true })
    .click();
  await dialog.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="model-vertices"]')?.textContent ===
      "24",
  );
  assert.equal(await page.getByTestId("model-triangles").textContent(), "12");
  assert.equal(await page.getByTestId("model-materials").textContent(), "1");
  assert.equal(await page.getByTestId("model-textures").textContent(), "1");
  assert.deepEqual(
    await page
      .getByTestId("model-bounds")
      .locator("div>span:last-child")
      .allTextContents(),
    ["2", "3", "4"],
  );
  const canvas = dialog.locator("canvas");
  await canvas.waitFor();
  await page.waitForTimeout(1000);
  const image = () => canvas.screenshot();
  const before = await image();
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.7,
    bounds.y + bounds.height * 0.6,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(700);
  assert.notDeepEqual(
    await image(),
    before,
    "Orbit must change the rendered camera view",
  );
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.waitForTimeout(700);
  assert.deepEqual(
    await image(),
    before,
    "Reset must restore the initial fitted camera",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(400);
  assert.notDeepEqual(
    await image(),
    before,
    "Zoom must change the rendered camera view",
  );
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await page.waitForTimeout(400);
  const grid = page.getByRole("button", { name: "Toggle grid" });
  await grid.click();
  assert.equal(await grid.getAttribute("aria-pressed"), "false");
  assert.notDeepEqual(
    await image(),
    before,
    "Grid toggle must change the viewport",
  );
  await grid.click();
  const wireframe = page.getByRole("button", { name: "Toggle wireframe" });
  await wireframe.click();
  assert.equal(await wireframe.getAttribute("aria-pressed"), "true");
  await page.waitForTimeout(400);
  assert.notDeepEqual(await image(), before, "Wireframe must change rendering");
  await wireframe.click();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Inspect Studio knot.glb", exact: true })
    .click();
  await dialog.waitFor();
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('[data-testid="model-vertices"]')
        ?.textContent?.replace(/\D/g, "") === String(expected),
    knot.vertices,
  );
  assert.equal(
    (await page.getByTestId("model-triangles").textContent()).replace(
      /\D/g,
      "",
    ),
    String(knot.triangles),
  );
  assert.equal(await page.getByTestId("model-textures").textContent(), "1");
  await page.waitForTimeout(700);
  fs.mkdirSync("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/model-inspector.png" });
  await page
    .getByRole("button", { name: "Toggle favorite", exact: true })
    .click();
  await page.keyboard.press("Escape");
  for (const name of ["Broken.gltf", "Remote.gltf"]) {
    await page
      .getByRole("button", { name: `Inspect ${name}`, exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "This model couldn’t be loaded",
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Escape");
  }
  assert.deepEqual(
    snapshot(root),
    original,
    "Inspecting models must never modify source assets",
  );
  assert.deepEqual(errors, [], "No uncaught errors");
  console.log(
    `3D inspector passed: GLTF/GLB, relative buffers/textures, counts, bounds, orbit, zoom, reset, toggles, errors, read-only. Fixture: ${root}`,
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
