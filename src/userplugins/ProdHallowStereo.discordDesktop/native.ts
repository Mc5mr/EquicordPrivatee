/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "@main/utils/constants";
import { type ChildProcess, spawn } from "child_process";
import { createHash } from "crypto";
import type { IpcMainInvokeEvent } from "electron";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";

export interface LaunchResult { success: boolean; message: string; }
export interface StereoClient { id: string; name: string; root: string; version: string; voice: string; installed: boolean; backup: boolean; patched: boolean; legacyPatched: boolean; needsPatch: boolean; lastPatch: string; }
export interface StereoOperation { status: "running" | "completed" | "failed"; message: string; root: string; action: "patch" | "revert"; updatedAt: number; }
export interface InstallerState { success: boolean; message: string; clients: StereoClient[]; current: string; operation: StereoOperation | null; }
let child: ChildProcess | undefined;
let opening: Promise<LaunchResult> | undefined;
let starting = false;
let customRoot = "";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const voiceHashCache = new Map<string, { size: number; mtimeMs: number; ctimeMs: number; sha256: string; blob: string; }>();
function voiceHashes(path: string) {
    const stat = statSync(path);
    const cached = voiceHashCache.get(path);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs && cached.ctimeMs === stat.ctimeMs) return cached;
    const bytes = readFileSync(path);
    const result = { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, sha256: digest(bytes), blob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") };
    if (Number.isFinite(stat.mtimeMs) && Number.isFinite(stat.ctimeMs)) {
        voiceHashCache.set(path, result);
        if (voiceHashCache.size > 8) { const oldest = voiceHashCache.keys().next().value; if (oldest) voiceHashCache.delete(oldest); }
    }
    return result;
}
function isManifest(value: unknown): value is { size: number; sha256: string; } {
    return value !== null && typeof value === "object"
        && "size" in value && typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size > 1024 && value.size <= 32 * 1024 * 1024
        && "sha256" in value && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256);
}
function tool() {
    const source = join(__dirname, "tools", "ProdHallowStereo");
    const manifest: unknown = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
    if (!isManifest(manifest)) throw new Error("Invalid bundled tool");
    const bundled = join(source, "StereoHub.exe");
    if (statSync(bundled).size !== manifest.size) throw new Error("Invalid bundled size");
    const bytes = readFileSync(bundled);
    if (bytes[0] !== 0x4d || bytes[1] !== 0x5a || digest(bytes) !== manifest.sha256) throw new Error("Invalid bundled hash");
    const root = resolve(DATA_DIR);
    const folder = join(root, "plugins", "ProdHallowStereo", manifest.sha256);
    if (!folder.startsWith(root + "/") && !folder.startsWith(root + "\\")) throw new Error("Invalid cache folder");
    for (const path of [join(root, "plugins"), join(root, "plugins", "ProdHallowStereo"), folder]) {
        mkdirSync(path, { recursive: true });
        if (lstatSync(path).isSymbolicLink()) throw new Error("Linked cache folder");
    }
    const executable = join(folder, "StereoHub.exe");
    if (existsSync(executable) && lstatSync(executable).isSymbolicLink()) throw new Error("Linked cached tool");
    if (!existsSync(executable) || statSync(executable).size !== manifest.size || digest(readFileSync(executable)) !== manifest.sha256) {
        const temporary = executable + ".pending";
        if (existsSync(temporary) && lstatSync(temporary).isSymbolicLink()) throw new Error("Linked staging file");
        writeFileSync(temporary, bytes);
        renameSync(temporary, executable);
    }
    const license = join(folder, "LICENSE.md");
    if (existsSync(license) && lstatSync(license).isSymbolicLink()) throw new Error("Linked license file");
    writeFileSync(license, readFileSync(join(source, "LICENSE.md")));
    return { folder, executable };
}

