/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mc5mr-update-test-"));
const asar = path.join(directory, "equicord.asar"), old = Buffer.alloc(2048, 1), next = Buffer.alloc(4096, 2);
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");
const tag = "equicord-v24-16";
let feed = { tag_name: tag, assets: [{ name: "desktop.asar", size: next.length, sha256: sha256(next) }] }, payload = next, hits = 0;
const get = (url, _options, callback) => {
    hits++;
    const request = new EventEmitter(); request.setTimeout = () => request; request.destroy = error => request.emit("error", error);
    queueMicrotask(() => {
        const response = new EventEmitter(); response.statusCode = 200; response.headers = {}; response.resume = () => {};
        response.destroy = error => response.emit("error", error);
        callback(response);
        response.emit("data", String(url).includes("latest.json") ? Buffer.from(JSON.stringify(feed)) : payload);
        response.emit("end");
    });
    return request;
};
const output = await build({ entryPoints: ["src/userplugins/Mc5mrUpdates.discordDesktop/native.ts"], bundle: true, write: false, platform: "node", format: "cjs", external: ["original-fs"], plugins: [{ name: "version", setup(b) {
    b.onResolve({ filter: /^~git-hash$/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export default "equicord-v24-15";' }));
} }] });
const module = { exports: {} };
vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, __dirname: asar, URL, Buffer, require: name => name === "https" ? { get } : name === "original-fs" ? fs : name === "crypto" ? crypto : undefined });
const check = () => module.exports.check({}, true);
try {
    fs.writeFileSync(asar, old);
    const results = await Promise.all([check(), check()]);
    assert.equal(results[0].state, "ready"); assert.equal(hits, 2, "concurrent requests share one download");
    assert.deepEqual(fs.readFileSync(asar), old, "the running archive is not replaced");
    assert.deepEqual(fs.readFileSync(asar + ".pending"), next);
    const source = fs.readFileSync("installer/app_asar.go", "utf8");
    const bootstrap = source.match(/var PendingUpdateBootstrap = `([^`]+)`/)[1];
    const promote = fsObject => vm.runInNewContext(bootstrap + "(target)", { target: asar, console, require: name => name === "original-fs" ? fsObject : crypto });
    promote(fs);
    assert.deepEqual(fs.readFileSync(asar), next); assert.deepEqual(fs.readFileSync(asar + ".previous"), old);
    assert.equal((await check()).state, "current");
    fs.writeFileSync(asar, old);
    await check();
    promote({ ...fs, renameSync(from, to) { if (from === asar + ".pending") throw Error("Simulated lock"); fs.renameSync(from, to); } });
    assert.deepEqual(fs.readFileSync(asar), old, "promotion failure rolls the previous archive back");
    fs.writeFileSync(asar + ".pending", Buffer.alloc(4096, 3));
    promote(fs);
    assert.deepEqual(fs.readFileSync(asar), old, "corrupt pending archives never replace the installed build");
    payload = Buffer.alloc(4096, 4);
    assert.equal((await check()).state, "error");
    assert.deepEqual(fs.readFileSync(asar), old);
    feed.tag_name = "equicord-v24-14";
    assert.equal((await check()).state, "current", "a cached older feed cannot downgrade a newer installation");
    feed.tag_name = "../../untrusted";
    assert.equal((await check()).state, "error");
    assert.equal((await module.exports.check({}, "yes")).state, "error");
    console.log("PASS: anonymous fixed feed, bounded download, SHA verification, deduplication, staged restart, promotion and rollback, corrupt archive refusal.");
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
