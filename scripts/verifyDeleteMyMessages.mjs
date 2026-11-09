/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";

const owner = "523157034141745153", other = "336713233257857024";
const channelId = "123456789012345678", boundary = "999999999999999999";
const id = index => String(900000000000000000n - BigInt(index));
const message = (index, author = owner, type = 0) => ({ id: id(index), channel_id: channelId, author: { id: author }, type });
const modules = new Map([
    ["@api/Commands", "export const generateId=globalThis.stubs.generateId,sendBotMessage=globalThis.stubs.sendBotMessage;"],
    ["@api/MessageUpdater", "export const updateMessage=globalThis.stubs.updateMessage;"],
    ["@components/Paragraph", "export const Paragraph='Paragraph';"],
    ["@utils/constants", "export const Devs={Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
    ["@utils/types", "export default value=>value;"],
    ["@webpack/common", "export const {ChannelStore,closeModal,ConfirmModal,Constants,FluxDispatcher,MessageStore,openModal,RestAPI,SnowflakeUtils,UserStore}=globalThis.stubs;"]
]);
const output = await build({ entryPoints: ["src/userplugins/DeleteMyMessages.discordDesktop/index.tsx"], bundle: true, write: false, format: "iife", globalName: "Subject", jsxFactory: "h", plugins: [{ name: "delete-fixture", setup(b) {
    b.onResolve({ filter: /.*/ }, args => modules.has(args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules.get(args.path) }));
} }] });

function load(history = [message(0)], options = {}) {
    const requests = [], local = [], events = [], timers = new Map(), dialogs = new Map(), delays = [];
    const channels = new Map([[channelId, { id: channelId, type: 1 }], ["group", { id: "group", type: 3 }], ["guild", { id: "guild", type: 0, guild_id: "guild" }]]);
    let account = owner, nextTimer = 0, nextMessage = 0, done = false;
    const h = (type, props, ...children) => ({ type, props: { ...props, children } });
    const stubs = {
        generateId: () => `-${++nextMessage}`,
        sendBotMessage: (destination, value) => { local.push({ channelId: destination, ...value }); },
        updateMessage: (destination, messageId, fields) => { local.push({ channelId: destination, id: messageId, ...fields }); },
        MessageStore: { getMessage: () => ({}) },
        ChannelStore: { getChannel: value => channels.get(value) },
        UserStore: { getCurrentUser: () => account ? { id: account } : undefined, getUser: value => ({ id: value, username: `User ${value}` }) },
        Constants: { Endpoints: { MESSAGES: value => `history:${value}`, MESSAGE: (destination, value) => `message:${destination}:${value}` } },
        FluxDispatcher: { dispatch: async value => { events.push(value); } },
        SnowflakeUtils: { fromTimestamp: () => boundary }, ConfirmModal: "ConfirmModal",
        openModal: (render, modalOptions) => {
            const close = () => { dialogs.delete(modalOptions.modalKey); modalOptions.onCloseCallback(); };
            const node = render({ onClose: close });
            dialogs.set(modalOptions.modalKey, { node, close });
            if (options.confirm !== "defer") queueMicrotask(() => options.confirm === false ? node.props.onCancel() : node.props.onConfirm());
            options.onConfirmOpen?.(node);
        },
        closeModal: key => dialogs.get(key)?.close(),
        RestAPI: {
            get: async request => {
                requests.push({ method: "GET", ...request });
                if (options.get) return options.get(request, requests);
                return { body: history.filter(value => BigInt(value.id) < BigInt(request.query.before)).slice(0, 100) };
            },
            del: async request => {
                requests.push({ method: "DELETE", ...request });
                return options.del ? options.del(request, requests) : { status: 204, ok: true };
            }
        }
    };
    const context = { stubs, h, queueMicrotask, Date,
        setTimeout: (callback, delay) => { delays.push(delay); const key = ++nextTimer; timers.set(key, callback); return key; },
        clearTimeout: key => timers.delete(key) };
    vm.runInNewContext(output.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    plugin.start();
    return {
        plugin, stubs, requests, local, events, timers, dialogs, delays, channels,
        account: value => { account = value; },
        run: (destination = channelId) => {
            done = false;
            const result = plugin.commands[0].execute([], { channel: channels.get(destination) });
            Promise.resolve(result).then(() => { done = true; });
            return result;
        },
        cancel: (destination = channelId) => plugin.commands[1].execute([], { channel: channels.get(destination) }),
        done: () => done,
        async flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); },
        async drive() {
            for (let i = 0; i < 1000 && !done; i++) {
                await this.flush();
                for (const [key, callback] of [...timers]) { timers.delete(key); callback(); }
            }
            await this.flush();
            assert.equal(done, true, "operation terminates");
        },
        deleted: () => requests.filter(value => value.method === "DELETE"),
        last: () => local.at(-1)?.content
    };
}

