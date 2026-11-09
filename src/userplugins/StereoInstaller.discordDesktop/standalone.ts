/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { DATA_DIR } from "@main/utils/constants";
import { dialog } from "electron";
import { unzipSync } from "fflate";
import script from "file://standalone.ps1";
import packageBase64 from "file://voice-package.zip?base64";

import { createNativePatch, directoryHashes, inside, locateModule, regularFile, sha256, validatePackage } from "./files";
import manifest from "./package-manifest.json";

const directory = join(DATA_DIR, "StereoInstaller");
const keyFor = (root: string) => sha256(Buffer.from(root.toLowerCase()));
const channelFor = (root: string) => basename(root).toLowerCase().replace("discord", "") || "stable";
const json = async (path: string) => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
type Archive = { path: string; hash: string; version: string; voice: string; channel: string; };
type Installed = { version: string; executable: string; originalExecutable: string; root: string; };

export async function inspectArchive(path: string, root: string): Promise<Archive> {
    path = await realpath(path);
    await regularFile(path);
    if ((await lstat(path)).size > 600 * 1024 * 1024) throw new Error("حزمة Discord أكبر من الحد المدعوم.");
    const bytes = await readFile(path);
    let unpackedBytes = 0;
    const entries = unzipSync(bytes, { filter: entry => {
        if (!/\/resources\/build_info\.json$|\/discord_voice\/[^/]+$/.test(entry.name)) return false;
        unpackedBytes += entry.originalSize;
        if (entry.originalSize > 32 * 1024 * 1024 || unpackedBytes > 64 * 1024 * 1024) throw new Error("بيانات الصوت داخل ZIP أكبر من الحد المدعوم.");
        return true;
    } });
    const metadata = Object.keys(entries).filter(name => /^app-\d+(?:\.\d+)+\/resources\/build_info\.json$/.test(name));
    if (metadata.length !== 1) throw new Error("اختر ZIP يحتوي مجلد app واحدًا وملفات Discord الكاملة.");
    const version = metadata[0].split("/")[0];
    const info = JSON.parse(Buffer.from(entries[metadata[0]]).toString("utf8"));
    const channel = channelFor(root);
    if (info.releaseChannel !== channel) throw new Error(`الحزمة تخص ${info.releaseChannel}؛ اختر حزمة ${channel} للحفاظ على نوع Discord المختار.`);
    const nodes = Object.keys(entries).filter(name => name.startsWith(`${version}/modules/`) && name.endsWith("/discord_voice/discord_voice.node"));
    if (nodes.length !== 1) throw new Error("الحزمة لا تحتوي وحدة ستيريو واحدة معروفة.");
    const voice = nodes[0].slice(0, -"/discord_voice.node".length);
    const files = Object.fromEntries(Object.entries(entries).filter(([name]) => name.startsWith(`${voice}/`)).map(([name, value]) => [name.slice(voice.length - "discord_voice".length), value]));
    validatePackage(files);
    return { path, hash: sha256(bytes), version, voice: voice.slice(version.length + 1), channel };
}

