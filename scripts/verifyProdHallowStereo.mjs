/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = resolve("verification-stereo-fixture");
const code = await build({ entryPoints: ["src/userplugins/ProdHallowStereo.discordDesktop/native.ts"], bundle: true, write: false, platform: "node", format: "cjs", plugins: [{ name: "fixture", setup(b) {
    b.onResolve({ filter: /^@main\/utils\/constants$/ }, () => ({ path: "constants", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const DATA_DIR=globalThis.fixture.data;", loader: "js" }));
} }] });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function load({ platform = "win32", corrupt = false, failSpawn = false, exePath = join(root, "DiscordPTB/app-1.0.1224/DiscordPTB.exe") } = {}) {
    const bytes = Buffer.alloc(4096, 90); bytes.write("MZ");
    const sha256 = digest(bytes);
    const data = join(root, "cache");
    const source = join(root, "bundle/tools/ProdHallowStereo");
    const files = new Map([
        [join(source, "manifest.json"), Buffer.from(JSON.stringify({ size: bytes.length, sha256 }))],
        [join(source, "StereoHub.exe"), corrupt ? Buffer.alloc(bytes.length) : bytes],
        [join(source, "LICENSE.md"), Buffer.from("Discord Audio Collective")],
        [join(source, "native-patches.json"), Buffer.from(JSON.stringify([{ patchedSha256: digest(Buffer.from("compatible stereo")) }]))],
        [join(source, "payload.json"), Buffer.from(JSON.stringify({ files: [{ name: "discord_voice.node", size: 7, blob: createHash("sha1").update("blob 7\0patched").digest("hex") }] }))]
    ]);
    const directories = new Set();
    const addDirectory = path => { for (let current = path; current.startsWith(root); current = dirname(current)) { directories.add(current); if (current === root) break; } };
    const addInstall = (folder, version = "app-1.0.1224", contents = "original") => {
        const app = join(root, folder, version);
        const voice = join(app, "modules/discord_voice-1/discord_voice");
        addDirectory(voice);
        files.set(join(app, `${folder}.exe`), Buffer.from("fixture"));
        files.set(join(voice, "discord_voice.node"), Buffer.from(contents));
        return voice;
    };
    addInstall("Discord"); addInstall("DiscordPTB");
    const links = new Set();
    const calls = [];
    const reads = new Map();
    const stamps = new WeakMap();
    let stamp = 0;
    const modified = path => { const bytes = files.get(path); if (!bytes) return 0; if (!stamps.has(bytes)) stamps.set(bytes, ++stamp); return stamps.get(bytes); };
    const fs = {
        existsSync: path => files.has(path) || directories.has(path),
        readFileSync: (path, encoding) => { reads.set(path, (reads.get(path) ?? 0) + 1); if (!files.has(path)) throw new Error("missing"); const value = files.get(path); return encoding ? value.toString(encoding) : value; },
        writeFileSync: (path, content) => { assert.ok(path.startsWith(data + require("path").sep) || path.startsWith(join(root, "DiscordStereoHubSimple") + require("path").sep)); files.set(path, Buffer.from(content)); },
        renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
        statSync: path => ({ mtimeMs: modified(path), ctimeMs: modified(path), size: files.get(path)?.length || 0, isDirectory: () => directories.has(path) }),
        mkdirSync: path => addDirectory(path),
        readdirSync: path => [...new Set([...files.keys(), ...directories].filter(entry => dirname(entry) === path).map(entry => require("path").basename(entry)))],
        lstatSync: path => ({ isSymbolicLink: () => links.has(path) })
    };
    let spawnFails = failSpawn;
    const spawn = (exe, args, options) => {
        assert.equal(options.shell, false);
        assert.equal(options.windowsHide, true);
        assert.equal(options.detached, true);
        const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; child.unref = () => {};
        calls.push({ exe, args, options, child });
        queueMicrotask(() => child.emit(spawnFails ? "error" : "spawn"));
        return child;
    };
    const context = { fixture: { data }, Buffer, URL, __dirname: join(root, "bundle"), process: { platform, execPath: exePath, env: { LOCALAPPDATA: root } }, require: name => name === "fs" ? fs : name === "child_process" ? { spawn } : require(name), module: { exports: {} }, exports: {} };
    context.exports = context.module.exports;
    vm.runInNewContext(code.outputFiles[0].text, context);
    return { native: context.module.exports, files, links, calls, reads, addInstall, addDirectory, executable: join(data, "plugins/ProdHallowStereo", sha256, "StereoHub.exe"), setSpawnFailure: value => { spawnFails = value; } };
}
const good = load();
const one = good.native.launch({});
const two = good.native.launch({});
assert.equal(one, two);
assert.equal((await one).success, true);
assert.equal(good.calls.length, 1);
assert.equal(good.calls[0].args[0], "--discord-root");
assert.equal(good.calls[0].args[1], join(root, "DiscordPTB"));
assert.deepEqual(Array.from(good.calls[0].args).slice(2), ["--client", "PTB"]);
for (const [exe, folder, channel] of [["Discord.exe", "Discord", "Stable"], ["DiscordCanary.exe", "DiscordCanary", "Canary"]]) {
    const instance = load({ exePath: join(root, folder, "app-1.0.1", exe) });
    assert.equal((await instance.native.launch({})).success, true);
    assert.deepEqual(Array.from(instance.calls[0].args), ["--discord-root", join(root, folder), "--client", channel]);
}
const currentLayout = load({ exePath: join(root, "DiscordPTB/current/DiscordPTB.exe") });
assert.equal((await currentLayout.native.launch({})).success, true);
assert.deepEqual(Array.from(currentLayout.calls[0].args), ["--client", "PTB"], "channel hint survives a non app-version executable directory");
assert.equal((await good.native.launch({})).success, true);
assert.equal(good.calls.length, 1, "repeated clicks do not open duplicate tools");
good.calls[0].child.exitCode = 0; good.calls[0].child.emit("exit", 0);
good.files.set(good.executable, Buffer.from("corrupt cache"));
assert.equal((await good.native.launch({})).success, true);
assert.equal(good.files.get(good.executable).length, 4096, "cache corruption is repaired from the bundled verified executable");
assert.equal(good.calls.length, 2);
const corrupt = load({ corrupt: true });
assert.equal((await corrupt.native.launch({})).success, false); assert.equal(corrupt.calls.length, 0);
const nonWindows = load({ platform: "darwin" });
assert.equal((await nonWindows.native.launch({})).success, false); assert.equal(nonWindows.calls.length, 0);
const failure = load({ failSpawn: true });
assert.equal((await failure.native.launch({})).success, false);
failure.setSpawnFailure(false);
assert.equal((await failure.native.launch({})).success, true, "a failed process launch can be retried");
const linked = load(); linked.links.add(linked.executable); linked.files.set(linked.executable, Buffer.from("external"));
assert.equal((await linked.native.launch({})).success, false); assert.equal(linked.calls.length, 0);
const integrated = load();
let installed = integrated.native.getState({});
assert.equal(installed.current, "PTB");
assert.deepEqual(Array.from(installed.clients, item => item.id), ["Stable", "PTB", "Canary"]);
assert.equal(installed.clients.find(item => item.id === "Canary").installed, false);
for (const [id, action] of [["Canary", "patch"], ["../../other", "patch"], [{}, "patch"], ["PTB", "shell-command"], ["PTB", "revert"]]) assert.equal((await integrated.native.queueAction({}, id, action)).success, false);
assert.equal(integrated.calls.length, 0, "invalid or missing targets never launch a worker");
const job = integrated.native.queueAction({}, "PTB", "patch");
assert.equal((await integrated.native.queueAction({}, "Stable", "patch")).success, false, "concurrent clients cannot overwrite the operation");
assert.equal((await job).success, true);
assert.deepEqual(Array.from(integrated.calls[0].args), ["--integrated-action", "patch", "--discord-root", join(root, "DiscordPTB")]);
const journal = join(root, "DiscordStereoHubSimple/integration-result.json");
assert.equal(JSON.parse(integrated.files.get(journal)).status, "running");
const clientRoot = join(root, "DiscordPTB");
const backupBase = join(root, "DiscordStereoHubSimple/backups", clientRoot.replace(/[\\/]/g, "_").replace(/:/g, ""));
integrated.files.set(journal, Buffer.from(JSON.stringify({ status: "completed", action: "patch", root: clientRoot, message: "done", updatedAt: Date.now() })));
integrated.addInstall("DiscordPTB", "app-1.0.1224", "patched");
integrated.addDirectory(join(backupBase, "app-1.0.1224/UNPATCHED"));
integrated.files.set(join(backupBase, "app-1.0.1224/original-files.json"), Buffer.from("{}"));
integrated.files.set(join(backupBase, "quick_hub_meta.json"), Buffer.from(JSON.stringify({ last_patch_utc: new Date().toISOString(), reverted: false })));
let ptb = integrated.native.getState({}).clients.find(item => item.id === "PTB");
assert.equal(ptb.patched, false); assert.equal(ptb.backup, true); assert.equal(ptb.needsPatch, true); assert.equal(ptb.legacyPatched, true, "legacy stereo must request repair instead of reporting video-compatible audio");
integrated.addInstall("DiscordPTB", "app-1.0.1224", "compatible stereo");
ptb = integrated.native.getState({}).clients.find(item => item.id === "PTB");
assert.equal(ptb.patched, true); assert.equal(ptb.needsPatch, false, "compatible native stereo is recognized without reinstalling the legacy video module");
integrated.addInstall("DiscordPTB", "app-1.0.1225");
ptb = integrated.native.getState({}).clients.find(item => item.id === "PTB");
assert.equal(ptb.version, "app-1.0.1225"); assert.equal(ptb.needsPatch, true); assert.equal(ptb.backup, false);
assert.equal((await integrated.native.queueAction({}, "PTB", "revert")).success, false, "an old app's backup is never restored onto a new version");
integrated.files.set(join(backupBase, "quick_hub_meta.json"), Buffer.from(JSON.stringify({ last_patch_utc: new Date().toISOString(), reverted: true })));
assert.equal(integrated.native.getState({}).clients.find(item => item.id === "PTB").needsPatch, false, "intentional restore does not show an update warning");
const workerFailure = load({ failSpawn: true });
assert.equal((await workerFailure.native.queueAction({}, "PTB", "patch")).success, false);
assert.equal(workerFailure.native.getState({}).operation.status, "failed");
workerFailure.setSpawnFailure(false);
assert.equal((await workerFailure.native.queueAction({}, "PTB", "patch")).success, true);
const linkedClient = load(); linkedClient.links.add(join(root, "DiscordPTB"));
assert.equal((await linkedClient.native.queueAction({}, "PTB", "patch")).success, false);
assert.equal(linkedClient.calls.length, 0);
const entry = await readFile("src/userplugins/ProdHallowStereo.discordDesktop/index.tsx", "utf8");
assert.doesNotMatch(entry, /applyPatches|disabledPatches|customPatches|audio\.ts/);
const dock = await readFile("src/userplugins/UserAreaTweaks.discordDesktop/index.tsx", "utf8");
assert.match(dock, /MicSettings.openSettings/); assert.doesNotMatch(dock, /ProdHallowStereo|VoicePatcher/);

const settingsEntries = [];
const routes = [];
const modals = [];
const closedModals = [];
const sends = [];
let launches = 0;
const installerActions = [];
const installerState = { success: true, message: "", clients: [{ id: "PTB", name: "PTB", root: "C:/DiscordPTB", version: "app-1.0.1224", installed: true, backup: true, patched: false, needsPatch: false, lastPatch: "", voice: "C:/DiscordPTB/app-1.0.1224/modules/discord_voice-1/discord_voice" }], current: "PTB", operation: null };
let account = "523157034141745153";
const owner = account;
const ownerConfig = { encoderRate: 128000, sampleRate: 48000, packetSamples: 960, channels: 2, bitrate: 128, rateEnabled: true, sampleEnabled: true, packetEnabled: true, channelsEnabled: true, bitrateEnabled: true };
const engine = {
    connections: new Set(),
    connect(userId) {
        const connection = {
            userId, context: "default", destroyed: false, voiceBitrate: 64000,
            conn: { setTransportOptions: options => { if (this.closed) throw Error("closed media engine"); sends.push({ userId, options }); } },
            getCodecOptions: () => ({ audioEncoder: { type: 1, channels: 1, freq: 48000, pacsize: 960, rate: 64000, params: { fec: true } } }),
            setVoiceBitRate(value) { this.voiceBitrate = value; this.conn.setTransportOptions({ encodingVoiceBitRate: value }); },
            destroy() { this.destroyed = true; }
        };
        this.connections.add(connection);
        return connection;
    }
};
const originalConnect = engine.connect;
let currentEngine = engine;
const h = (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.flat() } : {}) } });
const stubs = {
    React: { createElement: h, useState: initial => [initial === null ? installerState : typeof initial === "function" ? initial() : initial, () => {}], useRef: value => ({ current: value }), useEffect() {}, useSyncExternalStore: (_subscribe, get) => get() },
    SettingsRouter: { openUserSettings: key => routes.push(key) },
    showToast() {}, Toasts: { Type: { FAILURE: 2 } },
    UserStore: { getCurrentUser: () => ({ id: account }) },
    MediaEngineStore: { getMediaEngine: () => currentEngine },
    ChannelStore: { getChannel: () => ({ bitrate: 96000 }) },
    VoiceStateStore: { getVoiceStateForUser: () => ({ channelId: "voice" }) },
    FluxDispatcher: { wait: callback => callback() },
    useStateFromStores: (_stores, get) => get(),
    openModal: render => modals.push(render({ transitionState: 0, onClose() {} })),
    closeModal: key => closedModals.push(key),
    Modal: "Modal", Select: "Select", Slider: "Slider", TextInput: "TextInput"
};
const modules = new Map([
    ["@utils/types", "export default value=>value; export const OptionType={CUSTOM:1};"],
    ["@utils/constants", "export const Devs={Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
    ["@utils/Logger", "export class Logger {error(){}};"],
    ["@utils/css", "export const classNameFactory=prefix=>(...names)=>names.map(name=>prefix+name).join(' ');"],
    ["@plugins/_core/settings", "export default {customEntries:globalThis.settingsEntries};"],
    ["@components/Button", "export const Button='Button',LinkButton='LinkButton';"],
    ["@components/FormSwitch", "export const FormSwitch='FormSwitch';"],
    ["@components/Switch", "export const Switch='Switch';"],
    ["@components/Icons", "export const HeadphonesIcon='HeadphonesIcon',CopyIcon='CopyIcon',DeleteIcon='DeleteIcon',PlusIcon='PlusIcon';"],
    ["@webpack/common", `export const {${Object.keys(stubs).join(",")}}=globalThis.stubs;`],
    ["@api/Settings", "export const definePluginSettings=definitions=>{const store=Object.fromEntries(Object.entries(definitions).map(([key,definition])=>[key,definition.default]));const settings={store,use:()=>store,withPrivateSettings:()=>settings};return settings;};"]
]);
const context = { h, stubs, settingsEntries, VencordNative: { pluginHelpers: { ProdHallowStereo: { launch: async () => { launches++; return { success: true }; }, getState: async () => installerState, browse: async () => installerState, queueAction: async (id, action) => { installerActions.push({ id, action }); return { success: true }; } } } } };
vm.createContext(context);
async function renderer(path) {
    const output = await build({ entryPoints: [path], bundle: true, write: false, format: "iife", globalName: "Subject", jsxFactory: "h", jsxFragment: "Fragment", plugins: [{ name: "renderer-fixture", setup(b) {
        b.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "renderer-fixture" }));
        b.onResolve({ filter: /\.css\?managed$/ }, () => ({ path: "styles", namespace: "renderer-fixture" }));
        b.onLoad({ filter: /.*/, namespace: "renderer-fixture" }, args => {
            const contents = args.path === "styles" ? "export default '';" : modules.get(args.path);
            assert.ok(contents, `Missing module ${args.path}`);
            return { contents, loader: "js" };
        });
    } }] });
    vm.runInContext(output.outputFiles[0].text, context);
    return context.Subject;
}
const stereo = (await renderer("src/userplugins/ProdHallowStereo.discordDesktop/index.tsx")).default;
settingsEntries.push({ key: "other", title: "Other settings" });
stereo.start(); stereo.start();
assert.equal(settingsEntries.length, 2, "repeated enable cannot duplicate StereoInstaller");
assert.equal(launches, 0, "registering a settings page does not patch or launch the tool");
const page = settingsEntries.find(item => item.key === "mc5mr_stereo_installer");
assert.equal(page.title, "StereoInstaller");
stereo.settingsAboutComponent().props.children.find(node => node.type === "Button").props.onClick();
assert.deepEqual(routes, ["mc5mr_stereo_installer_panel"]);
function buttonIn(node, label) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Button" && node.props.children?.includes(label)) return node;
    for (const child of [node.props?.children].flat()) { const found = buttonIn(child, label); if (found) return found; }
}
let panel = page.Component();
stereo.settings.store.clientId = "Stable";
buttonIn(page.Component(), "Browse").props.onClick();
for (let i = 0; i < 5; i++) await Promise.resolve();
assert.equal(stereo.settings.store.clientId, "Stable", "cancelled folder browsing preserves the selected client");
stereo.settings.store.clientId = "PTB";
panel = page.Component();
assert.equal(buttonIn(panel, "Patch Discord voice").props.disabled, false);
buttonIn(panel, "Patch Discord voice").props.onClick();
for (let i = 0; i < 5; i++) await Promise.resolve();
assert.deepEqual(installerActions, [{ id: "PTB", action: "patch" }], "Patch uses the explicitly selected client and integrated worker");
buttonIn(panel, "Revert to backup").props.onClick();
for (let i = 0; i < 5; i++) await Promise.resolve();
assert.deepEqual(installerActions.at(-1), { id: "PTB", action: "revert" });
installerState.clients[0].installed = false; installerState.clients[0].backup = false;
panel = page.Component();
assert.equal(buttonIn(panel, "Patch Discord voice").props.disabled, true);
assert.equal(buttonIn(panel, "Revert to backup").props.disabled, true);
installerState.clients[0].installed = true; installerState.clients[0].backup = true;
buttonIn(panel, "Open Stereo Hub").props.onClick();
await Promise.resolve();
assert.equal(launches, 1, "the dedicated settings action opens the working bundled Hub");
stereo.stop(); stereo.stop();
assert.equal(settingsEntries.length, 1); assert.equal(settingsEntries[0].key, "other");
stereo.start(); stereo.stop();
assert.equal(settingsEntries.length, 1);