const many = Array.from({ length: 203 }, (_, index) => message(index, index % 3 === 0 ? owner : other));
many[6].type = 3;
const paged = load(many);
assert.equal(paged.plugin.commands[0].name, "delete");
assert.equal(paged.plugin.commands[0].predicate({ channel: { type: 1 } }), true);
assert.equal(paged.plugin.commands[0].predicate({ channel: { type: 3 } }), true);
assert.equal(paged.plugin.commands[0].predicate({ channel: { type: 0, guild_id: "g" } }), false);
const pagedPromise = paged.run(); await paged.drive(); await pagedPromise;
const expected = many.filter(value => value.author.id === owner && value.type !== 3);
assert.equal(paged.deleted().length, expected.length);
assert.deepEqual(paged.deleted().map(value => value.url), expected.map(value => `message:${channelId}:${value.id}`));
assert.equal(paged.requests.filter(value => value.method === "GET").length, 3);
assert.equal(paged.requests[0].query.before, boundary);
assert.ok(paged.requests.every(value => value.retries === 0));
assert.match(paged.last(), new RegExp(`مجموع رسائلك: ${expected.length}.*حُذف بنجاح: ${expected.length}.*المتبقي: 0`));
assert.equal(paged.events.length, expected.length);
assert.equal(paged.timers.size, 0); assert.equal(paged.dialogs.size, 0);
assert.ok(paged.delays.includes(1500));

const group = load([{ ...message(0), channel_id: "group" }]);
await group.run("group"); assert.equal(group.deleted()[0].url, `message:group:${id(0)}`);
const guild = load(); await guild.run("guild"); assert.equal(guild.requests.length, 0);
const noOwn = load([message(0, other), message(1, owner, 3)]); await noOwn.run(); assert.equal(noOwn.deleted().length, 0); assert.equal(noOwn.dialogs.size, 0);

const declined = load([message(0)], { confirm: false }); await declined.run();
assert.equal(declined.deleted().length, 0); assert.match(declined.last(), /حُذف بنجاح: 0.*المتبقي: 1/);
const pendingConfirmation = load([message(0)], { confirm: "defer" });
const pendingPromise = pendingConfirmation.run(); await pendingConfirmation.flush();
assert.equal(pendingConfirmation.dialogs.size, 1);
assert.ok(pendingConfirmation.dialogs.values().next().value.node.props.title.includes(channelId), "confirmation identifies the original target conversation");
pendingConfirmation.cancel(); await pendingPromise;
assert.equal(pendingConfirmation.dialogs.size, 0); assert.equal(pendingConfirmation.deleted().length, 0);

let finishRead;
const cancelledScan = load([], { get: () => new Promise(resolve => { finishRead = resolve; }) });
const scanPromise = cancelledScan.run(); await cancelledScan.flush();
cancelledScan.cancel(); finishRead({ body: [message(0)] }); await scanPromise;
assert.equal(cancelledScan.deleted().length, 0); assert.match(cancelledScan.last(), /لم يبدأ الحذف/);

const cancelled = load([message(0), message(1), message(2)]);
const cancelledPromise = cancelled.run(); await cancelled.flush();
assert.equal(cancelled.deleted().length, 1); assert.equal(cancelled.timers.size, 1);
cancelled.cancel(); assert.match(cancelled.last(), /لن تبدأ طلبات جديدة/); await cancelledPromise;
assert.equal(cancelled.deleted().length, 1); assert.equal(cancelled.timers.size, 0);
assert.match(cancelled.last(), /حُذف بنجاح: 1.*المتبقي: 2/);

let finishDelete;
const inFlight = load([message(0), message(1)], { del: () => new Promise(resolve => { finishDelete = resolve; }) });
const inFlightPromise = inFlight.run(); await inFlight.flush();
inFlight.cancel(); finishDelete({ status: 204 }); await inFlightPromise;
assert.equal(inFlight.deleted().length, 1); assert.match(inFlight.last(), /حُذف بنجاح: 1.*المتبقي: 1/);

const changedAtConfirmation = load([message(0)], { confirm: "defer" });
const changedPromise = changedAtConfirmation.run(); await changedAtConfirmation.flush();
changedAtConfirmation.account(other);
changedAtConfirmation.dialogs.values().next().value.node.props.onConfirm(); await changedPromise;
assert.equal(changedAtConfirmation.deleted().length, 0, "confirmation cannot delete under a different account");

const pausedScan = load(many);
const pausedScanPromise = pausedScan.run(); await pausedScan.flush();
assert.equal(pausedScan.timers.size, 1); pausedScan.cancel(); await pausedScanPromise;
assert.equal(pausedScan.requests.length, 1); assert.equal(pausedScan.timers.size, 0);