async function open(): Promise<LaunchResult> {
    if (process.platform !== "win32") return { success: false, message: "الأداة المدمجة مخصصة لنسخة Windows." };
    if (child && child.exitCode === null && child.signalCode === null) return { success: true, message: "Stereo Hub مفتوح بالفعل." };
    if (operation()?.status === "running") return { success: false, message: "انتظر انتهاء عملية التثبيت الحالية أولًا." };
    try {
        const { folder, executable } = tool();
        const args: string[] = [];
        const app = dirname(process.execPath);
        if (/^app-\d+\.\d+\.\d+$/i.test(basename(app))) args.push("--discord-root", dirname(app));
        const clients: Record<string, string> = { "discord.exe": "Stable", "discordptb.exe": "PTB", "discordcanary.exe": "Canary" };
        const client = clients[basename(process.execPath).toLowerCase()];
        if (client) args.push("--client", client);
        return await new Promise<LaunchResult>(res => {
            const started = spawn(executable, args, { cwd: folder, detached: true, windowsHide: true, stdio: "ignore", shell: false });
            child = started;
            started.once("error", () => {
                if (child === started) child = undefined;
                res({ success: false, message: "تعذر تشغيل Stereo Hub على هذا الجهاز." });
            });
            started.once("exit", () => { if (child === started) child = undefined; });
            started.once("spawn", () => {
                started.unref();
                res({ success: true, message: "تم فتح Stereo Hub." });
            });
        });
    } catch {
        return { success: false, message: "ملفات Stereo Hub المدمجة غير جاهزة. ثبّت النسخة المحدثة ثم حاول مرة ثانية." };
    }
}

export function launch(_: IpcMainInvokeEvent) {
    return opening ??= open().finally(() => { opening = undefined; });
}

const names: Record<string, string> = { Discord: "Stable", DiscordPTB: "PTB", DiscordCanary: "Canary" };
const executables: Record<string, string> = { Stable: "Discord.exe", PTB: "DiscordPTB.exe", Canary: "DiscordCanary.exe" };
const hubRoot = () => join(process.env.LOCALAPPDATA || dirname(dirname(process.execPath)), "DiscordStereoHubSimple");

function readJSON(path: string): unknown {
    try {
        if (lstatSync(path).isSymbolicLink() || statSync(path).size > 256 * 1024) return null;
        return JSON.parse(readFileSync(path, "utf8"));
    } catch { return null; }
}

function directory(path: string) {
    return existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory();
}

function roots() {
    const local = process.env.LOCALAPPDATA || dirname(dirname(dirname(process.execPath)));
    const result = Object.entries(names).map(([folder, name]) => ({ id: name, name, root: join(local, folder) }));
    if (!customRoot) {
        const saved = readJSON(join(hubRoot(), "selected-client.json"));
        if (saved && typeof saved === "object" && "root" in saved && typeof saved.root === "string" && names[basename(saved.root)]) {
            const savedRoot = saved.root;
            if (!result.some(item => resolve(item.root).toLowerCase() === resolve(savedRoot).toLowerCase())) customRoot = savedRoot;
        }
    }
    if (customRoot) result.push({ id: "custom", name: `${names[basename(customRoot)] || "Discord"} · Custom`, root: customRoot });
    return result;
}

