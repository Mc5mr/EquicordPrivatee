/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { build } from "esbuild";
import { unzipSync, zipSync, strToU8 } from "fflate";

const source = resolve("src/userplugins/StereoInstaller.discordDesktop");
const temporary = await realpath(await mkdtemp(join(tmpdir(), "stereo-standalone-")));
const root = join(temporary, "DiscordCanary");
const data = join(temporary, "data");
const files = unzipSync(await readFile(join(source, "voice-package.zip")));
const manifest = JSON.parse(await readFile(join(source, "package-manifest.json"), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const voice = "modules/discord_voice-3/discord_voice";
const sourceApp = join(root, "app-1.0.1218");
const originalExecutable = join(sourceApp, "DiscordCanary.exe");
const version = "app-1.0.299";
const destination = join(root, version);
const executable = join(destination, "DiscordCanary.exe");
const recordFile = join(data, "installed.json");
const statusFile = join(data, "status.json");
const injector = join(data, "equicord.asar");
const taskFile = join(data, "task.json");
const voiceFiles = Object.fromEntries(Object.entries(manifest.files).map(([name, spec]) => [name, spec.sha256]));
const task = { action: "install", root, version, executable, originalExecutable, sourceApp, originalVoice: join(sourceApp, voice, "discord_voice.node"), voice, source: join(data, "discord_voice"), voiceFiles, injector, channel: "canary", recordFile, statusFile };
async function run(overrides = {}, contents, lockedLog) {
    await writeFile(taskFile, contents ?? JSON.stringify({ ...task, ...overrides }));
    const worker = join(data, "worker.ps1");
    await writeFile(worker, "\uFEFF" + await readFile(join(source, "standalone.ps1"), "utf8"));
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/stereoWorkerHarness.ps1"), "-Worker", worker, "-TaskFile", taskFile, "-StatusFile", statusFile];
    if (lockedLog) args.push("-LockedLog", lockedLog);
    const result = spawnSync("powershell.exe", args, { encoding: "utf8", timeout: 60_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    try { return JSON.parse((await readFile(statusFile, "utf8")).replace(/^\uFEFF/, "")); }
    catch { throw new Error(result.stdout + result.stderr); }
}
try {
    await mkdir(join(sourceApp, voice), { recursive: true });
    await mkdir(join(sourceApp, "resources"));
    await mkdir(task.source, { recursive: true });
    await writeFile(originalExecutable, "non-executable test fixture");
    await writeFile(join(sourceApp, "resources", "build_info.json"), JSON.stringify({ releaseChannel: "canary", version: "1.0.1218" }));
    await writeFile(join(sourceApp, "resources", "app.asar"), "original application fixture");
    await writeFile(injector, "local Equicord fixture");
    for (const [name, bytes] of Object.entries(files)) {
        if (name.endsWith("/")) continue;
        await writeFile(join(task.source, name.split("/").at(-1)), bytes);
        await writeFile(join(sourceApp, voice, name.split("/").at(-1)), bytes);
    }
    const original = Buffer.from("compatible original voice fixture");
    await writeFile(task.originalVoice, original);
    task.expectedHash = sha(original);
    const dispatchLog = join(sourceApp, "modules/discord_dispatch-1/discord_dispatch/dispatch.log");
    await mkdir(dirname(dispatchLog), { recursive: true });
    await writeFile(dispatchLog, "live Discord log fixture");
    let state = await run({}, undefined, dispatchLog);
    assert.equal(state.status, "succeeded", state.message);
    assert.equal(await readFile(join(destination, "modules/discord_dispatch-1/discord_dispatch/dispatch.log"), "utf8"), "live Discord log fixture", "close the writer before copying and verifying its log");
    assert.equal(await readFile(dispatchLog, "utf8"), "live Discord log fixture", "preserve the original log");
    assert.equal(sha(await readFile(task.originalVoice)), sha(original));
    assert.equal(sha(await readFile(join(destination, voice, "discord_voice.node"))), manifest.files["discord_voice.node"].sha256);
    assert.match(await readFile(join(destination, "resources/app.asar/index.js"), "utf8"), /equicord\.asar/);
    const bootstrap = await readFile(join(destination, "resources/app.asar/index.js"), "utf8");
    const bootstrapContext = { process: { env: {} }, require: path => { assert.equal(path, join(injector, "patcher.js")); } };
    vm.runInNewContext(bootstrap, bootstrapContext);
    assert.equal(bootstrapContext.process.env.EQUICORD_USER_DATA_DIR, data, "the standalone copy must keep the private installer data directory");
    assert.equal(await readFile(taskFile + ".launch", "utf8"), executable);
    assert.equal((await run({ action: "launch" })).status, "succeeded");
    assert.equal(await readFile(taskFile + ".launch", "utf8"), executable);
    assert.equal((await run()).status, "failed", "never overwrite an existing app folder");
    state = await run({ action: "restore" });
    assert.equal(state.status, "succeeded", state.message);
    assert.equal((await readdir(root)).includes(version), false);
    assert.equal(await readFile(taskFile + ".launch", "utf8"), originalExecutable);
    assert.equal(sha(await readFile(task.originalVoice)), sha(original));

    const nativePatch = join(data, "current-stereo.node");
    const currentPatched = Buffer.from("current voice stereo fixture");
    await writeFile(nativePatch, currentPatched);
    await mkdir(join(sourceApp, voice, "node_modules/dependency"), { recursive: true });
    await writeFile(join(sourceApp, voice, "node_modules/dependency/index.js"), "current voice dependency");
    await writeFile(join(sourceApp, voice, "index.js"), "current voice loader");
    const preservedFiles = { ...voiceFiles, "discord_voice.node": sha(currentPatched), "index.js": sha("current voice loader"), [join("node_modules", "dependency", "index.js")]: sha("current voice dependency") };
    state = await run({ nativePatch, voiceFiles: preservedFiles });
    assert.equal(state.status, "succeeded", state.message);
    assert.equal(sha(await readFile(join(destination, voice, "discord_voice.node"))), sha(currentPatched));
    assert.equal(await readFile(join(destination, voice, "index.js"), "utf8"), "current voice loader");
    assert.equal(await readFile(join(destination, voice, "node_modules/dependency/index.js"), "utf8"), "current voice dependency");
    assert.equal(sha(await readFile(task.originalVoice)), sha(original));
    assert.equal((await run({ action: "restore" })).status, "succeeded");
    await writeFile(nativePatch, "tampered native patch");
    await rm(taskFile + ".launch");
    assert.equal((await run({ nativePatch, voiceFiles: preservedFiles })).status, "failed");
    assert.equal(await readFile(taskFile + ".launch", "utf8"), originalExecutable, "reopen the original client if preparation fails after closing it");
    assert.equal((await readdir(root)).some(name => name.startsWith(".mc5mr-stereo-stage-")), false);
    assert.equal((await readdir(root)).includes(version), false);

    const entries = {};
    for (const [name, bytes] of Object.entries(files)) if (!name.endsWith("/")) entries[`app-1.0.1218/${voice}/${name.split("/").at(-1)}`] = bytes;
    entries["app-1.0.1218/DiscordCanary.exe"] = strToU8("archive executable fixture, never run");
    entries["app-1.0.1218/resources/build_info.json"] = strToU8(JSON.stringify({ releaseChannel: "canary", version: "1.0.1218" }));
    entries["app-1.0.1218/resources/_app.asar"] = strToU8("original application fixture");
    entries["app-1.0.1218/resources/app.asar/index.js"] = strToU8('require("C:/foreign-user/patcher.js");');
    const archivePath = join(root, "app-1.0.1218.zip");
    const archiveBytes = zipSync(entries);
    await writeFile(archivePath, archiveBytes);
    const archive = { path: archivePath, hash: sha(archiveBytes), version: "app-1.0.1218", voice, channel: "canary" };
    state = await run({ archive });
    assert.equal(state.status, "succeeded", state.message);
    assert.doesNotMatch(await readFile(join(destination, "resources/app.asar/index.js"), "utf8"), /foreign-user/);
    assert.equal((await run({ action: "restore" })).status, "succeeded");
    assert.equal((await run({ archive: { ...archive, hash: "wrong" } })).status, "failed");
    const badBytes = zipSync({ ...entries, "app-1.0.1218/../../escape.txt": strToU8("invalid") });
    await writeFile(archivePath, badBytes);
    assert.equal((await run({ archive: { ...archive, hash: sha(badBytes) } })).status, "failed");
    assert.equal((await readdir(root)).some(name => name.startsWith(".mc5mr-stereo-stage-")), false);
    await writeFile(archivePath, archiveBytes);

    const bundle = await build({ entryPoints: [join(source, "standalone.ts")], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "fixtures", setup(builder) {
        builder.onResolve({ filter: /^original-fs$/ }, () => ({ path: "node:fs", external: true }));
        builder.onResolve({ filter: /^file:\/\/|^electron$|^@main\/utils\/constants$/ }, args => ({ path: args.path, namespace: "fixtures" }));
        builder.onLoad({ filter: /.*/, namespace: "fixtures" }, args => ({ contents: args.path === "electron" ? "export const dialog={};" : args.path === "@main/utils/constants" ? `export const DATA_DIR=${JSON.stringify(data)};` : 'export default "";', loader: "js" }));
    } }] });
    const context = { require: createRequire(import.meta.url), Buffer, process, module: { exports: {} }, exports: {} };
    context.exports = context.module.exports;
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    assert.equal((await context.module.exports.inspectArchive(archivePath, root)).channel, "canary");
    await assert.rejects(context.module.exports.inspectArchive(archivePath, join(temporary, "DiscordPTB")), /PTB|ptb/);
    state = await run({}, "{invalid task JSON");
    assert.equal(state.status, "failed", "task parsing failures must replace the initial pending status");
    assert.equal(typeof state.pid, "number");
    assert.ok((await readFile(statusFile + ".log", "utf8")).includes(state.message), "the transcript must capture the actual failure");
    console.log("PASS: locked dispatch.log released before copy and hash verification, original reopened after preparation failure, standalone native-only patch with nested assets preserved, tampered patch rejection, full-package copy and archive install, original preservation, local injection repair, direct launch, collision refusal, restore, ZIP hash failure, path traversal rejection, stage cleanup, channel validation, startup parsing failures and diagnostic transcript. Process launch and shutdown were mocked; no Discord binary was executed.");
} finally { await rm(temporary, { recursive: true, force: true }); }
