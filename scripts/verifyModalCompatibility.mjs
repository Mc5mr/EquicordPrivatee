/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";

const fixture = JSON.parse(await readFile(new URL("fixtures/ptb-modals.json", import.meta.url), "utf8"));
const registry = {};
const jsx = (type, props) => ({ type, props });
const dependencies = {
    477900: { jsx, jsxs: jsx },
    582128: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useLayoutEffect: () => {} },
    460890: { G9: () => ({ i18n: { CANCEL: "Cancel", INLINE_NOTICE_GENERIC_ERROR: "Error" } }) },
    224640: { d: "NativeDialog" }, 696208: { H: "Actions", e: "Checkbox" },
    430993: { y: () => false, c: "Content" }, 364840: { j: "Preview" },
    20742: { rQ: "Title" }, 655053: { i: "Notice" }
};
const requireNative = id => registry[id] ?? dependencies[id];
requireNative.d = (target, getters) => {
    for (const [name, get] of Object.entries(getters)) Object.defineProperty(target, name, { get, enumerable: true });
};
for (const [id, body] of Object.entries(fixture.modules)) {
    const exported = {};
    registry[id] = exported;
    vm.runInNewContext(`({${body}})[${id}]`, {})(null, exported, requireNative);
}
const candidates = Object.values(registry).flatMap(exports => Object.values(exports));
assert.equal(Object.values(registry).some(exports => "Modal" in exports || "ConfirmModal" in exports), false, "the snapshot reproduces missing named modal exports");
const findByCodeLazy = (...code) => {
    const matches = candidates.filter(candidate => code.every(text => String(candidate).includes(text)));
    assert.equal(matches.length, 1, `unique native component for ${code.join(", ")}`);
    return matches[0];
};
const closeAll = () => {};
const buildResult = await build({
    entryPoints: [fileURLToPath(new URL("../src/webpack/common/modals.ts", import.meta.url))],
    bundle: true, write: false, format: "iife", globalName: "Subject",
    plugins: [{ name: "native-modal-fixture", setup(builder) {
        builder.onResolve({ filter: /^@webpack$/ }, () => ({ path: "webpack", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const {findByCodeLazy,filters,mapMangledModuleLazy}=globalThis.fixture;", loader: "js" }));
    } }]
});
const context = { fixture: {
    findByCodeLazy: (...code) => code.includes("hasMediaOptions") ? () => {} : findByCodeLazy(...code),
    filters: { byCode: (...code) => code },
    mapMangledModuleLazy: (_anchor, filters) => {
        assert.deepEqual(Array.from(filters.closeAllModals), [".getState();for", " in "], "close-all matcher distinguishes the native implementation");
        return { closeAllModals: closeAll };
    }
} };
vm.runInNewContext(buildResult.outputFiles[0].text, context);
for (const title of ["إدارة الفولو", "Export DMs"]) {
    const content = { label: title };
    const onClose = () => {};
    const result = context.Subject.Modal({ title, children: content, size: "lg", transitionState: 0, onClose });
    assert.equal(result.type, "NativeDialog");
    assert.equal(result.props.onClose, onClose);
    assert.equal(result.props.children[0].props.title, title);
    assert.equal(result.props.children[2].props.children, content, "the content reaches the native modal body");
}
const confirmation = context.Subject.ConfirmModal({ title: "Delete", confirmText: "Confirm", transitionState: 0, onClose() {} });
assert.equal(confirmation.type, registry[189213].a);
assert.equal(context.Subject.closeAllModals, closeAll);

const passthrough = props => props.children;
Object.assign(dependencies[582128], {
    createContext: () => ({ Provider: passthrough }),
    useId: () => "native-dialog-fixture",
    useMemo: callback => callback(),
    useEffect() {}, useImperativeHandle() {}
});
Object.assign(dependencies, {
    503698: (...values) => values.flatMap(value => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.keys(value).filter(key => value[key]) : []).join(" "),
    202091: { animated: { div: "div" } },
    559106: { xp: passthrough }, 707554: { F: passthrough },
    22856: { V: { Provider: passthrough } },
    150591: { kS: () => ({ opacity: 1, transform: "scale(1)" }) },
    815390: { i: { EXITING: 2, EXITED: 3 } },
    592551: { outerContainer: "native-outer", container: "native-paper", "size-md": "native-md", "padding-size-sm": "native-padding", fullScreenOnMobile: "native-mobile" },
    765178: { O: {} }, 312138: { sk: passthrough }, 315710: { tj() {} }, 140735: { A: () => null }
});
requireNative.n = value => () => value;
for (const [id, body] of Object.entries(fixture.nativeDialogModules)) {
    const exported = {};
    vm.runInNewContext(`({${body}})[${id}]`, {})(null, exported, requireNative);
    if (id === "224640") dependencies[224640].d = exported.d;
    else registry[id] = exported;
}
function nativeNodes(node) {
    if (Array.isArray(node)) return node.flatMap(nativeNodes);
    if (!node || typeof node !== "object") return [];
    if (typeof node.type === "function") return nativeNodes(node.type(node.props));
    return [node, ...nativeNodes(node.props?.children)];
}
for (const entry of [
    { plugin: "FollowList", marker: "vc-mc5mr-follow-modal", size: "md", gap: 48 },
    { plugin: "MicSettings", marker: "vc-nc-mic", size: "lg", gap: 40 }
]) {
    const marker = { type: "div", props: { className: entry.marker } };
    const nodes = nativeNodes(context.Subject.Modal({ title: entry.plugin, children: marker, size: entry.size, transitionState: 1, onClose() {} }));
    const viewport = nodes.find(node => node.props?.["data-dialog"] === "modal");
    const paper = nodes.find(node => node.props?.["data-mana-component"] === "modal");
    assert.ok(viewport); assert.ok(paper);
    assert.notEqual(viewport, paper, "the dialog role belongs to the viewport wrapper, not the visible paper");
    assert.equal(viewport.props.role, "dialog");
    const css = await readFile(new URL(`../src/userplugins/${entry.plugin}.discordDesktop/styles.css`, import.meta.url), "utf8");
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , declarations]) => /\b(?:width|height)\s*:/.test(declarations));
    const sizing = rules.find(([, selector]) => selector.includes(`:has(.${entry.marker})`));
    assert.ok(sizing, `${entry.plugin} paper has a viewport-bounded size rule`);
    const attribute = sizing[1].trim().match(/^\[([^=]+)="([^"]+)"\]:has\(\.([\w-]+)\)$/);
    assert.ok(attribute, "size only one explicitly identified native element");
    assert.equal(attribute[3], entry.marker);
    const matching = nodes.filter(node => node.props?.[attribute[1]] === attribute[2]);
    assert.deepEqual(matching, [paper], "sizing applies only to native paper and never shrinks the full viewport wrapper");
    assert.match(sizing[2], /calc\(100vw - 32px\)/);
    assert.match(sizing[2], new RegExp(`calc\\(100dvh - ${entry.gap}px\\)`));
    assert.doesNotMatch(css, /\[role="dialog"\]/, "role selectors cannot constrain the focus/viewport wrapper");
}
console.log("PASS: renamed native PTB modal and confirmation exports resolve; Follow and Export content reach the native dialog. Fixture test, not a live client test.");
console.log("PASS: actual native dialog and paper are distinct; Follow and microphone sizing target only the paper, preserving native viewport centering.");

