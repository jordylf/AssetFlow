import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
const env = {
  ...process.env,
  PATH: `${join(homedir(), ".cargo", "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
};
const test = process.argv[2] === "test";
const command = test ? "cargo" : process.execPath;
const args = test
  ? ["test", "--manifest-path", "src-tauri/Cargo.toml"]
  : [
      join("node_modules", "@tauri-apps", "cli", "tauri.js"),
      ...process.argv.slice(2),
    ];
const child = spawn(command, args, { env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(`Cannot start the native toolchain: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
