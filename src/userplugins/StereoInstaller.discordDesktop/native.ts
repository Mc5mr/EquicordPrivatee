/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { app, dialog, IpcMainInvokeEvent, shell } from "electron";
import script from "file://apply.ps1";

import { directoryHashes, locateModule, regularFile, sha256, verifyDirectory } from "./files";
import manifest from "./package-manifest.json";
import { importArchive as chooseArchive, launchStandalone, queueStandalone, standaloneInfo } from "./standalone";

const directory = join(DATA_DIR, "StereoInstaller");
let busy = false;
function windows() { if (process.platform !== "win32" || process.arch !== "x64") throw new Error("هذه الحزمة تدعم Discord الرسمي على Windows x64 فقط."); }
const backupKey = (path: string) => createHash("sha256").update(path.toLowerCase()).digest("hex");
const readJson = async (path: string) => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));

export async function clients(_event: IpcMainInvokeEvent) {
    windows();
    const result: { name: string; root: string; version: string; compatible: boolean; patched: boolean; nativePatchSupported: boolean; reason?: string; }[] = [];
    for (const [name, folder] of [["Stable", "Discord"], ["PTB", "DiscordPTB"], ["Canary", "DiscordCanary"]]) {
        const root = join(process.env.LOCALAPPDATA ?? "", folder);
        try {
            const info = await locateModule(root);
            result.push({ name, root: info.root, version: info.version, compatible: info.compatible, patched: info.patched, nativePatchSupported: info.nativePatchSupported });
        } catch (error) {
            try {
                if ((await lstat(root)).isDirectory()) result.push({ name, root, version: "Voice module pending", compatible: false, patched: false, nativePatchSupported: false, reason: error instanceof Error ? error.message : String(error) });
            } catch { /* This client is not installed. */ }
        }
    }
    return result;
}

