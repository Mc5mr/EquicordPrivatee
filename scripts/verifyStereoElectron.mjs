/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPackage } from "@electron/asar";
import { build } from "esbuild";
import { unzipSync } from "fflate";

const executable = process.argv[2];
assert.ok(executable, "Pass the path to a real Electron executable.");
const source = resolve("src/userplugins/StereoInstaller.discordDesktop");
const temporary = await realpath(await mkdtemp(join(tmpdir(), "stereo-electron-")));
const data = join(temporary, "data");
const root = join(temporary, "DiscordPTB");
const app = join(root, "app-1.0.1224");
const voice = join(app, "modules/discord_voice-1/discord_voice");
const injector = join(data, "equicord.asar");
const report = join(temporary, "report.json");
const bundle = join(temporary, "bundle");
const taskFile = join(data, "StereoInstaller", `${createHash("sha256").update(root.toLowerCase()).digest("hex")}.standalone-task.json`);
try {
    await mkdir(voice, { recursive: true });
    await mkdir(data);
    const asarSource = join(temporary, "asar-source");
    await mkdir(asarSource);
    await writeFile(join(asarSource, "patcher.js"), "module.exports = {};");
    await createPackage(asarSource, injector);
    const entries = unzipSync(await readFile(join(source, "voice-package.zip")));
    for (const [name, bytes] of Object.entries(entries)) {
        if (!name.endsWith("/")) await writeFile(join(voice, name.split("/").at(-1)), bytes);
    }
    const file = join(voice, "discord_voice.node");
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    const info = { root, version: "app-1.0.1224", file, hash, compatible: false, patched: true, nativePatchSupported: false };
    await writeFile(join(app, "DiscordPTB.exe"), "fixture executable, never run");
    await mkdir(join(app, "resources"));
    await writeFile(join(app, "resources", "build_info.json"), JSON.stringify({ releaseChannel: "ptb" }));
    await writeFile(join(app, "resources", "app.asar"), "original application fixture");
    await build({
        entryPoints: [join(source, "standalone.ts"), join(source, "files.ts")],
        outdir: bundle, outExtension: { ".js": ".cjs" }, bundle: true, platform: "node", format: "cjs", external: ["original-fs"],
        plugins: [{ name: "electron-fixtures", setup(builder) {
            builder.onResolve({ filter: /^file:\/\// }, args => ({ path: args.path, namespace: "assets" }));
            builder.onLoad({ filter: /.*/, namespace: "assets" }, async args => ({ contents: `export default ${JSON.stringify(await readFile(join(source, args.path.slice(7).split("?")[0]), args.path.includes("base64") ? "base64" : "utf8"))};`, loader: "js" }));
            builder.onResolve({ filter: /^(electron|node:child_process|@main\/utils\/constants)$/ }, args => ({ path: args.path, namespace: "fixtures" }));
            builder.onLoad({ filter: /.*/, namespace: "fixtures" }, args => ({ contents: args.path === "electron" ? "export const dialog={};" : args.path === "node:child_process" ? "export const spawn=globalThis.stereoTestSpawn;" : `export const DATA_DIR=${JSON.stringify(data)};`, loader: "js" }));
        } }]
    });
    const runner = join(temporary, "runner.cjs");
    await writeFile(runner, `
const assert = require("node:assert/strict");
const fs = require("node:fs");
const raw = require("original-fs");
const { spawn } = require("node:child_process");
const { app } = require("electron");
const calls = [];
globalThis.stereoTestSpawn = (exe, args, options) => {
    calls.push([exe, args, options]);
    const launcher = require("node:path").join(options.cwd, args.at(-1));
    const command = raw.readFileSync(launcher, "utf8");
    assert.ok(command.includes('start "StereoInstaller"'));
    raw.writeFileSync(launcher, command.replace('-File "%~dp0standalone.ps1"', '-File "' + ${JSON.stringify(resolve("scripts/stereoWorkerHarness.ps1"))} + '" -Worker "%~dp0standalone.ps1"'));
    if (calls.length === 2) {
        const worker = require("node:path").join(options.cwd, "standalone.ps1");
        raw.writeFileSync(worker, raw.readFileSync(worker, "utf8").replace("$task = Get-Content", "Microsoft.PowerShell.Utility\\\\Start-Sleep -Milliseconds 1500\\r\\n    $task = Get-Content"));
    }
    return spawn(exe, args, options);
};
(async () => {
    assert.ok(process.versions.electron);
    assert.equal((await fs.promises.lstat(${JSON.stringify(injector)})).isDirectory(), true, "Electron sees an archive root as a virtual directory");
    assert.equal((await raw.promises.lstat(${JSON.stringify(injector)})).isFile(), true, "original-fs sees the physical archive file");
    const files = require(${JSON.stringify(join(bundle, "files.cjs"))});
    const native = require(${JSON.stringify(join(bundle, "standalone.cjs"))});
    await files.regularFile(${JSON.stringify(injector)});
    const directory = ${JSON.stringify(join(data, "directory.asar"))};
    await raw.promises.mkdir(directory);
    await assert.rejects(files.regularFile(directory), /المسار ليس ملفًا عاديًا/);
    await native.queueStandalone(${JSON.stringify(info)}, "install");
    assert.equal(calls.length, 1, "Patch must reach the worker launch with a physical ASAR injector");
    assert.equal(calls[0][2].windowsHide, true);
    assert.ok(calls[0][0].endsWith("cmd.exe"));
    const task = JSON.parse(await raw.promises.readFile(${JSON.stringify(taskFile)}, "utf8"));
    assert.equal(task.injector, ${JSON.stringify(injector)});
    assert.equal(task.version, "app-1.0.299");
    const deadline = Date.now() + 30_000;
    let state;
    do {
        await new Promise(resolve => setTimeout(resolve, 100));
        state = (await native.standaloneInfo(${JSON.stringify(root)})).task;
    } while ((!state || state.status === "pending") && Date.now() < deadline);
    assert.equal(state?.status, "succeeded", state?.message);
    const installed = (await native.standaloneInfo(${JSON.stringify(root)})).installed;
    assert.equal(installed.version, "app-1.0.299");
    assert.equal(require("node:crypto").createHash("sha256").update(await raw.promises.readFile(task.originalVoice)).digest("hex"), task.expectedHash, "the original voice module must remain untouched");
    assert.equal(await raw.promises.readFile(${JSON.stringify(join(app, "resources", "app.asar"))}, "utf8"), "original application fixture");
    assert.equal(await raw.promises.readFile(${JSON.stringify(taskFile)} + ".launch", "utf8"), installed.executable);
    const log = await raw.promises.readFile(task.statusFile + ".log", "utf8");
    assert.ok(log.includes("0 /"), "the worker must report verification progress");
    await native.queueStandalone(${JSON.stringify(info)}, "restore");
    await raw.promises.writeFile(${JSON.stringify(report)}, JSON.stringify({ ok: true, electron: process.versions.electron }));
    app.exit(0);
})().catch(error => {
    raw.writeFileSync(${JSON.stringify(report)}, JSON.stringify({ ok: false, error: error.stack }));
    app.exit(1);
});
`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(executable, [runner], { env, windowsHide: true, encoding: "utf8", timeout: 60_000 });
    if (result.error) throw result.error;
    let outcome;
    try { outcome = JSON.parse(await readFile(report, "utf8")); }
    catch { throw new Error(`Electron did not report a result (${result.status}): ${result.stderr}`); }
    assert.equal(result.status, 0, outcome.error ?? result.stderr);
    assert.equal(outcome.ok, true, outcome.error);
    const statusFile = taskFile.replace(".standalone-task.json", ".standalone-status.json");
    const deadline = Date.now() + 15_000;
    let state;
    do {
        await new Promise(resolve => setTimeout(resolve, 100));
        state = JSON.parse((await readFile(statusFile, "utf8")).replace(/^\uFEFF/, ""));
    } while (state.status === "pending" && Date.now() < deadline);
    assert.equal(state.status, "succeeded", "the independent worker must finish after its Electron parent exits: " + state.message);
    await assert.rejects(readFile(join(root, "app-1.0.299", "DiscordPTB.exe")), { code: "ENOENT" });
    assert.equal(await readFile(join(app, "DiscordPTB.exe"), "utf8"), "fixture executable, never run");
    console.log(`PASS: Electron ${outcome.electron} physical ASAR validation, real CMD/PowerShell startup, full fixture install, live completion, progress transcript, worker survival after Electron exits, restore and original preservation. Discord launches, process termination and shortcuts were mocked.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
