/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

const calls = [], listeners = new Set();
const plugins = {
    HeaderBarAPI: { name: "HeaderBarAPI", patches: [{}] },
    MessageAccessoriesAPI: { name: "MessageAccessoriesAPI" },
    ChatInputButtonAPI: { name: "ChatInputButtonAPI" },
    Later: { name: "Later", headerBarButton: { render() {} }, renderMessageAccessory() { return this.name; }, flux: { TEST() { throw Error("Expected handler failure"); } } },
    Wrapper: { name: "Wrapper", chatBarButtonWrapper: { wrapper() {} } },
    Broken: { name: "Broken", dependencies: ["Missing"] }
};
const settings = { plugins: Object.fromEntries(Object.keys(plugins).map(name => [name, { enabled: false }])) };
const stubs = {
    Settings: settings, SettingsStore: { addChangeListener() {} },
    Logger: class { info() {} debug() {} warn() {} error() {} },
    traceFunction: (_name, callback) => callback, onlyOnce: callback => callback,
    ReporterTestable: {}, StartAt: { WebpackReady: 2 },
    FluxDispatcher: { subscribe: (_event, fn) => listeners.add(fn), unsubscribe: (_event, fn) => listeners.delete(fn) }, patches: []
};
const source = ts.createSourceFile("PluginManager.ts", await readFile("src/api/PluginManager.ts", "utf8"), ts.ScriptTarget.Latest, true);
const modules = new Map();
for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const id = statement.moduleSpecifier.text;
    if (id === "~plugins") { modules.set(id, "export default globalThis.plugins;"); continue; }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const names = bindings.elements.map(element => element.name.text);
    for (const name of names) if (!(name in stubs)) stubs[name] = (...args) => calls.push({ name, args });
    modules.set(id, `export const {${names.join(",")}}=globalThis.stubs;`);
}
const bundle = await build({ entryPoints: ["src/api/PluginManager.ts"], bundle: true, write: false, format: "iife", globalName: "Manager", plugins: [{ name: "lifecycle", setup(b) {
    b.onResolve({ filter: /.*/ }, args => modules.has(args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules.get(args.path) }));
} }] });
const context = { stubs, plugins, IS_REPORTER: false, IS_DEV: false };
vm.runInNewContext(bundle.outputFiles[0].text, context);
const manager = context.Manager;
manager.initPluginManager();
const detachedRender = plugins.Later.renderMessageAccessory;
assert.equal(detachedRender(), "Later", "initially disabled callbacks are still bound");
const deps = manager.startDependenciesRecursive(plugins.Later);
assert.equal(deps.restartNeeded, true, "patched API activation reports the required restart");
assert.equal(settings.plugins.HeaderBarAPI.enabled, true);
assert.equal(settings.plugins.MessageAccessoriesAPI.enabled, true);
assert.equal(plugins.MessageAccessoriesAPI.started, true);
assert.equal(manager.startDependenciesRecursive(plugins.Broken).failures[0], "Missing");
manager.startDependenciesRecursive(plugins.Wrapper);
assert.equal(plugins.ChatInputButtonAPI.started, true);
manager.subscribeAllPluginsFluxEvents(stubs.FluxDispatcher);
settings.plugins.Later.enabled = true;
manager.startPlugin(plugins.Later);
const registrations = calls.filter(call => call.name === "addHeaderBarButton").length;
manager.startPlugin(plugins.Later);
assert.equal(calls.filter(call => call.name === "addHeaderBarButton").length, registrations, "duplicate starts do not register UI twice");
for (const listener of listeners) listener();
assert.equal(settings.plugins.Later.enabled, true, "a handler failure does not switch the plugin off");
manager.stopPlugin(plugins.Later);
assert.equal(listeners.size, 0);
assert.equal(calls.filter(call => call.name === "removeHeaderBarButton").length, 1);
console.log("PASS: disabled-plugin callback binding, declarative API dependencies, restart propagation, missing dependencies, duplicate starts and paired flux/UI lifecycle.");