function clientState(item: { id: string; name: string; root: string; }): StereoClient {
    const state: StereoClient = { ...item, version: "", voice: "", installed: false, backup: false, patched: false, legacyPatched: false, needsPatch: false, lastPatch: "" };
    if (!directory(item.root)) return state;
    const versions = readdirSync(item.root).filter(name => /^app-\d+\.\d+\.\d+$/.test(name) && directory(join(item.root, name)))
        .sort((a, b) => { const aa = a.slice(4).split(".").map(Number); const bb = b.slice(4).split(".").map(Number); return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2]; });
    state.version = versions[0] || "";
    if (!state.version) return state;
    const app = join(item.root, state.version);
    const client = names[basename(item.root)];
    if (!client || !existsSync(join(app, executables[client])) || !directory(join(app, "modules"))) return state;
    const modules = readdirSync(join(app, "modules")).filter(name => /^discord_voice(?:-\d+)?$/.test(name)).sort((a, b) => Number(b.split("-")[1] || 0) - Number(a.split("-")[1] || 0));
    const module = modules.find(name => directory(join(app, "modules", name)) && directory(join(app, "modules", name, "discord_voice")) && existsSync(join(app, "modules", name, "discord_voice", "discord_voice.node")));
    if (!module) return state;
    state.voice = join(app, "modules", module, "discord_voice");
    const node = join(state.voice, "discord_voice.node");
    if (lstatSync(node).isSymbolicLink()) return state;
    state.installed = true;
    const key = item.root.replace(/[\\/]/g, "_").replace(/:/g, "");
    const backup = join(hubRoot(), "backups", key, state.version);
    state.backup = directory(join(backup, "UNPATCHED")) && existsSync(join(backup, "original-files.json"));
    const meta = readJSON(join(hubRoot(), "backups", key, "quick_hub_meta.json"));
    if (meta && typeof meta === "object" && "last_patch_utc" in meta && typeof meta.last_patch_utc === "string" && Number.isFinite(Date.parse(meta.last_patch_utc))) state.lastPatch = meta.last_patch_utc;
    const hashes = voiceHashes(node);
    const replacement = readJSON(join(__dirname, "tools", "ProdHallowStereo", "replacement-manifest.json"));
    if (replacement && typeof replacement === "object" && "files" in replacement && Array.isArray(replacement.files)) {
        const expected: unknown = replacement.files.find((file: unknown) => file && typeof file === "object" && "name" in file && file.name === "discord_voice.node");
        if (expected && typeof expected === "object" && "size" in expected && "sha256" in expected && typeof expected.size === "number" && typeof expected.sha256 === "string")
            state.patched = statSync(node).size === expected.size && hashes.sha256 === expected.sha256;
    }
    const payload = readJSON(join(__dirname, "tools", "ProdHallowStereo", "payload.json"));
    if (payload && typeof payload === "object" && "files" in payload && Array.isArray(payload.files)) {
        const expected: unknown = payload.files.find((file: unknown) => file && typeof file === "object" && "name" in file && file.name === "discord_voice.node");
        if (expected && typeof expected === "object" && "size" in expected && "blob" in expected && typeof expected.size === "number" && expected.size > 0 && expected.size < 64 * 1024 * 1024 && typeof expected.blob === "string" && statSync(node).size === expected.size) {
            state.legacyPatched = hashes.blob === expected.blob;
        }
    }
    if (!state.patched) {
        const profiles = readJSON(join(__dirname, "tools", "ProdHallowStereo", "native-patches.json"));
        if (Array.isArray(profiles)) {
            const hash = hashes.sha256;
            state.patched = profiles.some(profile => profile && typeof profile === "object" && "patchedSha256" in profile && profile.patchedSha256 === hash);
        }
    }
    state.needsPatch = state.legacyPatched || (!!state.lastPatch && !state.patched && !(meta && typeof meta === "object" && "reverted" in meta && meta.reverted === true));
    return state;
}

function operation(): StereoOperation | null {
    const value = readJSON(join(hubRoot(), "integration-result.json"));
    if (!value || typeof value !== "object" || !("status" in value) || !("message" in value) || !("root" in value) || !("action" in value) || !("updatedAt" in value)) return null;
    if ((value.status !== "running" && value.status !== "completed" && value.status !== "failed") || (value.action !== "patch" && value.action !== "revert") || typeof value.message !== "string" || value.message.length > 4096 || typeof value.root !== "string" || typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) return null;
    if (value.status === "running" && Date.now() - value.updatedAt > 600_000) return { status: "failed", message: "لم تكتمل العملية. افتح StereoInstaller وحاول مجددًا.", root: value.root, action: value.action, updatedAt: value.updatedAt };
    return { status: value.status, message: value.message, root: value.root, action: value.action, updatedAt: value.updatedAt };
}

