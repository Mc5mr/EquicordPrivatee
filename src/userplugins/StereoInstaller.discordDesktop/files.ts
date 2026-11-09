/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promises as physicalFs } from "original-fs";

import nativePatches from "./native-patches.json";
import manifest from "./package-manifest.json";

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const gitBlob = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
export function createNativePatch(bytes: Uint8Array) {
    const profile = nativePatches.find(profile => profile.sha256 === sha256(bytes));
    if (!profile) throw new Error("تغير إصدار وحدة الصوت؛ اضغط Refresh للتحقق من دعمه.");
    const patched = Buffer.from(bytes);
    for (const patch of profile.patches) {
        const expected = Buffer.from(patch.expected, "hex"), replacement = Buffer.from(patch.replacement, "hex");
        if (expected.length !== replacement.length || !patched.subarray(patch.offset, patch.offset + expected.length).equals(expected)) throw new Error("تعذر التحقق من موضع تعديل الستيريو.");
        replacement.copy(patched, patch.offset);
    }
    if (sha256(patched) !== profile.patchedSha256) throw new Error("بصمة وحدة الستيريو الناتجة غير مطابقة.");
    return patched;
}
export function inside(root: string, path: string) {
    const child = relative(root, path);
    return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
export async function regularFile(path: string) {
    const stat = await physicalFs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`المسار ليس ملفًا عاديًا: ${path}`);
}
export async function directoryHashes(directory: string): Promise<Record<string, string>> {
    const hashes: Record<string, string> = {};
    async function visit(folder: string) {
        for (const item of await readdir(folder, { withFileTypes: true })) {
            const path = join(folder, item.name);
            if (item.isSymbolicLink()) throw new Error("مجلد الصوت يحتوي رابطًا؛ أُلغيت العملية.");
            if (item.isDirectory()) await visit(path);
            else { await regularFile(path); hashes[relative(directory, path)] = sha256(await readFile(path)); }
        }
    }
    await visit(directory);
    return hashes;
}
export async function verifyDirectory(directory: string, expected: Record<string, string>) {
    const actual = await directoryHashes(directory);
    if (Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([name, hash]) => actual[name] !== hash)) throw new Error("بصمات ملفات النسخة الاحتياطية غير مطابقة.");
}
export async function locateModule(input: string) {
    if (typeof input !== "string" || !isAbsolute(input)) throw new Error("اختر مسار Discord كاملًا.");
    const root = await realpath(resolve(input));
    if (!/^Discord(?:PTB|Canary)?$/i.test(basename(root))) throw new Error("اختر مجلد Discord أو DiscordPTB أو DiscordCanary الأساسي.");
    const versions: string[] = [];
    for (const item of await readdir(root, { withFileTypes: true })) {
        if (!item.isDirectory() || !/^app-\d+(?:\.\d+)+$/.test(item.name)) continue;
        try { await lstat(join(root, item.name, ".mc5mr-stereo.json")); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") versions.push(item.name); else throw error; }
    }
    versions.sort((a, b) => {
        const left = a.slice(4).split(".").map(Number), right = b.slice(4).split(".").map(Number);
        for (let i = 0; i < Math.max(left.length, right.length); i++) if ((right[i] ?? 0) !== (left[i] ?? 0)) return (right[i] ?? 0) - (left[i] ?? 0);
        return 0;
    });
    // Inspect the newest application only; never silently fall back to an old version.
    const version = versions[0];
    if (!version) throw new Error("لم نجد نسخة Discord مثبتة داخل هذا المجلد.");
    const modules = join(root, version, "modules");
    const names = (await readdir(modules, { withFileTypes: true })).filter(item => item.isDirectory() && /^discord_voice(?:-\d+)?$/.test(item.name)).map(item => item.name);
    names.sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0));
    if (!names.length) throw new Error("لم نجد وحدة الصوت؛ افتح Discord مرة واحدة ليحمّلها.");
    const file = await realpath(join(modules, names[0], "discord_voice", "discord_voice.node"));
    if (!inside(root, file)) throw new Error("وحدة الصوت خارج مجلد Discord المختار.");
    await regularFile(file);
    const bytes = await readFile(file);
    const blob = gitBlob(bytes);
    const hash = sha256(bytes);
    return { root, version, file, bytes: bytes.length, hash, nativePatchSupported: nativePatches.some(profile => profile.sha256 === hash), compatible: blob === manifest.originalGitBlob, patched: blob === manifest.patchedGitBlob };
}
export function validatePackage(files: Record<string, Uint8Array>) {
    const entries = Object.entries(files).filter(([name]) => !name.endsWith("/"));
    if (entries.length !== Object.keys(manifest.files).length) throw new Error("عدد ملفات الحزمة غير مطابق.");
    for (const [name, expected] of Object.entries(manifest.files)) {
        const value = files[`discord_voice/${name}`];
        if (!value || value.length !== expected.bytes || sha256(value) !== expected.sha256) throw new Error(`بصمة الحزمة غير مطابقة: ${name}`);
    }
    return files["discord_voice/discord_voice.node"];
}
