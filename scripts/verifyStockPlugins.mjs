/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import vm from "node:vm";

let now = 1000, state = { userId: "owner", channelId: "voice", guildId: "guild" }, timerInitial;
let translationFailure = false;
let googleFailure = false, googleEmpty = false, translatedURL;
const modals = [], effects = [], toasts = [], updates = [];
const h = (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } });
const stubs = {
    React: {}, UserStore: { getCurrentUser: () => ({ id: "owner" }) },
    VoiceStateStore: { getVoiceStateForUser: () => state }, GuildStore: { getGuilds: () => ({}) },
    FluxDispatcher: { dispatch: () => {} }, useStateFromStores: (_stores, read) => read(),
    useFixedTimer: ({ initialTime }) => { timerInitial = initialTime; return initialTime ? now - initialTime : 0; },
    useEffect: callback => { effects.push(callback()); }, useState: () => [undefined, value => updates.push(value)],
    Parser: { parse: text => text }, Modal: "Modal", openModal: render => modals.push(render({ onClose() {} })),
    setColorPicker() {}, setCreateScroller() {}, setNewCustomizationSection() {}, setRoleMemberPopout() {},
    showToast: text => toasts.push(text), Toasts: { Type: { FAILURE: "failure" } }
};
const modules = new Map([
    ["@api/Settings", "export const definePluginSettings=def=>({store:Object.fromEntries(Object.entries(def).map(([key,value])=>[key,value.default??value.options?.find(option=>option.default)?.value]))});"],
    ["@utils/types", "export default value=>value; export const OptionType={SELECT:1,BOOLEAN:2};"],
    ["@utils/constants", "export const Devs={Ven:{},D3SOX:{},KingFish:{},Nuckyz:{}},EquicordDevs={MaxHerbold:{}};"],
    ["@components/ErrorBoundary", "const Component='ErrorBoundary'; export default Object.assign(()=>{}, {wrap:render=>render});"],
    ["@utils/react", "export const useFixedTimer=globalThis.stubs.useFixedTimer;"],
    ["@utils/text", "export const formatDurationMs=String;"],
    ["@webpack/common", `export const {${Object.keys(stubs).join(",")}}=globalThis.stubs;`],
    ["./Timer", "export const Timer='Timer';"], ["./icon", "export const Icon='Icon';"],
    ["./TranslateIcon", "export const TranslateIcon='Icon';"],
    ["./translator", "export const translate=async()=>{if(globalThis.translationFailure())throw Error('Translation failed');return {src:'en',text:'مرحبا'};};"],
    ["./utils", "export const cl=value=>value;"],
    ["@equicordplugins/translatePlus/misc/types", "export const cl=value=>value;"],
    ["@equicordplugins/translatePlus/misc/languages", "export const languages={en:'English'};"]
    , ["@equicordplugins/translatePlus/settings", "export const settings={store:{target:'ar',toki:false,sitelen:false,shavian:false}};"]
]);
async function load(file) {
    const out = await build({ entryPoints: [file], bundle: true, write: false, format: "iife", globalName: "Subject", jsxFactory: "h", plugins: [{ name: "stock-fixture", setup(b) {
        b.onResolve({ filter: /\.css(?:\?managed)?$/ }, () => ({ path: "style", namespace: "fixture" }));
        b.onResolve({ filter: /.*/ }, args => modules.has(args.path) ? { path: args.path, namespace: "fixture" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: modules.get(args.path) ?? "export default '';", loader: "js" }));
    } }] });
    class Clock extends Date { static now() { return now; } }
    const context = { stubs, h, Date: Clock, URLSearchParams, translationFailure: () => translationFailure,
        fetch: async url => { translatedURL = new URL(url); return { ok: !googleFailure, status: googleFailure ? 429 : 200, json: async () => googleEmpty ? {} : { src: "en", sentences: [{ trans: "مر" }, { trans: "حبا" }] } }; } };
    vm.runInNewContext(out.outputFiles[0].text, context);
    return context.Subject;
}
const timer = (await load("src/plugins/callTimer/index.tsx")).default;
timer.start(); timer.ConnectionTimer({ channelId: "voice" });
assert.equal(timerInitial, 1000, "enabling while already connected seeds the own call timer");
now = 31000;
assert.equal(timer.ConnectionTimer({ channelId: "voice" }).props.children, "30000");
state = { ...state, channelId: "other", oldChannelId: "voice" };
timer.flux.VOICE_STATE_UPDATES({ voiceStates: [state] });
timer.ConnectionTimer({ channelId: "other" });
assert.equal(timerInitial, now, "moving to another room resets the timer");
state = { ...state, channelId: null, oldChannelId: "other" };
timer.flux.VOICE_STATE_UPDATES({ voiceStates: [state] });
assert.equal(timer.ConnectionTimer({ channelId: undefined }), null);
timer.stop();