export function getState(_: IpcMainInvokeEvent): InstallerState {
    try {
        if (process.platform !== "win32") return { success: false, message: "StereoInstaller متاح على Windows فقط.", clients: [], current: "Stable", operation: null };
        const clients = roots().map(clientState);
        const host = names[basename(dirname(dirname(process.execPath)))];
        return { success: true, message: "", clients, current: host || "Stable", operation: operation() };
    } catch { return { success: false, message: "تعذر قراءة ملفات Discord. اضغط Refresh وحاول مجددًا.", clients: [], current: "Stable", operation: null }; }
}

export async function browse(_: IpcMainInvokeEvent): Promise<InstallerState> {
    try {
        const { dialog } = await import("electron");
        const result = await dialog.showOpenDialog({ title: "Select Discord, DiscordPTB or DiscordCanary", properties: ["openDirectory"] });
        if (result.canceled || !result.filePaths[0]) return getState(_);
        const root = resolve(result.filePaths[0]);
        if (!names[basename(root)] || !clientState({ id: "custom", name: "Discord", root }).installed) return { ...getState(_), success: false, message: "اختر مجلد Discord أو DiscordPTB أو DiscordCanary الذي يحتوي على ملفات النسخة." };
        customRoot = root;
        return { ...getState(_), current: "custom" };
    } catch { return { ...getState(_), success: false, message: "تعذر فتح اختيار المجلد. اضغط Auto-detect لاستخدام النسخ المثبتة." }; }
}

export async function queueAction(_: IpcMainInvokeEvent, id: unknown, action: unknown): Promise<LaunchResult> {
    if (process.platform !== "win32" || typeof id !== "string" || id.length > 20 || (action !== "patch" && action !== "revert")) return { success: false, message: "اختر نسخة Discord وعملية صحيحة." };
    if (starting || operation()?.status === "running" || (child && child.exitCode === null && child.signalCode === null)) return { success: false, message: "أغلق نافذة Stereo Hub أو انتظر انتهاء العملية الحالية أولًا." };
    starting = true;
    try {
        const item = roots().find(item => item.id === id);
        if (!item) return { success: false, message: "نسخة Discord المختارة غير معروفة." };
        const selected = clientState(item);
        if (!selected.installed || (action === "revert" && !selected.backup)) return { success: false, message: "ملفات النسخة أو النسخة الاحتياطية المطلوبة غير متاحة." };
        const { folder, executable } = tool();
        const data = hubRoot();
        mkdirSync(data, { recursive: true });
        if (lstatSync(data).isSymbolicLink()) throw new Error("Linked installer folder");
        for (const file of ["integration-result.json", "selected-client.json"]) if (existsSync(join(data, file)) && lstatSync(join(data, file)).isSymbolicLink()) throw new Error("Linked installer state");
        writeFileSync(join(data, "selected-client.json"), JSON.stringify({ root: selected.root }));
        writeFileSync(join(data, "integration-result.json"), JSON.stringify({ status: "running", root: selected.root, action, message: "جاري تجهيز ملفات الصوت. ستُغلق النسخة المختارة وتفتح بعد الانتهاء.", updatedAt: Date.now() }));
        return await new Promise<LaunchResult>(res => {
            const worker = spawn(executable, ["--integrated-action", action, "--discord-root", selected.root], { cwd: folder, detached: true, windowsHide: true, stdio: "ignore", shell: false });
            worker.once("spawn", () => { worker.unref(); res({ success: true, message: "بدأت العملية. نسخة Discord المختارة ستُفتح بعد الانتهاء." }); });
            worker.once("error", () => {
                try { writeFileSync(join(data, "integration-result.json"), JSON.stringify({ status: "failed", root: selected.root, action, message: "تعذر تشغيل أداة التثبيت.", updatedAt: Date.now() })); }
                catch { res({ success: false, message: "تعذر تشغيل الأداة وحفظ حالتها. أعد تشغيل Discord." }); return; }
                res({ success: false, message: "تعذر تشغيل أداة التثبيت." });
            });
        });
    } catch { return { success: false, message: "تعذر تجهيز StereoInstaller. أعد تثبيت النسخة المحدثة وحاول مجددًا." }; }
    finally { starting = false; }
}
// End of the native bridge.
