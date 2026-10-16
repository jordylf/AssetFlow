import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
for (const [folder, files] of Object.entries({
  "draco/gltf": [
    "draco_decoder.js",
    "draco_decoder.wasm",
    "draco_wasm_wrapper.js",
  ],
  basis: ["basis_transcoder.js", "basis_transcoder.wasm"],
})) {
  const destination = join(
    "public",
    "decoders",
    folder.startsWith("draco") ? "draco" : "basis",
  );
  await mkdir(destination, { recursive: true });
  for (const file of files)
    await copyFile(
      join("node_modules", "three", "examples", "jsm", "libs", folder, file),
      join(destination, file),
    );
}
await copyFile(
  "node_modules/three/LICENSE",
  "public/decoders/THREE-LICENSE.txt",
);
// A static worker can have its own narrowly scoped CSP; blob workers inherit the app policy.
const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
const worker = KTX2Loader.BasisWorker.toString();
const body = [
  ...["EngineFormat", "EngineType", "TranscoderFormat", "BasisFormat"].map(
    (key) => `let _${key} = ${JSON.stringify(KTX2Loader[key])};`,
  ),
  await readFile(
    "node_modules/three/examples/jsm/libs/basis/basis_transcoder.js",
    "utf8",
  ),
  "self.addEventListener('unhandledrejection', event => self.postMessage({type:'error', error:String(event.reason), data:{}}));",
  worker.slice(worker.indexOf("{") + 1, worker.lastIndexOf("}")),
].join("\n");
await writeFile("public/decoders/basis/worker.js", body);
