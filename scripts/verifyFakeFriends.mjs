import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
async function load(accounts) {
    let owner = "me";
    let nativeVersion = 1;
    const listeners = new Set();
    const native = new Map([["real", 1]]);
    const requests = [];
    const store = {
        getRelationshipType: id => native.get(id) ?? 0,
        getMutableRelationships: () => native,
        isFriend: id => native.get(id) === 1,
        getFriendIDs: () => [...native].filter(([, type]) => type === 1).map(([id]) => id),
        getFriendCount: () => [...native.values()].filter(type => type === 1).length,
        getPendingCount: () => [...native.values()].filter(type => type === 3).length,
        getRelationshipCount: () => native.size,
        isUnfilteredPendingIncoming: id => native.get(id) === 3,
        isStranger: () => undefined,
        getSince: () => "2026-01-01",
        getSinces: () => ({ real: "2026-01-01" }),
        getVersion: () => nativeVersion,
        getOriginApplicationId: () => undefined,
        isSpam: () => false,
        isIgnored: () => false,
        emitChange() { for (const listener of listeners) listener(); }
    };
    const actions = {
        async addRelationship(...args) { requests.push(["add", ...args]); },
        async removeRelationship(...args) { requests.push(["remove", ...args]); },
        acceptFriendRequest(options) { return this.addRelationship(options); }
    };
    const settings = { store: { accounts }, withPrivateSettings() { return this; } };
    const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } });
    const stubs = { RelationshipStore: store, UserStore: { getCurrentUser: () => owner ? { id: owner } : undefined }, React: {}, Menu: { MenuGroup: "group", MenuItem: "item" }, showToast() {}, Toasts: { Type: { FAILURE: "failure" } } };
    const mocks = {
        "@webpack/common": `export const {${Object.keys(stubs).join(",")}}=globalThis.stubs;`,
        "@webpack": "export const findByPropsLazy=()=>globalThis.actions;",
        "@api/Settings": "export const definePluginSettings=()=>globalThis.settings;",
        "@utils/Logger": "export class Logger {error(){}}",
        "@utils/types": "export default value=>value;"
    };
    const result = await build({
        entryPoints: [root+"src/userplugins/FakeFriends.discordDesktop/index.tsx"], bundle: true, write: false,
        format: "iife", globalName: "Subject", jsxFactory: "h", platform: "browser",
        plugins: [{ name: "discord", setup(builder) {
            builder.onResolve({ filter: /^@/ }, args => ({ path: args.path, namespace: "mock" }));
            builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
        } }]
    });
    const context = { stubs, settings, actions, h, console };
    vm.createContext(context);
    vm.runInContext(result.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    const nativeFixture = JSON.parse(await readFile(new URL("fixtures/friend-requests.json", import.meta.url), "utf8"));
    const replacement = plugin.patches[0].replacement;
    const expression = new RegExp(replacement.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"), replacement.match.flags);
    const patchedNative = nativeFixture.module.replace(expression, replacement.replace);
    assert.notEqual(patchedNative, nativeFixture.module, "request refresh patch matches the actual native store");
    let nativeRequests;
    const configStore = {};
    class NativeStore {
        constructor(_dispatcher, handlers) { this.handlers = handlers; this.initialize(); nativeRequests = this; }
        waitFor() {}
        syncWith(stores, update) { if (stores.includes(store)) listeners.add(update); }
    }
    const dependencies = {
        17928: { Ay: { Store: NativeStore } }, 73153: { h: {} }, 945810: { Bt: configStore },
        800828: { A: { getGameRelationshipsForUser: () => [], getGameRelationshipsByType: () => [] } },
        994500: { A: store }, 925166: { A: { getConfig: () => ({ sidebarEnabled: true }) } },
        652215: { eA$: { PENDING_INCOMING: 3, PENDING_OUTGOING: 4 } }
    };
    const nativeRequire = id => dependencies[id] ?? {};
    nativeRequire.d = (target, getters) => { for (const [key, get] of Object.entries(getters)) Object.defineProperty(target, key, { get }); };
    vm.runInNewContext(`({${patchedNative}})[902902]`, {})(null, {}, nativeRequire);
    function menu(id = "person") { const nodes = []; plugin.contextMenus["user-context"](nodes, { user: { id } }); return nodes.flatMap(node => node.props.children); }
    return { plugin, store, actions, settings, requests, native, nativeRequests, menu, setOwner(value) { owner = value; }, setReal(id, type) { native.set(id, type); nativeVersion++; store.emitChange(); } };
}
const subject = await load();
const originalMap = subject.store.getMutableRelationships;
const originalAdd = subject.actions.addRelationship;
subject.plugin.start();
assert.equal(subject.menu("me").length, 0);
assert.equal(subject.menu("real")[0].props.disabled, true, "real relationships stay managed by Discord");
assert.equal(subject.menu().length, 2);
assert.equal(subject.menu()[0].type, "item", "context choices use ordinary menu rows");
subject.menu()[0].props.action();
assert.equal(subject.store.isFriend("person"), true);
assert.equal(subject.store.getFriendCount(), 2);
assert.equal(subject.store.getRelationshipCount(), 2);
assert.deepEqual(Array.from(subject.store.getFriendIDs()), ["real", "person"]);
assert.equal(subject.store.getMutableRelationships().get("person"), 1);
assert.equal(subject.store.getMutableRelationships(), subject.store.getMutableRelationships(), "unchanged reads reuse the merged view instead of rebuilding the full relationship map");
assert.equal(subject.store.getFriendIDs(), subject.store.getFriendIDs());
assert.equal(subject.store.getSinces(), subject.store.getSinces());
assert.equal(subject.native.has("person"), false, "previews never mutate the native relationship map");
subject.menu()[1].props.action();
assert.equal(subject.store.getRelationshipType("person"), 3);
assert.equal(subject.store.getPendingCount(), 1);
assert.equal(subject.store.isUnfilteredPendingIncoming("person"), true);
assert.equal(subject.nativeRequests.getIncomingRequests()[0].userId, "person", "the actual native request sidebar updates during the same local action");
await subject.actions.acceptFriendRequest({ userId: "person" });
assert.equal(subject.store.getRelationshipType("person"), 1);
assert.equal(subject.store.getPendingCount(), 0);
assert.equal(subject.nativeRequests.getIncomingRequests().length, 0, "accepting a local request removes the native sidebar row immediately");
await subject.actions.removeRelationship("person");
assert.equal(subject.store.getRelationshipType("person"), 0);
assert.equal(subject.requests.length, 0, "accepting and removing a fake relationship are local");
subject.menu()[1].props.action();
subject.setOwner("second");
subject.plugin.flux.CONNECTION_OPEN();
assert.equal(subject.store.getPendingCount(), 0, "another account cannot see this account's previews");
subject.setOwner("me");
subject.plugin.flux.CONNECTION_OPEN();
assert.equal(subject.store.getPendingCount(), 1);
const saved = JSON.parse(JSON.stringify(subject.settings.store.accounts));
await subject.actions.addRelationship({ userId: "real", type: 1 }, undefined, "preserved-extra-argument");
assert.equal(subject.requests.length, 1, "real relationship actions remain wired to Discord");
assert.equal(subject.requests[0].at(-1), "preserved-extra-argument");
subject.setReal("person", 1);
assert.equal(subject.store.getRelationshipType("person"), 1, "a genuine relationship supersedes its old preview");
assert.equal(subject.store.getPendingCount(), 0);
subject.plugin.stop();
assert.equal(subject.store.getMutableRelationships, originalMap);
assert.equal(subject.actions.addRelationship, originalAdd);
assert.equal(subject.nativeRequests.getIncomingRequests().length, 0, "disable clears local rows from the native request cache");
const restarted = await load(saved);
restarted.plugin.start();
restarted.plugin.start();
assert.equal(restarted.store.getPendingCount(), 1, "previews survive restart for their original account");
assert.equal(restarted.nativeRequests.getIncomingRequests().length, 1);
restarted.plugin.stop();
assert.equal(restarted.nativeRequests.getIncomingRequests().length, 0);
const locked = await load();
Object.freeze(locked.actions);
const nativeMethod = locked.store.getRelationshipType;
assert.doesNotThrow(() => locked.plugin.start());
assert.equal(locked.store.getRelationshipType, nativeMethod, "read-only action exports roll back partial hooks");
console.log("PASS: immediate actual native request-store refresh, stable merged relationship views, local accept/remove, real-action forwarding, account isolation, restart and reversible hooks.");