export async function detect(_event: IpcMainInvokeEvent) {
    windows();
    const executable = dirname(app.getPath("exe"));
    const ownRoot = /^app-\d/.test(basename(executable)) ? dirname(executable) : executable;
    const roots = [ownRoot, ...["DiscordPTB", "Discord", "DiscordCanary"].map(name => join(process.env.LOCALAPPDATA ?? "", name))];
    for (const root of roots) { try { const info = await locateModule(root); return info.root; } catch { /* Try the next installed client. */ } }
    throw new Error("لم نجد Discord. اختر مجلده بواسطة Browse.");
}
export async function browse(_event: IpcMainInvokeEvent) {
    windows();
    const result = await dialog.showOpenDialog({ title: "Choose Discord / DiscordPTB / DiscordCanary", properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
}
export async function inspect(_event: IpcMainInvokeEvent, root: string) {
    windows();
    const info = await locateModule(root);
    const key = backupKey(info.file);
    let backupAvailable = false;
    try {
        const saved = await readJson(join(directory, `${key}.backup.json`));
        if (saved.target === info.file) {
            if (saved.originalFiles) { await verifyDirectory(join(directory, `${key}.original-voice`), saved.originalFiles); backupAvailable = true; }
            else backupAvailable = sha256(await readFile(join(directory, `${key}.original.node`))) === saved.originalHash;
        }
    } catch { /* No validated backup for this application version. */ }
    let task: { status: string; message: string; } | null = null;
    try { task = await readJson(join(directory, `${key}.status.json`)); } catch { /* No previous task. */ }
    const standalone = await standaloneInfo(info.root);
    return { ...info, backupAvailable, task: standalone.task ?? task, standalone };
}
async function legacyQueue(_event: IpcMainInvokeEvent, root: string, action: "restore") {
    windows();
    if (busy) throw new Error("هناك عملية تجهيز قيد التنفيذ.");
    busy = true;
    try {
        const info = await locateModule(root);
        await mkdir(directory, { recursive: true });
        const key = backupKey(info.file), backup = join(directory, `${key}.original.node`), backupManifest = join(directory, `${key}.backup.json`);
        const voiceDirectory = dirname(info.file), backupDirectory = join(directory, `${key}.original-voice`);
        const executable = join(info.root, info.version, `${basename(info.root)}.exe`);
        await regularFile(executable);
        const expectedFiles = await directoryHashes(voiceDirectory);
        let source: string, sourceHash: string, sourceFiles: Record<string, string> | undefined;
        let bundle = false;
        const saved = await readJson(backupManifest);
        if (saved.target !== info.file || info.hash !== saved.patchedHash) throw new Error("ملف الصوت تغيّر منذ التثبيت؛ لن تُستعاد نسخة تخص إصدارًا آخر.");
        if (saved.patchedFiles) await verifyDirectory(voiceDirectory, saved.patchedFiles);
        if (saved.originalFiles) {
            await verifyDirectory(backupDirectory, saved.originalFiles);
            source = backupDirectory; sourceFiles = saved.originalFiles; sourceHash = saved.originalHash; bundle = true;
        } else {
            source = backup; sourceHash = sha256(await readFile(backup));
            if (sourceHash !== saved.originalHash) throw new Error("النسخة الاحتياطية غير مطابقة.");
        }
        const statusFile = join(directory, `${key}.status.json`), taskFile = join(directory, `${key}.task.json`), scriptFile = join(directory, "apply.ps1");
        try { const previous = await readJson(statusFile); if (previous.status === "pending" && Date.now() - Number(previous.createdAt ?? 0) < 240_000) throw new Error("هناك عملية تثبيت مفتوحة بالفعل. انتظر نتيجتها."); }
        catch (error) { if (!(error as NodeJS.ErrnoException).code && !(error instanceof SyntaxError)) throw error; }
        // Windows PowerShell 5.1 needs a BOM to preserve Arabic strings in source files.
        await writeFile(scriptFile, `\uFEFF${script}`, "utf8");
        await writeFile(taskFile, JSON.stringify({ action, root: info.root, target: info.file, expectedHash: info.hash, source, sourceHash, sourceFiles, bundle, voiceDirectory, expectedFiles, executable, backupDirectory, backup, backupManifest, statusFile }), "utf8");
        await writeFile(statusFile, JSON.stringify({ status: "pending", message: "نافذة التثبيت ستغلق نسخة Discord المحددة وتفتحها تلقائيًا بعد انتهاء العملية.", target: info.file, createdAt: Date.now() }), "utf8");
        const child = spawn(join(process.env.WINDIR ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptFile, "-TaskFile", taskFile], { detached: true, stdio: "ignore", windowsHide: false });
        try { await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); }); }
        catch (error) { await writeFile(statusFile, JSON.stringify({ status: "failed", message: "تعذّر تشغيل مثبّت Windows؛ لم تتغير وحدة الصوت." }), "utf8"); throw error; }
        child.unref();
        return "بدأ التثبيت: ستظهر نافذة أوامر، وتُغلق هذه النسخة ثم تُفتح تلقائيًا بعد انتهاء العملية.";
    } finally { busy = false; }
}
export async function queue(event: IpcMainInvokeEvent, root: string, action: "install" | "restore") {
    windows();
    if (action !== "install" && action !== "restore") throw new Error("عملية غير معروفة.");
    const info = await locateModule(root);
    if (action === "restore" && !(await standaloneInfo(info.root)).installed) return legacyQueue(event, root, action);
    if (busy) throw new Error("هناك عملية تجهيز قيد التنفيذ.");
    busy = true;
    try { return await queueStandalone(info, action); } finally { busy = false; }
}
export async function importArchive(_event: IpcMainInvokeEvent, root: string) {
    windows();
    const info = await locateModule(root);
    return chooseArchive(info.root);
}
export async function launch(_event: IpcMainInvokeEvent, root: string) {
    windows();
    const info = await locateModule(root);
    return launchStandalone(info);
}
export async function sourceCode(_event: IpcMainInvokeEvent) { await shell.openExternal(manifest.repository); }