const microphone = (await renderer("src/userplugins/MicSettings.discordDesktop/index.tsx")).default;
microphone.settings.store.applied = { "other-account": { ...ownerConfig, channelsEnabled: false } };
microphone.settings.store.profiles = { [owner]: { old: { ...ownerConfig, channelsEnabled: false } } };
microphone.start();
assert.equal(engine.connect, originalConnect, "default microphone controls do not alter the voice engine");
assert.equal(microphone.settings.store.applied["other-account"].channelsEnabled, true, "legacy stereo channel settings are migrated");
assert.equal(microphone.settings.store.profiles[owner].old.channelsEnabled, true, "saved stereo presets are migrated");
assert.equal(microphone.settings.store.stereoMigrated, true, "saved stereo settings are migrated once");
microphone.openSettings();
assert.equal(modals[0].props.title, "Microphone Settings");
assert.equal(modals[0].props.role, "dialog");
microphone.settings.store.applied = { [owner]: { ...ownerConfig } };
microphone.start();
assert.equal(sends.length, 0, "saved microphone settings do not require joining a call");
const connection = engine.connect(owner);
assert.equal(sends.at(-1).options.audioEncoder.channels, 2);
assert.equal(sends.at(-1).options.audioEncoder.rate, 96000, "the room bitrate is respected");
const unrelated = engine.connect("another-user");
const count = sends.length;
unrelated.conn.setTransportOptions({ audioEncoder: { channels: 1 } });
assert.equal(sends.length, count + 1); assert.equal(sends.at(-1).options.audioEncoder.channels, 1, "other users' transports are untouched");
connection.conn.setTransportOptions({ audioEncoder: { type: 1, channels: 1, freq: 48000, pacsize: 960, params: { fec: true } }, videoEncoder: { codec: "h264" } });
assert.equal(sends.at(-1).options.audioEncoder.channels, 2, "later Discord updates retain the saved channel request");
assert.equal(sends.at(-1).options.videoEncoder.codec, "h264");
microphone.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: owner }] });
const settledSends = sends.length;
for (let i = 0; i < 500; i++) {
    microphone.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: "another-user" }] });
    microphone.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: owner }] });
}
assert.equal(sends.length, settledSends, "long voice-event bursts never resend unchanged microphone encoders");
microphone.stop();
assert.equal(engine.connect, originalConnect);
assert.equal(sends.at(-1).options.audioEncoder.channels, 1, "disable restores the original encoder settings");
assert.equal(microphone.settings.store.applied[owner].channels, 2, "disabling preserves saved preferences");
assert.ok(closedModals.length);
microphone.start();
assert.equal(sends.at(-1).options.audioEncoder.channels, 2, "re-enabling resumes the saved configuration");
currentEngine = { connections: new Set(), connect: originalConnect };
engine.closed = true;
microphone.flux.VOICE_STATE_UPDATES({ voiceStates: [{ userId: owner }] });
assert.equal(engine.connect, originalConnect, "replacing the media engine restores the previous wrapper");
assert.notEqual(currentEngine.connect, originalConnect, "a replacement media engine receives the saved settings hook");
currentEngine.connect(owner);
assert.equal(sends.at(-1).options.audioEncoder.channels, 2, "stereo resumes on a replacement engine's new connection");
account = "another-account";
microphone.flux.CONNECTION_OPEN();
assert.equal(engine.connect, originalConnect, "an account without saved settings restores normal transport");
assert.equal(currentEngine.connect, originalConnect, "account switching also restores the replacement engine");
assert.equal(sends.at(-1).options.audioEncoder.channels, 1);
assert.equal(launches, 1, "microphone controls never launch or revert the native stereo installer");
microphone.stop();
console.log("PASS: bundled tool integrity, repaired cache, concurrent launch deduplication, selected client, spawn retry, linked-cache rejection, Windows scope and removal of automatic legacy patches. No real executable was launched.");
console.log("PASS: integrated client discovery, validated worker arguments, operation deduplication, per-version backups, installed/update state, launch failures, settings controls and cleanup; microphone modal, offline preferences, transport persistence, restore and account isolation.");

const cachedState = load();
const cachedVoice = join(root, "DiscordPTB/app-1.0.1224/modules/discord_voice-1/discord_voice/discord_voice.node");
for (let i = 0; i < 500; i++) assert.equal(cachedState.native.getState({}).success, true);
assert.equal(cachedState.reads.get(cachedVoice), 1, "unchanged voice status reads hash the large file only once");
cachedState.files.set(cachedVoice, Buffer.from("changed!"));
assert.equal(cachedState.native.getState({}).success, true);
assert.equal(cachedState.reads.get(cachedVoice), 2, "same-size file replacement invalidates the display hash cache");
cachedState.links.add(cachedVoice);
assert.equal(cachedState.native.getState({}).clients.find(client => client.id === "PTB").installed, false, "cached status cannot bypass linked-file checks");
console.log("PASS: 500 stereo status refreshes share one voice read and replacements invalidate the display cache.");
