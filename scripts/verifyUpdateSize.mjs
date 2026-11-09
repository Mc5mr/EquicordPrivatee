import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const output = await build({
    entryPoints: ["src/userplugins/Mc5mrUpdates.discordDesktop/native.ts"],
    bundle: true, write: false, platform: "node", format: "cjs",
    external: ["original-fs", "https", "crypto", "~git-hash"]
});
let size = 46_452_362;
let calls = 0;
const context = vm.createContext({
    module: { exports: {} }, Buffer, URL, __dirname: "fixture.asar",
    require(name) {
        if (name === "~git-hash") return "equicord-v25-78";
        if (name === "original-fs") return { readFileSync: () => Buffer.from("installed fixture"), existsSync: () => false };
        if (name !== "https") return require(name);
        return { get(url, options, callback) {
            assert.equal(url.hostname, "raw.githubusercontent.com");
            assert.equal(options.headers["Cache-Control"], "no-cache");
            calls++;
            const request = new EventEmitter();
            request.setTimeout = () => request;
            queueMicrotask(() => {
                const response = new EventEmitter();
                response.statusCode = 200;
                callback(response);
                response.emit("data", Buffer.from(JSON.stringify({
                    tag_name: "equicord-v25-79", assets: [{ name: "desktop.asar", size, sha256: "a".repeat(64) }]
                })));
                response.emit("end");
            });
            return request;
        } };
    }
});
vm.runInContext(output.outputFiles[0].text, context);
assert.equal((await context.module.exports.check({}, false)).state, "available", "Current-sized packages must be offered.");
size = 65 * 1024 * 1024;
assert.equal((await context.module.exports.check({}, false)).state, "error", "Oversized packages must still be rejected.");
assert.equal(calls, 2, "Checking must fetch metadata only.");
console.log("Updater accepts the current 46 MB package, rejects oversized packages, and requests fresh metadata.");