export async function standaloneInfo(root: string) {
    const key = keyFor(root);
    let installed: Installed | null = null;
    let task: { status: string; message: string; pid?: number; createdAt?: number; } | null = null;
    try {
        const saved = await json(join(directory, `${key}.standalone.json`));
        if (saved.root === root && /^app-1\.0\.2\d\d$/.test(saved.version)) {
            const folder = join(root, saved.version);
            const marker = await json(join(folder, ".mc5mr-stereo.json"));
            if (marker.root === root && saved.executable === join(folder, `${basename(root)}.exe`) && inside(root, await realpath(folder))) {
                await regularFile(saved.executable);
                installed = saved;
            }
        }
    } catch { /* No complete managed installation. */ }
    for (let attempt = 0; attempt < 3; attempt++) {
        try { task = await json(join(directory, `${key}.standalone-status.json`)); break; }
        catch (error) {
            if (attempt < 2) await delay(50);
            else if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
    if (task?.status === "pending") {
        let stopped = false;
        if (task.pid) {
            try { process.kill(task.pid, 0); }
            catch (error) { stopped = (error as NodeJS.ErrnoException).code === "ESRCH"; }
        } else stopped = Date.now() - Number(task.createdAt ?? 0) > 30_000;
        if (stopped) task = { status: "failed", message: task.pid ? "توقفت نافذة التثبيت قبل اكتمال العملية. اضغط Patch لإعادة المحاولة؛ لم تُستبدل ملفات Discord الأصلية." : "لم يصل تأكيد بدء التثبيت من المحاولة السابقة. اضغط Patch لإعادة المحاولة." };
    }
    let archive: Archive | null = null;
    try {
        const saved = await json(join(directory, `${key}.archive.json`));
        if (saved.channel === channelFor(root)) archive = saved;
    } catch { /* No imported archive. */ }
    return { installed, archive, task };
}

export async function importArchive(root: string) {
    const result = await dialog.showOpenDialog({ title: "Choose a complete stereo Discord ZIP for this client", properties: ["openFile"], filters: [{ name: "Discord stereo package", extensions: ["zip"] }] });
    if (result.canceled) return;
    const archive = await inspectArchive(result.filePaths[0], root);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${keyFor(root)}.archive.json`), JSON.stringify(archive), "utf8");
    return "حزمة الستيريو الكاملة جاهزة. اضغط Patch لإنشاء النسخة المستقلة.";
}

export async function queueStandalone(info: Awaited<ReturnType<typeof locateModule>>, action: "install" | "restore" | "launch") {
    await mkdir(directory, { recursive: true });
    const key = keyFor(info.root), state = await standaloneInfo(info.root);
    const statusFile = join(directory, `${key}.standalone-status.json`);
    if (state.task?.status === "pending") throw new Error("هناك عملية تثبيت مفتوحة بالفعل. انتظر نتيجتها.");
    if (action === "install" && state.installed) return "النسخة المستقلة جاهزة؛ استخدم Open stereo Discord لتشغيلها.";
    const originalExecutable = join(info.root, info.version, `${basename(info.root)}.exe`);
    await regularFile(originalExecutable);
    let archive: Archive | null = null;
    if (action === "install" && !info.nativePatchSupported && !info.compatible && !info.patched) {
        if (state.archive) archive = await inspectArchive(state.archive.path, info.root);
        else {
            const candidates = (await readdir(info.root)).filter(name => /^app-\d+(?:\.\d+)+\.zip$/i.test(name)).sort().reverse();
            for (const name of candidates) {
                try { archive = await inspectArchive(join(info.root, name), info.root); break; } catch { /* Try the next local package. */ }
            }
        }
        if (!archive) throw new Error("وحدة الصوت الحالية مختلفة. اختر Import stereo ZIP لحزمة كاملة من نفس نوع Discord؛ ملف Canary لا يصلح لـPTB أو Stable.");
    }
    let version = state.installed?.version;
    if (action === "install") {
        version = undefined;
        const names = new Set((await readdir(info.root)).map(name => name.toLowerCase()));
        for (let n = 299; n >= 200; n--) if (!names.has(`app-1.0.${n}`)) { version = `app-1.0.${n}`; break; }
        if (!version) throw new Error("كل أسماء app-1.0.2## مستخدمة؛ لم تتغير الملفات.");
    }
    if (!version) throw new Error("لا توجد نسخة مستقلة للاستعادة.");
    const archiveBytes = Buffer.from(packageBase64, "base64");
    if (sha256(archiveBytes) !== manifest.packageSha256) throw new Error("الحزمة المضمّنة غير مطابقة.");
    const entries = unzipSync(archiveBytes);
    validatePackage(entries);
    const source = join(directory, manifest.packageSha256, "discord_voice");
    await mkdir(source, { recursive: true });
    for (const name of Object.keys(manifest.files)) await writeFile(join(source, name), entries[`discord_voice/${name}`]);
    let nativePatch: string | null = null;
    let voiceFiles = Object.fromEntries(Object.entries(manifest.files).map(([name, value]) => [name, value.sha256]));
    if (action === "install" && info.nativePatchSupported) {
        const patched = createNativePatch(await readFile(info.file));
        nativePatch = join(directory, `${info.hash}.stereo.node`);
        voiceFiles = await directoryHashes(dirname(info.file));
        if (voiceFiles["discord_voice.node"] !== info.hash) throw new Error("تغيرت وحدة الصوت أثناء التجهيز. اضغط Refresh.");
        voiceFiles["discord_voice.node"] = sha256(patched);
        await writeFile(nativePatch, patched);
    } else if (action === "install" && !archive && !info.patched) {
        const hashes = await directoryHashes(dirname(info.file));
        for (const [name, value] of Object.entries(manifest.files)) if (name !== "discord_voice.node" && hashes[name] !== value.sha256) throw new Error(`ملف الصوت غير متوافق: ${name}`);
    }
    const executable = join(info.root, version, `${basename(info.root)}.exe`);
    const recordFile = join(directory, `${key}.standalone.json`);
    const taskFile = join(directory, `${key}.standalone-task.json`), scriptFile = join(directory, "standalone.ps1");
    const launcher = `${key}.standalone.cmd`;
    const voice = archive?.voice ?? info.file.slice(join(info.root, info.version).length + 1, -"discord_voice.node".length - 1);
    const injector = join(DATA_DIR, "equicord.asar");
    await regularFile(injector);
    await writeFile(scriptFile, `\uFEFF${script}`, "utf8");
    await writeFile(taskFile, JSON.stringify({ action, root: info.root, version, executable, originalExecutable, sourceApp: join(info.root, info.version), expectedHash: info.hash, originalVoice: info.file, archive, voice, source, nativePatch, voiceFiles, injector, channel: channelFor(info.root), recordFile, statusFile }), "utf8");
    await writeFile(join(directory, launcher), `@echo off\r\nstart "StereoInstaller" "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0standalone.ps1" -TaskFile "%~dp0${key}.standalone-task.json" -StatusFile "%~dp0${key}.standalone-status.json"\r\n`, "utf8");
    await writeFile(statusFile, JSON.stringify({ status: "pending", message: "جارٍ تجهيز النسخة المستقلة في نافذة الأوامر.", createdAt: Date.now() }), "utf8");
    const child = spawn(join(process.env.WINDIR ?? "C:\\Windows", "System32", "cmd.exe"), ["/d", "/c", launcher], { cwd: directory, detached: true, stdio: "ignore", windowsHide: true });
    try { await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); }); }
    catch (error) { await writeFile(statusFile, JSON.stringify({ status: "failed", message: "تعذّر فتح نافذة التثبيت؛ لم تتغير نسخة Discord الأصلية." }), "utf8"); throw error; }
    child.unref();
    const deadline = Date.now() + 15_000;
    while (true) {
        const current = (await standaloneInfo(info.root)).task;
        if (current?.status === "failed") throw new Error(current.message);
        if (current?.pid || current?.status === "succeeded") return current.message;
        if ((child.exitCode !== null && child.exitCode !== 0) || Date.now() >= deadline) break;
        await delay(200);
    }
    if (child.exitCode === null) child.kill();
    const message = "لم تبدأ نافذة التثبيت بشكل صحيح. اضغط Patch لإعادة المحاولة؛ لم تتغير ملفات Discord الأصلية.";
    await writeFile(statusFile, JSON.stringify({ status: "failed", message }), "utf8");
    throw new Error(message);
}

export async function launchStandalone(info: Awaited<ReturnType<typeof locateModule>>) {
    const state = await standaloneInfo(info.root);
    if (!state.installed) throw new Error("لم نجد نسخة ستيريو مستقلة مكتملة.");
    return queueStandalone(info, "launch");
}