const stopped = load([message(0), message(1)]);
const stoppedPromise = stopped.run(); await stopped.flush(); stopped.plugin.stop(); await stoppedPromise;
assert.equal(stopped.deleted().length, 1); assert.equal(stopped.timers.size, 0);
stopped.plugin.start(); const restarted = stopped.run(); await stopped.drive(); await restarted;
assert.equal(stopped.deleted().length, 3, "new session is not blocked by a cancelled job");

const swapped = load([message(0), message(1)]);
const swappedPromise = swapped.run(); await swapped.flush(); swapped.account(other); await swapped.drive(); await swappedPromise;
assert.equal(swapped.deleted().length, 1, "account changes prevent the next deletion");
const loggedOut = load([message(0), message(1)]);
const logoutPromise = loggedOut.run(); await loggedOut.flush(); loggedOut.plugin.flux.LOGOUT(); await logoutPromise;
assert.equal(loggedOut.deleted().length, 1); assert.equal(loggedOut.timers.size, 0);

let deleteAttempts = 0;
const throttled = load([message(0)], { del: async () => { if (++deleteAttempts === 1) throw { status: 429, body: { retry_after: 3.25 } }; return { status: 204 }; } });
const throttlePromise = throttled.run(); await throttled.drive(); await throttlePromise;
assert.equal(deleteAttempts, 2); assert.ok(throttled.delays.includes(3250)); assert.match(throttled.last(), /حُذف بنجاح: 1/);
const retryStop = load([message(0)], { del: async () => { throw { status: 429, body: { retry_after: 600 } }; } });
const retryPromise = retryStop.run(); await retryStop.flush(); assert.equal(retryStop.timers.size, 1);
retryStop.cancel(); await retryPromise; assert.equal(retryStop.deleted().length, 1); assert.equal(retryStop.timers.size, 0);
const exhausted = load([message(0)], { del: async () => { throw { status: 429, body: { retry_after: 0 } }; } });
const exhaustedPromise = exhausted.run(); await exhausted.drive(); await exhaustedPromise;
assert.equal(exhausted.deleted().length, 6); assert.match(exhausted.last(), /حُذف بنجاح: 0.*المتبقي: 1/);

const gone = load([message(0)], { del: async () => { throw { status: 404, body: { code: 10008 } }; } });
await gone.run(); assert.match(gone.last(), /حُذف بنجاح: 0.*غير موجودة مسبقًا: 1.*المتبقي: 0/);
for (const error of [{ status: 403 }, { status: 404, body: { code: 10003 } }, { status: 429, body: { retry_after: NaN } }]) {
    const rejected = load([message(0), message(1)], { del: async () => { throw error; } });
    await rejected.run(); assert.equal(rejected.deleted().length, 1); assert.match(rejected.last(), /حُذف بنجاح: 0.*المتبقي: 2/);
}
const resolvedError = load([message(0)], { del: async () => ({ status: 403, ok: false }) });
await resolvedError.run(); assert.match(resolvedError.last(), /حُذف بنجاح: 0/);

for (const body of [[{ ...message(0), channel_id: "other" }], [{ ...message(0), id: boundary }], [{ ...message(0), id: "local-preview" }], {}]) {
    const malformed = load([], { get: async () => ({ body }) });
    await malformed.run(); assert.equal(malformed.deleted().length, 0); assert.match(malformed.last(), /لم يبدأ الحذف/);
}
const duplicate = load([], { get: async () => ({ body: [message(0), message(0)] }) });
await duplicate.run(); assert.equal(duplicate.deleted().length, 1, "duplicate history rows cannot delete twice");
const repeatingPage = Array.from({ length: 100 }, (_, index) => message(index));
const repeating = load([], { get: async () => ({ body: repeatingPage }) });
const repeatedPromise = repeating.run(); await repeating.drive(); await repeatedPromise;
assert.equal(repeating.deleted().length, 0); assert.equal(repeating.requests.length, 2);

const concurrent = load([message(0)], { confirm: "defer" });
const first = concurrent.run(); await concurrent.flush();
await concurrent.plugin.commands[0].execute([], { channel: concurrent.channels.get(channelId) });
assert.equal(concurrent.requests.length, 1);
concurrent.cancel("group"); assert.equal(concurrent.dialogs.size, 1, "cancellation is scoped to the original conversation");
concurrent.cancel(); await first;
assert.equal(concurrent.deleted().length, 0);

console.log("PASS: /delete DM/group scope, own-message pagination, confirmation, accurate counts, cancellation, lifecycle and account guards, bounded rate-limit retries, missing messages, malformed responses, and concurrent execution. No live messages were read or deleted.");
