// Release-build benchmark. Uses disposable fixtures in %TEMP%\assetflow-bench and never writes to them
// after creation. Usage: node scripts/perf-bench.cjs <label> [exe]
const { chromium } = require(process.env.ASSETFLOW_PLAYWRIGHT || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { spawn, execFileSync } = require("node:child_process");

const label = process.argv[2] || "run";
const exe = path.resolve(
  process.argv[3] || "src-tauri/target/release/assetflow.exe",
);
const benchRoot = path.join(os.tmpdir(), "assetflow-bench");
const PORT = 9229;

function crc32(buf) {
  let c,
    crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function png(size, seed) {
  const row = 1 + size * 3;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * row + 1 + x * 3;
      raw[i] = (x + seed * 37) & 255;
      raw[i + 1] = (y + seed * 11) & 255;
      raw[i + 2] = ((x ^ y) + seed) & 255;
    }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function glb(texture) {
  const { SphereGeometry } = await import("three");
  const g = new SphereGeometry(1, 512, 256);
  const arrays = [
    g.attributes.position.array,
    g.attributes.normal.array,
    g.attributes.uv.array,
    g.index.array,
  ];
  const chunks = arrays.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  chunks.push(texture);
  let offset = 0;
  const views = chunks.map((b) => {
    const v = { buffer: 0, byteOffset: offset, byteLength: b.length };
    offset += b.length + ((4 - (b.length % 4)) % 4);
    return v;
  });
  const padded = Buffer.concat(
    chunks.flatMap((b) => [b, Buffer.alloc((4 - (b.length % 4)) % 4)]),
  );
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 4, mimeType: "image/png" }],
    buffers: [{ byteLength: padded.length }],
    bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: g.attributes.position.count, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5126, count: g.attributes.normal.count, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: g.attributes.uv.count, type: "VEC2" },
      { bufferView: 3, componentType: g.index.array instanceof Uint16Array ? 5123 : 5125, count: g.index.count, type: "SCALAR" },
    ],
  };
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + padded.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(8);
  bin.writeUInt32LE(padded.length);
  bin.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, json, bin, padded]), vertices: g.attributes.position.count };
}
const fixtures = {
  small: { files: 200, images: 40, folders: 5 },
  medium: { files: 5000, images: 400, folders: 50 },
  large: { files: 50000, images: 2000, folders: 500 },
};
async function ensureFixture(name, spec) {
  const root = path.join(benchRoot, name);
  const marker = path.join(root, ".complete");
  if (fs.existsSync(marker)) return root;
  fs.rmSync(root, { recursive: true, force: true });
  const images = [0, 1, 2, 3].map((s) => png(2048, s));
  const model = await glb(png(2048, 9));
  for (let f = 0; f < spec.folders; f++)
    fs.mkdirSync(path.join(root, `shot_${String(f).padStart(3, "0")}`, "sub"), { recursive: true });
  const exts = ["txt", "md", "psd", "blend", "mp4", "wav", "pdf", "json"];
  for (let i = 0; i < spec.files - 1; i++) {
    const folder = path.join(root, `shot_${String(i % spec.folders).padStart(3, "0")}`, i % 3 ? "sub" : "");
    if (i < spec.images)
      fs.writeFileSync(path.join(folder, `${i % 2 ? "wall_normal" : "ref"}_${i}.png`), images[i % 4]);
    else fs.writeFileSync(path.join(folder, `asset_${i}.${exts[i % exts.length]}`), `fixture ${i}\n`);
  }
  fs.writeFileSync(path.join(root, "bench-model.glb"), model.bytes);
  fs.writeFileSync(marker, JSON.stringify({ ...spec, modelVertices: model.vertices }));
  return root;
}
function tree(rootPid) {
  const out = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime | ConvertTo-Json -Compress"],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  );
  const all = JSON.parse(out);
  const ids = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of all)
      if (ids.has(p.ParentProcessId) && !ids.has(p.ProcessId)) {
        ids.add(p.ProcessId);
        grew = true;
      }
  }
  const procs = all.filter((p) => ids.has(p.ProcessId));
  const sum = (k) => procs.reduce((n, p) => n + Number(p[k] || 0), 0);
  return {
    pids: [...ids],
    count: procs.length,
    workingSetMB: +(sum("WorkingSetSize") / 2 ** 20).toFixed(1),
    privateMB: +(sum("PrivatePageCount") / 2 ** 20).toFixed(1),
    cpu100ns: sum("KernelModeTime") + sum("UserModeTime"),
  };
}
function gpu(pids) {
  try {
    const script = `$c=Get-Counter -Counter '\\GPU Engine(*)\\Utilization Percentage','\\GPU Process Memory(*)\\Dedicated Usage' -ErrorAction SilentlyContinue; $c.CounterSamples | Select-Object InstanceName,Path,CookedValue | ConvertTo-Json -Compress`;
    const rows = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", maxBuffer: 64 << 20 }));
    const mine = rows.filter((r) => pids.some((p) => r.InstanceName.includes(`pid_${p}_`)));
    return {
      utilPct: +mine.filter((r) => /utilization/i.test(r.Path)).reduce((n, r) => n + r.CookedValue, 0).toFixed(1),
      dedicatedMB: +(mine.filter((r) => /dedicated/i.test(r.Path)).reduce((n, r) => n + r.CookedValue, 0) / 2 ** 20).toFixed(1),
    };
  } catch {
    return { utilPct: null, dedicatedMB: null };
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cores = os.cpus().length;
async function cpuWindow(pid, ms) {
  const a = tree(pid);
  const t = Date.now();
  await sleep(ms);
  const b = tree(pid);
  return +(((b.cpu100ns - a.cpu100ns) / 1e4 / (Date.now() - t) / cores) * 100).toFixed(2);
}
async function measured(pid, fn) {
  const a = tree(pid);
  const t = Date.now();
  const value = await fn();
  const wall = Date.now() - t;
  const b = tree(pid);
  return { wall, cpuPct: +(((b.cpu100ns - a.cpu100ns) / 1e4 / wall / cores) * 100).toFixed(1), value };
}
const frameMonitor = () => {
  window.__frames = [];
  window.__monitor = true;
  let last = performance.now();
  const loop = (t) => {
    window.__frames.push(t - last);
    last = t;
    if (window.__monitor) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
const frameStats = () => {
  const f = window.__frames || [];
  window.__frames = [];
  window.__monitor = false;
  return { maxFrameMs: Math.round(Math.max(0, ...f)), longFrames: f.filter((x) => x > 50).length };
};

(async () => {
  const roots = {};
  for (const [name, spec] of Object.entries(fixtures)) roots[name] = await ensureFixture(name, spec);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "assetflow-bench-profile-"));
  const started = Date.now();
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: "ignore",
  });
  const result = { label, exe, date: new Date().toISOString(), cores, fixtures: {} };
  let browser;
  try {
    for (let i = 0; i < 200 && !browser; i++)
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => sleep(100));
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(120000);
    await page.getByRole("heading", { name: "Your work, in order." }).waitFor();
    result.startupMs = Date.now() - started;
    await sleep(5000);
    result.idleEmpty = { ...tree(child.pid), cpuPct: await cpuWindow(child.pid, 10000), gpu: gpu(tree(child.pid).pids) };
    delete result.idleEmpty.pids;
    for (const name of Object.keys(fixtures)) {
      const r = {};
      await page.reload();
      await page.getByRole("heading", { name: "Your work, in order." }).waitFor();
      await sleep(2000);
      await page.evaluate(frameMonitor);
      const scan = await measured(child.pid, async () => {
        await page.evaluate(async (root) => {
          await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
            event: "tauri://drag-drop",
            payload: { paths: [root], position: { x: 400, y: 300 } },
          });
        }, roots[name]);
        await page.locator(".library-footer").waitFor();
      });
      r.scanMs = scan.wall;
      r.scanCpuPct = scan.cpuPct;
      r.scanFrames = await page.evaluate(frameStats);
      await sleep(4000);
      r.afterScan = tree(child.pid);
      // Backend + IPC alone, without React: the same command the UI calls.
      r.scanInvoke = await page.evaluate(async (root) => {
        const t = performance.now();
        const project = await window.__TAURI_INTERNALS__.invoke("scan_project", { path: root });
        const ms = Math.round(performance.now() - t);
        return { ms, payloadMB: +(JSON.stringify(project).length / 2 ** 20).toFixed(2) };
      }, roots[name]);
      r.domNodes = await page.evaluate(() => document.getElementsByTagName("*").length);
      r.jsHeapMB = await page.evaluate(() => +(performance.memory.usedJSHeapSize / 2 ** 20).toFixed(1));
      r.idleCpuPct = await cpuWindow(child.pid, 8000);
      r.searchMs = await page.evaluate(async () => {
        const input = document.querySelector(".browser-toolbar input");
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        const times = [];
        for (const q of ["n", "no", "nor", "normal", ""]) {
          const t = performance.now();
          set.call(input, q);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          times.push(performance.now() - t);
        }
        return Math.round(times.reduce((a, b) => a + b) / times.length);
      });
      await page.evaluate(frameMonitor);
      const scroll = await measured(child.pid, () =>
        page.evaluate(async () => {
          const el = document.querySelector(".main-scroll");
          for (let i = 0; i < 120; i++) {
            el.scrollTop = (el.scrollHeight * (i % 60)) / 60;
            await new Promise((r) => requestAnimationFrame(r));
          }
        }),
      );
      r.scroll = { cpuPct: scroll.cpuPct, ...(await page.evaluate(frameStats)) };
      // Browse deeper: 10 x "Show more" (when present) to see thumbnail/DOM memory growth.
      for (let i = 0; i < 10; i++) {
        const more = page.locator(".load-more");
        if (!(await more.count())) break;
        await more.click();
        await page.evaluate(() => {
          const el = document.querySelector(".main-scroll");
          el.scrollTop = el.scrollHeight;
        });
        await sleep(400);
      }
      // Scroll back through everything so lazy thumbnails decode.
      await page.evaluate(async () => {
        const el = document.querySelector(".main-scroll");
        for (let y = el.scrollHeight; y >= 0; y -= 400) {
          el.scrollTop = y;
          await new Promise((r) => setTimeout(r, 30));
        }
      });
      await sleep(3000);
      r.afterBrowse = tree(child.pid);
      r.browseDomNodes = await page.evaluate(() => document.getElementsByTagName("*").length);
      r.browseGpu = gpu(r.afterBrowse.pids);
      delete r.afterScan.pids;
      delete r.afterBrowse.pids;
      if (name === "medium") {
        await page.evaluate(() => (document.querySelector(".main-scroll").scrollTop = 0));
        const search = page.locator(".browser-toolbar input");
        const cycles = [];
        for (let i = 0; i < 10; i++) {
          await search.fill("bench-model");
          const open = await measured(child.pid, async () => {
            await page.getByRole("button", { name: "Inspect bench-model.glb", exact: true }).click();
            await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="model-vertices"]')?.textContent || ""));
          });
          await sleep(1500);
          const t = tree(child.pid);
          const g = i === 0 ? gpu(t.pids) : undefined;
          const openIdleCpuPct = i === 0 ? await cpuWindow(child.pid, 5000) : undefined;
          await page.keyboard.press("Escape");
          await page.getByRole("dialog", { name: "3D asset inspector" }).waitFor({ state: "hidden" });
          await sleep(1500);
          const closed = tree(child.pid);
          cycles.push({ loadMs: open.wall, loadCpuPct: open.cpuPct, openPrivateMB: t.privateMB, openWorkingSetMB: t.workingSetMB, closedPrivateMB: closed.privateMB, closedWorkingSetMB: closed.workingSetMB, gpu: g, openIdleCpuPct });
        }
        await sleep(5000);
        const settled = tree(child.pid);
        r.inspector = { cycles, settledPrivateMB: settled.privateMB, settledWorkingSetMB: settled.workingSetMB };
        await search.fill("");
      }
      result.fixtures[name] = r;
      console.log(name, JSON.stringify(r));
    }
  } finally {
    await browser?.close().catch(() => {});
    child.kill();
    await sleep(1500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  fs.mkdirSync("test-results", { recursive: true });
  const out = path.join("test-results", `perf-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`startup ${result.startupMs} ms; idle`, JSON.stringify(result.idleEmpty));
  console.log(`Saved ${out}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
