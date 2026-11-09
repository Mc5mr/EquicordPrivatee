// Functional filesystem and IPC checks. Does not execute PowerShell or native binaries.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import { unzipSync } from "fflate";

const require = createRequire(import.meta.url);
const source = resolve("src/userplugins/StereoInstaller.discordDesktop");
const manifest = JSON.parse(await readFile(join(source, "package-manifest.json"), "utf8"));
const profiles = JSON.parse(await readFile(join(source, "native-patches.json"), "utf8"));
const archive = await readFile(join(source, "voice-package.zip"));
const original = Buffer.from("a test fixture, not an actual Discord binary");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const blob = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const temporary = await realpath(await mkdtemp(join(tmpdir(), "stereo-installer-check-")));
const root = join(temporary, "DiscordPTB"), data = join(temporary, "data");
const nodePath = join(root, "app-1.0.10", "modules", "discord_voice-3", "discord_voice", "discord_voice.node");
const oldPath = join(root, "app-1.0.2", "modules", "discord_voice-1", "discord_voice", "discord_voice.node");
const calls = [];
let spawnFailure = false;
let earlyExit = false;

async function load(entry, fixtureManifest = false, platform = "win32", nativeProfile = null) {
    const bundle = await build({ entryPoints: [join(source, entry)], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "controlled-native", setup(builder) {
        builder.onResolve({ filter: /^file:\/\// }, args => ({ path: args.path, namespace: "assets" }));
        builder.onResolve({ filter: /^original-fs$/ }, () => ({ path: "node:fs", external: true }));
        builder.onLoad({ filter: /.*/, namespace: "assets" }, async args => ({ contents: `export default ${JSON.stringify(args.path.includes("base64") ? archive.toString("base64") : await readFile(join(source, args.path.slice(7)), "utf8"))};`, loader: "js" }));
        builder.onResolve({ filter: /^(electron|node:child_process|@main\/utils\/constants)$/ }, args => ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "electron" ? "export const app=globalThis.mocks.app,dialog=globalThis.mocks.dialog,shell=globalThis.mocks.shell;" : args.path === "node:child_process" ? "export const spawn=globalThis.mocks.spawn;" : `export const DATA_DIR=${JSON.stringify(data)};`, loader: "js" }));
        builder.onLoad({ filter: /package-manifest\.json$/ }, () => ({ contents: JSON.stringify({ ...manifest, originalGitBlob: fixtureManifest ? blob(original) : manifest.originalGitBlob }), loader: "json" }));
        if (nativeProfile) builder.onLoad({ filter: /native-patches\.json$/ }, () => ({ contents: JSON.stringify([nativeProfile]), loader: "json" }));
    } }] });
    const context = { require, Buffer, console, process: { platform, arch: "x64", pid: 12345, kill: pid => { if (pid === 98765) throw Object.assign(new Error("worker exited"), { code: "ESRCH" }); }, env: { LOCALAPPDATA: temporary, WINDIR: "C:\\Windows" } }, mocks: {
        app: { getPath: () => join(root, "app-1.0.10", "DiscordPTB.exe") },
        dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [root] }) },
        shell: { openExternal: async url => { calls.push({ url }); } },
        spawn: (exe, args, options) => {
            calls.push({ exe, args, options });
            const child = new EventEmitter(); child.unref = () => {}; child.exitCode = null;
            queueMicrotask(async () => {
                if (spawnFailure) return child.emit("error", new Error("simulated spawn failure"));
                if (exe.endsWith("cmd.exe") && !earlyExit) {
                    const statusFile = join(options.cwd, args.at(-1).replace(/\.standalone\.cmd$/, ".standalone-status.json"));
                    await writeFile(statusFile, JSON.stringify({ status: "pending", message: "نافذة التثبيت تعمل", pid: 12345 }));
                    child.exitCode = 0;
                }
                if (earlyExit) child.exitCode = 1;
                child.emit("spawn");
            });
            return child;
        }
    }, module: { exports: {} }, exports: {} };
    context.exports = context.module.exports;
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    return context.module.exports;
}

