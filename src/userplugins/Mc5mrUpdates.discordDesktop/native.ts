/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "crypto";
import type { IpcMainInvokeEvent } from "electron";
import { get } from "https";
import { existsSync, readFileSync, renameSync, writeFileSync } from "original-fs";
import gitHash from "~git-hash";

const feed = "https://raw.githubusercontent.com/Mc5mr/EquicordPrivatee/main/latest.json";
const release = "https://github.com/Mc5mr/EquicordPrivatee/releases/download/";
const limit = 64 * 1024 * 1024;
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
let running: Promise<UpdateResult> | undefined;

export interface UpdateResult { state: "current" | "available" | "ready" | "error"; version?: string; message: string; }

function download(url: string, maximum: number, redirects = 0): Promise<Buffer> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["raw.githubusercontent.com", "github.com", "release-assets.githubusercontent.com"].includes(parsed.hostname)) return Promise.reject(new Error("Unexpected update address"));
    return new Promise((resolve, reject) => {
        const request = get(parsed, { headers: { "User-Agent": "Mc5mr-Equicord-Updater", "Cache-Control": "no-cache" } }, response => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume();
                if (redirects >= 5) { reject(new Error("Too many redirects")); return; }
                download(new URL(response.headers.location, parsed).href, maximum, redirects + 1).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) { response.resume(); reject(new Error("Update service unavailable")); return; }
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("error", reject);
            response.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > maximum) { response.destroy(new Error("Update exceeds size limit")); return; }
                chunks.push(chunk);
            });
            response.on("end", () => resolve(Buffer.concat(chunks)));
        });
        request.setTimeout(60_000, () => request.destroy(new Error("Update request timed out")));
        request.on("error", reject);
    });
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object"; }

async function update(install: boolean): Promise<UpdateResult> {
    try {
        if (!/\.asar$/i.test(__dirname)) return { state: "error", message: "التحديث التلقائي متاح لنسخة Mc5mr المثبتة بالواجهة." };
        const value: unknown = JSON.parse((await download(feed, 64 * 1024)).toString("utf8"));
        if (!isRecord(value) || typeof value.tag_name !== "string" || !/^equicord-v[1-9]\d*-[1-9]\d*$/.test(value.tag_name) || value.draft === true || value.prerelease === true || !Array.isArray(value.assets)) throw new Error("Invalid update feed");
        const asset = value.assets.find(a => isRecord(a) && a.name === "desktop.asar");
        if (!isRecord(asset) || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size < 1024 || asset.size > limit) throw new Error("Invalid update checksum");
        const version = value.tag_name;
        if (digest(readFileSync(__dirname)) === asset.sha256) return { state: "current", version, message: "نسختك محدثة." };
        const installed = /^equicord-v(\d+)-(\d+)$/.exec(gitHash);
        const offered = /^equicord-v(\d+)-(\d+)$/.exec(version);
        if (installed && offered && (Number(offered[1]) < Number(installed[1]) || (offered[1] === installed[1] && Number(offered[2]) <= Number(installed[2])))) return { state: "current", version: gitHash, message: "نسختك محدثة." };
        const pending = __dirname + ".pending";
        const ready = () => ({ state: "ready", version, message: "التحديث جاهز. سيُثبّت عند إغلاق Discord بالكامل وفتحه، وإعداداتك محفوظة." } satisfies UpdateResult);
        if (existsSync(pending) && digest(readFileSync(pending)) === asset.sha256 && existsSync(pending + ".json")) return ready();
        if (!install) return { state: "available", version, message: "يتوفر تحديث جديد." };
        const data = await download(release + version + "/desktop.asar", asset.size);
        if (data.length !== asset.size || digest(data) !== asset.sha256) throw new Error("Update checksum mismatch");
        writeFileSync(pending + ".download", data);
        renameSync(pending + ".download", pending);
        writeFileSync(pending + ".json", JSON.stringify({ sha256: asset.sha256, size: asset.size, version }));
        return ready();
    } catch {
        return { state: "error", message: "تعذر التحقق من التحديث. ستُعاد المحاولة تلقائيًا، وتقدر تستخدم نسختك الحالية." };
    }
}

export function check(_event: IpcMainInvokeEvent, install: boolean) {
    if (typeof install !== "boolean") return Promise.resolve({ state: "error", message: "طلب تحديث غير صالح." } satisfies UpdateResult);
    if (!running) running = update(install).finally(() => { running = undefined; });
    return running;
}
