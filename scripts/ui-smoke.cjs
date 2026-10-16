// Uses Playwright from the development environment; it is not an app dependency.
const { chromium } = require(process.env.ASSETFLOW_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { mkdirSync } = require("node:fs");
(async () => {
  const native = !!process.env.ASSETFLOW_CDP;
  const browser = native
    ? await chromium.connectOverCDP(process.env.ASSETFLOW_CDP)
    : await chromium.launch({ channel: "msedge", headless: true });
  const context = native
    ? browser.contexts()[0]
    : await browser.newContext({ viewport: { width: 1440, height: 940 } });
  const page = native ? context.pages()[0] : await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (native) await page.reload();
  else await page.goto("http://127.0.0.1:1420");
  await page.getByRole("heading", { name: "Your work, in order." }).waitFor();
  await page.waitForTimeout(250);
  const screenshots = join(process.cwd(), "test-results");
  mkdirSync(screenshots, { recursive: true });
  await page.screenshot({
    path: join(screenshots, native ? "native-empty.png" : "empty.png"),
  });
  await page.getByRole("button", { name: /Settings/ }).click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  const toggle = page.getByRole("switch", { name: "Image thumbnails" });
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await page.getByRole("heading", { name: "Recently opened" }).waitFor();
  await page.getByRole("button", { name: /^Projects/ }).click();
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  const commandSearch = page.getByRole("combobox", { name: "Search commands" });
  assert.equal(
    await commandSearch.evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(
    await page
      .getByRole("dialog", { name: "Command palette" })
      .getByRole("option")
      .count(),
    6,
  );
  assert.equal(
    await page
      .getByRole("option", { name: "Organize Project", exact: true })
      .getAttribute("aria-disabled"),
    "true",
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(screenshots, "command-palette.png") });
  await page.keyboard.press("ArrowUp");
  assert.equal(
    await page
      .getByRole("option", { name: "Open Settings", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await commandSearch.fill("no matching command");
  await page.getByText("No matching commands", { exact: true }).waitFor();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.getByRole("dialog", { name: "Command palette" }).count(),
    1,
  );
  await commandSearch.fill("list view");
  await page.keyboard.press("Enter");
  await page
    .locator('.view-toggle button[aria-label="List view"][aria-pressed="true"]')
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "List view", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("Control+k");
  await commandSearch.fill("grid view");
  await page.keyboard.press("Enter");
  await page
    .locator('.view-toggle button[aria-label="Grid view"][aria-pressed="true"]')
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Grid view", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page
    .getByRole("button", { name: "Open command palette", exact: true })
    .click();
  await commandSearch.fill("settings");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Recent", exact: true }).click();
  await page.keyboard.press("Control+k");
  await commandSearch.fill("search assets");
  await page.keyboard.press("Enter");
  await page
    .waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Search assets",
      null,
      { timeout: 5000 },
    )
    .catch(async (error) => {
      console.error(
        await page.evaluate(() => ({
          focus: document.activeElement.outerHTML.slice(0, 500),
          heading: document.querySelector("h1")?.textContent,
          dialog: document.querySelector("dialog")?.outerHTML.slice(0, 200),
        })),
      );
      throw error;
    });
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search assets" })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Search assets" })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  if (native) {
    const {
      mkdtempSync,
      writeFileSync,
      readFileSync,
      readdirSync,
    } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { createHash } = require("node:crypto");
    const root = mkdtempSync(join(tmpdir(), "AssetFlow QA "));
    mkdirSync(join(root, "nested"));
    mkdirSync(join(root, "04_Textures"));
    // Valid raster thumbnail + distinct collision contents.
    writeFileSync(
      join(root, "Reference.png"),
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    writeFileSync(join(root, "nested", "stone_normal.png"), "new texture");
    writeFileSync(
      join(root, "04_Textures", "stone_normal.png"),
      "existing texture",
    );
    writeFileSync(join(root, "Studio.blend"), "model fixture");
    writeFileSync(join(root, "Brief.txt"), "brief fixture");
    writeFileSync(join(root, "Poster.psd"), "design fixture");
    writeFileSync(join(root, "Film.mp4"), "video fixture");
    writeFileSync(join(root, "Ambient.wav"), "audio fixture");
    writeFileSync(join(root, "index.ts"), "source fixture");
    const snapshot = (dir) =>
      readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? snapshot(join(dir, e.name))
            : [
                createHash("sha256")
                  .update(readFileSync(join(dir, e.name)))
                  .digest("hex"),
              ],
        )
        .sort();
    const original = snapshot(root);
    await page.evaluate(async (root) => {
      await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
        event: "tauri://drag-enter",
        payload: { paths: [root], position: { x: 400, y: 300 } },
      });
    }, root);
    await page
      .getByText("Drop it here. We’ll take a look.", { exact: true })
      .waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(screenshots, "native-drop.png") });
    await page.evaluate(async () => {
      await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
        event: "tauri://drag-leave",
        payload: {},
      });
      // Delay one real scan to verify the pending UI; the Rust command still performs the scan.
      const internals = window.__TAURI_INTERNALS__;
      const originalInvoke = internals.invoke;
      internals.invoke = async function (...args) {
        if (args[0] === "scan_project") {
          internals.invoke = originalInvoke;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        return originalInvoke.apply(internals, args);
      };
    });
    await page.evaluate(async (root) => {
      await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
        event: "tauri://drag-drop",
        payload: { paths: [root], position: { x: 400, y: 300 } },
      });
    }, root);
    await page
      .getByText("Getting to know your project", { exact: true })
      .waitFor();
    await page.screenshot({ path: join(screenshots, "native-loading.png") });
    await page
      .getByRole("heading", { name: root.split("\\").pop(), exact: true })
      .waitFor();
    assert.deepEqual(
      snapshot(root),
      original,
      "Scanning must preserve all file contents",
    );
    assert.equal(await page.locator(".asset-card").count(), 9);
    await page.getByRole("textbox", { name: "Search assets" }).focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page
        .locator(".asset-open")
        .first()
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .locator(".asset-open")
        .nth(1)
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Asset details" }).waitFor();
    await page.keyboard.press("Control+k");
    assert.equal(
      await page.getByRole("dialog", { name: "Command palette" }).count(),
      0,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Search assets" }).fill("Studio");
    assert.equal(await page.locator(".asset-card").count(), 1);
    await page
      .getByRole("button", { name: "Favorite Studio.blend", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Search assets" }).fill("");
    await page.getByRole("button", { name: /^Favorites/ }).click();
    assert.equal(await page.locator(".asset-card").count(), 1);
    await page.getByRole("button", { name: /^Projects/ }).click();
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await page.locator(".asset-table tbody tr").first().waitFor();
    assert.equal(await page.locator(".asset-table tbody tr").count(), 9);
    await page.locator(".file-name-button").first().focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page
        .locator(".file-name-button")
        .nth(1)
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await page.locator(".asset-card").first().waitFor();
    await page
      .getByRole("button", { name: "Inspect Reference.png", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Asset details" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".main-scroll").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({ path: join(screenshots, "native-project.png") });
    await page.keyboard.press("Control+k");
    await commandSearch.fill("organize project");
    assert.equal(
      await page
        .getByRole("option", { name: "Organize Project", exact: true })
        .getAttribute("aria-disabled"),
      "false",
    );
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Organization Preview" }).waitFor();
    await page
      .locator(".move-row")
      .filter({ hasText: "stone_normal_01.png" })
      .waitFor();
    assert.deepEqual(
      snapshot(root),
      original,
      "Preview must preserve all file contents",
    );
    await page.screenshot({ path: join(screenshots, "native-preview.png") });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(
      snapshot(root),
      original,
      "Cancel must preserve all file contents",
    );
    await page
      .getByRole("button", { name: "Organize Project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm Organization", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "8 assets organized." })
      .waitFor();
    assert.deepEqual(
      snapshot(root),
      original,
      "Organization must preserve the complete content multiset",
    );
    assert.equal(
      readFileSync(join(root, "04_Textures", "stone_normal.png"), "utf8"),
      "existing texture",
    );
    assert.equal(
      readFileSync(join(root, "04_Textures", "stone_normal_01.png"), "utf8"),
      "new texture",
    );
    await page
      .getByRole("button", { name: "Organize Project", exact: true })
      .click();
    await page.getByText("Nice and tidy. Nothing to move.").waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const stale = await page.evaluate(async () => {
      try {
        await window.__TAURI_INTERNALS__.invoke("confirm_organization", {
          planId: "invalid",
        });
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(stale, true);
    console.log(
      `Native UI + Rust round trip passed. Disposable fixture retained at ${root}`,
    );
  }
  assert.deepEqual(errors, [], "No uncaught frontend errors");
  console.log("UI smoke checks passed.");
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