try {
    await mkdir(data, { recursive: true }); await writeFile(join(data, "equicord.asar"), "local injector fixture");
    for (const file of [oldPath, nodePath]) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, original); }
    await writeFile(join(root, "app-1.0.10", "DiscordPTB.exe"), "existing client executable fixture; never executed");
    for (const [name, bytes] of Object.entries(unzipSync(archive)).filter(([name]) => !name.endsWith("/"))) if (!name.endsWith("/discord_voice.node")) await writeFile(join(dirname(nodePath), name.split("/").at(-1)), bytes);
    for (const name of ["Discord", "DiscordCanary"]) {
        const file = join(temporary, name, "app-1.0.10", "modules", "discord_voice-1", "discord_voice", "discord_voice.node");
        await mkdir(dirname(file), { recursive: true }); await writeFile(file, original);
    }
    const files = await load("files.ts");
    if (process.env.STEREO_VOICE_TEST_FILE) {
        const current = await readFile(process.env.STEREO_VOICE_TEST_FILE);
        const profile = profiles.find(profile => profile.sha256 === sha(current));
        assert.ok(profile, "local validation must match a pinned input hash");
        const result = files.createNativePatch(current);
        assert.equal(sha(result), profile.patchedSha256);
        assert.equal(result.length, current.length);
        for (let offset = 0; offset < current.length; offset++) {
            if (current[offset] !== result[offset]) assert.ok(profile.patches.some(patch => offset >= patch.offset && offset < patch.offset + patch.expected.length / 2), "only stereo patch sites may change");
        }
        assert.equal(sha(await readFile(process.env.STEREO_VOICE_TEST_FILE)), profile.sha256, "the installed voice module must stay untouched");
        console.log("PASS: exact installed PTB binary, five stereo patch sites, output SHA-256, equal file size and original preservation.");
    }
    assert.equal(sha(archive), manifest.packageSha256);
    const unpacked = unzipSync(archive), patched = files.validatePackage(unpacked);
    assert.equal(blob(patched), manifest.patchedGitBlob);
    assert.throws(() => files.validatePackage({ ...unpacked, "discord_voice/extra.exe": new Uint8Array(1) }));
    assert.throws(() => files.validatePackage({ ...unpacked, "discord_voice/index.js": new Uint8Array(1) }));
    assert.equal(files.inside(root, join(temporary, "elsewhere")), false);
    let info = await files.locateModule(root);
    assert.equal(info.version, "app-1.0.10");
    assert.equal(info.file, nodePath);
    assert.equal(info.compatible, false);
    await assert.rejects(files.locateModule("relative/DiscordPTB"));
    await writeFile(nodePath, patched);
    assert.equal((await files.locateModule(root)).patched, true);
    const outside = join(temporary, "outside.node"); await writeFile(outside, original); await rm(nodePath);
    try { await symlink(outside, nodePath); await assert.rejects(files.locateModule(root)); await rm(nodePath); }
    catch (error) { if (error.code !== "EPERM") throw error; console.log("Symlink fixture unavailable in this Windows environment."); }
    await writeFile(nodePath, original);
    const native = await load("native.ts", true);
    assert.deepEqual(Array.from(await native.clients(null), client => client.name), ["Stable", "PTB", "Canary"], "all three installed client families are discovered independently");
    const pendingStable = join(temporary, "Discord", "app-1.0.99");
    await mkdir(pendingStable);
    const pendingClients = await native.clients(null);
    assert.equal(pendingClients.length, 3, "an installed client stays selectable while voice download is incomplete");
    assert.match(pendingClients.find(client => client.name === "Stable").reason, /./);
    await rm(pendingStable, { recursive: true });
    assert.equal(await native.detect(null), root);
    assert.equal(await native.browse(null), root);
    await assert.rejects(native.queue(null, root, "invalid"));
    const message = await native.queue(null, root, "install"); assert.match(message, /نافذة/);
    assert.equal(calls.length, 1);
    assert.match(calls[0].exe, /cmd\.exe$/);
    assert.equal(calls[0].args[0], "/d");
    const key = sha(root.toLowerCase());
    const legacyKey = sha(nodePath.toLowerCase());
    const taskFile = join(data, "StereoInstaller", `${key}.standalone-task.json`);
    const task = JSON.parse(await readFile(taskFile, "utf8"));
    assert.equal(task.expectedHash, sha(original));
    assert.equal(task.voiceFiles["discord_voice.node"], sha(patched));
    assert.equal(task.originalVoice, nodePath);
    assert.equal(task.version, "app-1.0.299");
    assert.equal(task.sourceApp, join(root, "app-1.0.10"));
    assert.equal(sha(await readFile(nodePath)), sha(original), "preparing does not alter loaded Discord modules");
    assert.equal(sha(await readFile(join(task.source, "discord_voice.node"))), sha(patched));
    assert.equal(task.archive, null);
    assert.equal(Object.keys(task.voiceFiles).length, 9);
    assert.equal(task.executable, join(root, "app-1.0.299", "DiscordPTB.exe"));
    assert.equal(calls[0].options.windowsHide, true, "hide the bootstrap, not the independent worker window");
    const launcher = await readFile(join(calls[0].options.cwd, calls[0].args.at(-1)), "utf8");
    assert.match(launcher, /start "StereoInstaller" "%SystemRoot%/);
    assert.match(launcher, /-File "%~dp0standalone\.ps1"/);
    assert.ok(!launcher.includes(" /b "), "the worker needs its own console");
    const filesystem = require("node:fs/promises");
    const originalReadFile = filesystem.readFile;
    for (const code of ["EACCES", "ENOENT"]) {
        let attempts = 0;
        filesystem.readFile = async (path, ...args) => {
            if (path === task.statusFile && attempts++ < 2) throw Object.assign(new Error("temporary status replacement"), { code });
            return originalReadFile(path, ...args);
        };
        try {
            assert.equal((await native.inspect(null, root)).task.status, "pending", "transient status reads must not stop progress tracking");
            assert.equal(attempts, 3);
        } finally { filesystem.readFile = originalReadFile; }
    }
    for (const [name, bytes] of Object.entries(unpacked).filter(([name]) => !name.endsWith("/"))) assert.equal(sha(await readFile(join(task.source, name.split("/").at(-1)))), sha(bytes));
    await assert.rejects(native.queue(null, root, "install"), /عملية تثبيت/);
    await writeFile(task.statusFile, JSON.stringify({ status: "pending", message: "still copying", pid: 12345, createdAt: Date.now() - 600_000 }));
    await assert.rejects(native.queue(null, root, "install"), /عملية تثبيت/, "an active worker stays protected beyond four minutes");
    await writeFile(task.statusFile, JSON.stringify({ status: "pending", message: "stale", createdAt: Date.now() - 60_000 }));
    assert.equal((await native.inspect(null, root)).task.status, "failed", "old tasks without a worker acknowledgement must stop showing pending");
    await writeFile(task.statusFile, JSON.stringify({ status: "pending", message: "closed", pid: 98765 }));
    assert.equal((await native.inspect(null, root)).task.status, "failed", "closing the worker must unblock retry");
    earlyExit = true;
    await assert.rejects(native.queue(null, root, "install"), /لم تبدأ نافذة/, "a shell that exits before acknowledging startup must fail visibly");
    earlyExit = false;
    await writeFile(task.statusFile, JSON.stringify({ status: "failed" }));
    await writeFile(join(data, "StereoInstaller", `${legacyKey}.status.json`), JSON.stringify({ status: "failed" }));
    spawnFailure = true;
    await assert.rejects(native.queue(null, root, "install"), /simulated spawn failure/);
    assert.equal(JSON.parse(await readFile(task.statusFile, "utf8")).status, "failed");
    spawnFailure = false;
    task.backup = join(data, "StereoInstaller", `${legacyKey}.original.node`);
    task.backupManifest = join(data, "StereoInstaller", `${legacyKey}.backup.json`);
    task.backupDirectory = join(data, "StereoInstaller", `${legacyKey}.original-voice`);
    const legacyTask = join(data, "StereoInstaller", `${legacyKey}.task.json`);
    await writeFile(nodePath, patched);
    await writeFile(task.backup, original);
    await writeFile(task.backupManifest, JSON.stringify({ target: nodePath, originalHash: sha(original), patchedHash: sha(patched) }));
    assert.equal((await native.inspect(null, root)).backupAvailable, true);
    await native.queue(null, root, "restore");
    const restore = JSON.parse(await readFile(legacyTask, "utf8"));
    assert.equal(restore.action, "restore"); assert.equal(restore.source, task.backup);
    await writeFile(join(data, "StereoInstaller", `${legacyKey}.status.json`), JSON.stringify({ status: "failed" }));
    await writeFile(task.statusFile, JSON.stringify({ status: "failed" }));
    await writeFile(task.backup, Buffer.from("corrupt backup"));
    assert.equal((await native.inspect(null, root)).backupAvailable, false);
    await assert.rejects(native.queue(null, root, "restore"));
    await writeFile(nodePath, Buffer.from("new unsupported module"));
    await assert.rejects(native.queue(null, root, "install"));
    await writeFile(nodePath, patched);
    await mkdir(task.backupDirectory, { recursive: true });
    for (const [name, bytes] of Object.entries(unpacked).filter(([name]) => !name.endsWith("/"))) await writeFile(join(task.backupDirectory, name.split("/").at(-1)), bytes);
    await writeFile(join(task.backupDirectory, "discord_voice.node"), original);
    const originalFiles = await files.directoryHashes(task.backupDirectory);
    await writeFile(task.backupManifest, JSON.stringify({ target: nodePath, originalHash: sha(original), patchedHash: sha(patched), originalFiles }));
    await writeFile(join(data, "StereoInstaller", `${legacyKey}.status.json`), JSON.stringify({ status: "failed" }));
    await writeFile(task.statusFile, JSON.stringify({ status: "failed" }));
    assert.equal((await native.inspect(null, root)).backupAvailable, true);
    await native.queue(null, root, "restore");
    const fullRestore = JSON.parse(await readFile(legacyTask, "utf8"));
    assert.equal(fullRestore.bundle, true); assert.equal(fullRestore.source, task.backupDirectory);
    assert.deepEqual(Object.keys(fullRestore.sourceFiles).sort(), Object.keys(originalFiles).sort());
    await writeFile(join(task.backupDirectory, "index.js"), "corrupted");
    assert.equal((await native.inspect(null, root)).backupAvailable, false);
    await assert.rejects(native.queue(null, root, "restore"));
    await writeFile(nodePath, original);
    await writeFile(join(dirname(nodePath), "index.js"), "different native voice version");
    await assert.rejects(native.queue(null, root, "install"), /index.js/);
    const nativeOriginal = Buffer.alloc(96, 0xff);
    const fixturePatches = profiles[0].patches.map((patch, index) => ({ ...patch, offset: index * 16 }));
    for (const patch of fixturePatches) Buffer.from(patch.expected, "hex").copy(nativeOriginal, patch.offset);
    const nativePatched = Buffer.from(nativeOriginal);
    for (const patch of fixturePatches) Buffer.from(patch.replacement, "hex").copy(nativePatched, patch.offset);
    const nativeProfile = { ...profiles[0], sha256: sha(nativeOriginal), patchedSha256: sha(nativePatched), patches: fixturePatches };
    const patchFiles = await load("files.ts", false, "win32", nativeProfile);
    assert.equal(sha(patchFiles.createNativePatch(nativeOriginal)), sha(nativePatched));
    assert.throws(() => patchFiles.createNativePatch(Buffer.from("unknown binary")));
    const invalidProfile = { ...nativeProfile, patchedSha256: "wrong" };
    const invalidFiles = await load("files.ts", false, "win32", invalidProfile);
    assert.throws(() => invalidFiles.createNativePatch(nativeOriginal));
    const wrongBytes = await load("files.ts", false, "win32", { ...nativeProfile, patches: [{ ...fixturePatches[0], expected: "00" }, ...fixturePatches.slice(1)] });
    assert.throws(() => wrongBytes.createNativePatch(nativeOriginal));
    await writeFile(nodePath, nativeOriginal);
    await mkdir(join(dirname(nodePath), "node_modules/dependency"), { recursive: true });
    await writeFile(join(dirname(nodePath), "node_modules/dependency/index.js"), "current voice dependency fixture");
    await writeFile(task.statusFile, JSON.stringify({ status: "failed" }));
    const currentNative = await load("native.ts", false, "win32", nativeProfile);
    assert.equal((await currentNative.inspect(null, root)).nativePatchSupported, true);
    assert.equal((await currentNative.clients(null)).find(client => client.root === root).nativePatchSupported, true);
    await currentNative.queue(null, root, "install");
    const nativeTask = JSON.parse(await readFile(taskFile, "utf8"));
    assert.equal(nativeTask.archive, null);
    assert.equal(sha(await readFile(nativeTask.nativePatch)), sha(nativePatched));
    assert.equal(nativeTask.voiceFiles["index.js"], sha("different native voice version"));
    assert.equal(nativeTask.voiceFiles[join("node_modules", "dependency", "index.js")], sha("current voice dependency fixture"));
    assert.equal(sha(await readFile(nodePath)), sha(nativeOriginal));
    const linux = await load("native.ts", false, "linux");
    await assert.rejects(linux.detect(null), /Windows/);
    await native.sourceCode(null); assert.equal(calls.at(-1).url, manifest.repository);
    console.log("PASS: pinned native stereo patching without ZIP, original and nested asset preservation, byte/output-hash rejection, nine-file package hashes, version ordering, path boundaries, symlink rejection, unsupported-module refusal, nine-file install staging, full-folder and legacy backups, native executable validation, worker startup acknowledgement, early exit recovery, stale-task detection, active-worker guard beyond four minutes, spawn failure recovery, validated restoration, and Windows-only checks. No downloaded binary or PowerShell script was executed.");
} finally { await rm(temporary, { recursive: true, force: true }); }
