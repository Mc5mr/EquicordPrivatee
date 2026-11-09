/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { build } from "esbuild";

const root = await mkdtemp(resolve(".token-importer-test-"));
let profilePath = join(root, "stable");
const profileKey = createHash("sha256").update(process.platform === "win32" ? profilePath.toLowerCase() : profilePath).digest("hex").slice(0, 16);
const vaultPath = join(root, "tokenImporterMc5mr", profileKey, "accounts.encrypted");
const legacyVaultPath = join(root, "tokenImporterMc5mr", "accounts.encrypted");
const require = createRequire(import.meta.url);
let key = randomBytes(32);
const frame = { url: "https://discord.com/channels/@me" };
const event = { senderFrame: frame, sender: { mainFrame: frame } };
const token = "fixture-only.account.not-a-real-credential";
let requests = 0;
let status = 200;
let encryption = true;

const safeStorage = {
    isEncryptionAvailable: () => encryption,
    encryptString(value) {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    decryptString(bytes) {
        const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12), { authTagLength: 16 });
        cipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
    }
};

try {
    const output = await build({
        entryPoints: ["src/userplugins/tokenImporter.discordDesktop/native.ts"],
        bundle: true, write: false, platform: "node", format: "cjs",
        external: ["electron", "@main/utils/constants"]
    });
    const sandbox = {
        module: { exports: {} }, Buffer, URL, AbortSignal, process,
        require(name) {
            if (name === "electron") return { safeStorage, app: { getPath: () => profilePath } };
            if (name === "@main/utils/constants") return { DATA_DIR: root };
            if (name !== "https") return require(name);
            return { request(url, options, callback) {
                assert.equal(url, "https://discord.com/api/v10/users/@me");
                assert.equal(options.headers.Authorization, token);
                requests++;
                const req = new EventEmitter();
                req.end = () => queueMicrotask(() => {
                    const response = new EventEmitter();
                    response.statusCode = status;
                    response.headers = { "retry-after": "1" };
                    callback(response);
                    response.emit("data", Buffer.from(JSON.stringify({ id: "123456789012345678", username: "fixture", global_name: "Fixture" })));
                    response.emit("end");
                });
                return req;
            } };
        }
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(output.outputFiles[0].text, context);
    const native = context.module.exports;
    const initial = await native.listAccounts(event);
    assert.equal(initial.ok, true, "A missing vault must load as an empty account list, including filesystem errors from another JS context.");
    assert.equal(initial.value.length, 0);
    assert.equal((await native.addAccount(event, token)).ok, true);
    const encrypted = await readFile(vaultPath);
    assert.equal(encrypted.includes(Buffer.from(token)), false);
    assert.equal((await native.addAccount(event, token)).ok, true);
    const accounts = await native.listAccounts(event);
    assert.equal(accounts.value.length, 1);
    assert.equal("token" in accounts.value[0], false);
    assert.equal((await native.prepareLogin(event, accounts.value[0].id)).value.token, token);
    assert.equal((await native.exportTokens(event)).value, token);
    const before = requests;
    assert.equal((await native.addAccount({ senderFrame: { url: "https://example.com" }, sender: { mainFrame: frame } }, token)).ok, false);
    assert.equal((await native.addAccount(event, "invalid")).ok, false);
    assert.equal(requests, before);
    status = 401;
    assert.equal((await native.addAccount(event, token)).ok, false);
    assert.equal((await native.listAccounts(event)).value.length, 1);
    encryption = false;
    assert.equal((await native.listAccounts(event)).ok, false);
    encryption = true;
    await writeFile(vaultPath, Buffer.from("unreadable fixture vault"));
    const corrupt = await readFile(vaultPath);
    assert.equal((await native.addAccount(event, token)).ok, false);
    assert.deepEqual(await readFile(vaultPath), corrupt, "An unreadable vault must never be silently replaced.");
    await writeFile(vaultPath, encrypted);
    assert.equal((await native.removeAccount(event, accounts.value[0].id)).value.length, 0);
    console.log("Token Importer: fresh vault, encrypted save, replacement, verification failure, caller checks and corruption preservation passed.");
    await writeFile(legacyVaultPath, encrypted);
    await rm(vaultPath);
    assert.equal((await native.listAccounts(event)).value.length, 1, "Readable legacy accounts remain available.");
    status = 200;
    assert.equal((await native.addAccount(event, token)).ok, true);
    const stableBytes = await readFile(vaultPath);
    assert.deepEqual(await readFile(legacyVaultPath), encrypted);
    profilePath = join(root, "canary");
    key = randomBytes(32);
    const canaryContext = vm.createContext({ ...sandbox, module: { exports: {} } });
    vm.runInContext(output.outputFiles[0].text, canaryContext);
    const canaryNative = canaryContext.module.exports;
    const canaryAccounts = await canaryNative.listAccounts(event);
    assert.equal(canaryAccounts.ok, true);
    assert.equal(canaryAccounts.value.length, 0);
    assert.ok(canaryAccounts.notice);
    assert.equal((await canaryNative.addAccount(event, token)).ok, true, "Another installation can save without replacing an unreadable legacy vault.");
    assert.deepEqual(await readFile(vaultPath), stableBytes);
    assert.deepEqual(await readFile(legacyVaultPath), encrypted);
    console.log("Token Importer: readable legacy migration and isolated client vaults passed; the old encrypted file is preserved.");

    const uiOutput = await build({
        entryPoints: ["src/userplugins/tokenImporter.discordDesktop/ui.tsx"],
        bundle: true, write: false, platform: "node", format: "cjs", jsxFactory: "h", jsxFragment: "Fragment",
        plugins: [{ name: "discord-test-imports", setup(builder) {
            builder.onResolve({ filter: /^(?:@|\.\.\/NightcordUI)/ }, args => ({ path: args.path, external: true }));
        } }]
    });
    let component;
    let props;
    let activeId = "987654321098765432";
    let closed = 0;
    let loginCalls = 0;
    let cursor = 0;
    const hooks = [];
    const effects = [];
    const timers = new Map();
    const h = (type, props, ...children) => ({ type, props: { ...props, children } });
    const common = {
        Modal: "Modal", Avatar: "Avatar", TextInput: "TextInput", TextArea: "TextArea",
        UserStore: { getCurrentUser: () => ({ id: activeId }), getUser: () => null },
        useStateFromStores: (_stores, read) => read(),
        useState(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = initial;
            return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
        },
        useRef(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = { current: initial };
            return hooks[index];
        },
        useEffect(effect, deps) {
            const index = cursor++;
            const previous = hooks[index];
            if (previous && deps.every((value, offset) => value === previous.deps[offset])) return;
            previous?.cleanup?.();
            const entry = hooks[index] = { deps };
            effects.push(() => { entry.cleanup = effect(); });
        },
        openModal(render) {
            const node = render({ onClose: () => { closed++; }, transitionState: 1 });
            component = node.type;
            props = node.props;
        }
    };
    const uiContext = vm.createContext({
        module: { exports: {} }, h, Fragment: "Fragment",
        VencordNative: { pluginHelpers: { TokenImporter: {
            listAccounts: async () => ({ ok: true, value: [] }),
            addAccount: async value => {
                assert.equal(value, token);
                return { ok: true, value: { id: "123456789012345678", username: "fixture", displayName: "Fixture", verifiedAt: 1 } };
            },
            prepareLogin: async () => ({ ok: true, value: { token } })
        } } },
        window: { setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) },
        require(name) {
            if (name === "@webpack/common") return common;
            if (name === "@webpack") return { findByPropsLazy: () => ({ loginToken: () => { loginCalls++; } }) };
            if (name === "@components/ErrorBoundary") return { wrap: component => component };
            if (name === "@components/Button") return { Button: "Button" };
            if (name === "@components/Icons") return { CopyIdIcon: "Icon", DeleteIcon: "Icon", FolderIcon: "Icon" };
            if (name === "@utils/misc") return { classes: (...values) => values.filter(Boolean).join(" ") };
            return {};
        }
    });
    vm.runInContext(uiOutput.outputFiles[0].text, uiContext);
    uiContext.module.exports.openImporter();
    function render() {
        cursor = 0;
        const tree = component(props);
        for (const effect of effects.splice(0)) effect();
        return tree;
    }
    function nodes(tree) {
        if (Array.isArray(tree)) return tree.flatMap(nodes);
        if (!tree || typeof tree !== "object") return [];
        return [tree, ...nodes(tree.props?.children)];
    }
    render();
    await new Promise(resolve => setImmediate(resolve));
    let tree = render();
    nodes(tree).find(node => node.props?.id === "vc-ti-paste-tab").props.onClick();
    tree = render();
    nodes(tree).find(node => node.type === "TextArea").props.onChange(`\u200B"${token}"\n${token}`);
    tree = render();
    const addButton = nodes(tree).find(node => node.type === "Button" && node.props.children.includes("Verify & Add"));
    assert.equal(addButton.props.disabled, false);
    await addButton.props.onClick();
    tree = render();
    assert.ok(nodes(tree).find(node => node.props?.id === "vc-ti-saved-panel"), "Successful imports open Saved accounts.");
    const switchButton = nodes(tree).find(node => node.type === "Button" && node.props.children.includes("Switch"));
    assert.ok(switchButton);
    await switchButton.props.onClick();
    tree = render();
    assert.equal(loginCalls, 1);
    assert.equal(closed, 0, "Calling Discord sign-in is not proof the account switched.");
    assert.equal(timers.size, 1);
    activeId = "123456789012345678";
    render();
    assert.equal(closed, 1, "Close only when Discord confirms the requested active account.");
    assert.equal(timers.size, 0);
    console.log("Token Importer UI: waits for the requested account before closing, and clears the pending sign-in timer.");
} finally {
    await rm(root, { recursive: true, force: true });
}
