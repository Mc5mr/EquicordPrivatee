/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";

const channels = {
    dm: { id: "dm", type: 1 }, group: { id: "group", type: 3 }, read: { id: "read", type: 1 },
    empty: { id: "empty", type: 1 }, guild: { id: "guild", type: 0, guild_id: "server" }
};
const unread = new Set(["dm", "group", "empty", "guild"]);
const last = new Map([["dm", "101"], ["group", "202"], ["read", "303"], ["guild", "404"]]);
const acknowledgements = [], toasts = [];
const pending = { current: false };
let busy = false, owner = "owner", release, fail = false;
const h = (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } });
const stubs = {
    React: { useState: () => [busy, value => { busy = value; }], useRef: () => pending },
    ChannelStore: { getMutablePrivateChannels: () => channels },
    ReadStateStore: { hasUnreadOrMentions: id => unread.has(id), lastMessageId: id => last.get(id) ?? null },
    UserStore: { getCurrentUser: () => owner ? { id: owner } : undefined },
    useStateFromStores: (_stores, read) => read(), Tooltip: "Tooltip",
    FluxDispatcher: { dispatch: async event => { if (fail) throw Error("Dispatch failed"); acknowledgements.push(event); await new Promise(resolve => { release = resolve; }); } },
    showToast: message => toasts.push(message), Toasts: { Type: { FAILURE: "failure" } }
};
const modules = new Map([
    ["@components/Button", "export const Button='Button';"],
    ["@components/ErrorBoundary", "export default {wrap: render=>render};"],
    ["@components/Icons", "export const DoubleCheckmarkIcon='Check';"],
    ["@utils/constants", "export const Devs={Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
    ["@utils/types", "export default value=>value;"],
    ["@webpack/common", `export const {${Object.keys(stubs).join(",")}}=globalThis.stubs;`]
]);
const output = await build({ entryPoints: ["src/userplugins/ReadAllDMs.discordDesktop/index.tsx"], bundle: true, write: false, format: "iife", globalName: "Subject", jsxFactory: "h", plugins: [{ name: "dm-read-fixture", setup(b) {
    b.onResolve({ filter: /\.css\?managed$/ }, () => ({ path: "style", namespace: "fixture" }));
    b.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules.get(args.path) ?? "export default '';", loader: "js" }));
} }] });
const context = { stubs, h };
vm.runInNewContext(output.outputFiles[0].text, context);
const plugin = context.Subject.default;
const button = () => plugin.renderReadAllDMsButton().props.children({});
assert.equal(button().props.disabled, false);
let stopped = 0;
const event = { stopPropagation() { stopped++; } };
const first = button().props.onClick(event);
assert.equal(busy, true);
assert.equal(button().props.disabled, true);
await button().props.onClick(event);
assert.equal(acknowledgements.length, 1, "repeated clicks cannot queue duplicate bulk reads");
assert.equal(stopped, 2, "the read button does not toggle a collapsible DM heading");
assert.equal(acknowledgements[0].type, "BULK_ACK");
assert.deepEqual(JSON.parse(JSON.stringify(acknowledgements[0].channels)), [
    { channelId: "dm", messageId: "101", readStateType: 0 },
    { channelId: "group", messageId: "202", readStateType: 0 }
]);
last.set("dm", "999");
assert.equal(acknowledgements[0].channels[0].messageId, "101", "messages arriving after the click stay outside its read snapshot");
release(); await first;
assert.equal(busy, false);
unread.clear();
assert.equal(button().props.disabled, true);
await button().props.onClick(event);
assert.equal(acknowledgements.length, 1);
unread.add("dm");
owner = null;
await button().props.onClick(event);
assert.equal(acknowledgements.length, 1, "logged out clicks do nothing");
owner = "owner"; fail = true;
await button().props.onClick(event);
assert.equal(toasts.length, 1);
assert.equal(busy, false);
assert.equal(pending.current, false);
assert.equal(typeof plugin.headerBarButton.render, "function");
assert.equal(plugin.patches, undefined, "the toolbar button does not depend on a DM-heading patch");
console.log("PASS: top toolbar private/group read, guild exclusion, snapshot safety, duplicate clicks, logout and failure recovery.");