const canonical = regex => new RegExp(regex.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"), regex.flags);
const connection = 'function panel(){return(0,b.jsxs)("div",{children:[action("RTCConnectionMenu",position),render({variant:"text-md/medium",color:"none",style:{paddingTop:4,height:"auto"},className:classes,children:heading}),render({className:labelClass,children:render({variant:"text-xs/medium",color:"text-subtle",lineClamp:1,children:channelName})})]})}';
const callPatch = timer.patches[1].replacement;
assert.equal([...connection.matchAll(new RegExp(canonical(callPatch.match).source, "g"))].length, 1);
const patchedConnection = connection.replace(canonical(callPatch.match), callPatch.replace.replaceAll("$self", "plugin"));
assert.ok(patchedConnection.includes("plugin.renderConnectionTimer"));
new Function("plugin", patchedConnection);
const popover = (await load("src/plugins/_api/messagePopover.ts")).default.patches[0].replacement;
const toolbar = 'function buttons(){return [k?(0,a.jsx)(nt.qv,{label:intl.string(strings.markRead),icon:check,onClick:()=>(0,actions.ack)(channel,message)},"mark-unread"):null,reaction?(0,a.jsxs)(a.Fragment,{children:[quickReactions,emojiPicker]}):null]}';
const patchedToolbar = toolbar.replace(canonical(popover.match), popover.replace);
assert.ok(patchedToolbar.includes("_buildPopoverElements(nt.qv,message)"));
assert.ok(patchedToolbar.includes("quickReactions,emojiPicker"), "native reactions remain unchanged");
new Function("Vencord", patchedToolbar);
const extractor = (await load("src/plugins/_core/concatenatedComponentExtractor.tsx")).default.patches[1].replacement;
for (const body of ['return function(a){let{children:h,className:f,dir:I="ltr",orientation:p="vertical"}=a;return h}', 'return r.forwardRef(function(a,ref){let{children:h,className:f,dir:I="ltr",orientation:p="vertical"}=a;return h})']) {
    const source = `function create(e,t,n){${body}}`;
    assert.ok(canonical(extractor.match).test(source), "both current props-ref and legacy forwardRef scrollers resolve");
    new Function("plugin", source.replace(canonical(extractor.match), extractor.replace.replaceAll("$self", "plugin")));
}

if (process.argv[2]) {
    for (const [id, patch] of [[260519, callPatch], [727535, popover], [689175, extractor]]) {
        const source = await readFile(join(process.argv[2], `${id}.js`), "utf8");
        const regex = canonical(patch.match);
        assert.equal([...source.matchAll(new RegExp(regex.source, "g"))].length, 1, `patch resolves once against actual PTB module ${id}`);
        const updated = source.replace(regex, patch.replace.replaceAll("$self", "plugin"));
        new Function("plugin", "Vencord", `return ({${updated}});`);
    }
    console.log("PASS: both replacements match and parse against the installed PTB's cached Discord module factories.");
}

const plus = await load("src/equicordplugins/translatePlus/utils/accessory.tsx");
await plus.handleTranslate({ id: "unmounted", content: "Hello" });
assert.equal(modals.at(-1).props.children, "مرحبا", "translation remains visible when the message accessory is not mounted");
plus.Accessory({ message: { id: "mounted", content: "Hello" } });
await plus.handleTranslate({ id: "mounted", content: "Hello" });
assert.equal(updates.at(-1).text, "مرحبا");
effects.pop()();
await plus.handleTranslate({ id: "mounted", content: "Hello" });
assert.equal(modals.length, 2, "unmounted messages safely fall back to the native dialog");
translationFailure = true;
await plus.handleTranslate({ id: "failed", content: "Hello" });
assert.equal(toasts.length, 1);
const stock = await load("src/plugins/translate/TranslationAccessory.tsx");
stock.handleTranslate("unmounted", { text: "مرحبا", sourceLanguage: "English" });
assert.equal(modals.length, 3, "the stock translator also has a visible fallback");
const translator = await load("src/equicordplugins/translatePlus/utils/translator.ts");
assert.equal((await translator.translate("Hello")).text, "مرحبا");
assert.equal(translatedURL.searchParams.get("tl"), "ar");
googleFailure = true;
await assert.rejects(translator.translate("Hello"), /429/);
googleFailure = false; googleEmpty = true;
await assert.rejects(translator.translate("Hello"), /no text/);
console.log("PASS: connection timer seeding/move/leave, current connection and message toolbar patch syntax, reaction preservation and stock/Equicord translation mounting/fallback/failure.");
