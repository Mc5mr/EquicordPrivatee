/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addGlobalContextMenuPatch, GlobalContextMenuPatchCallback, removeGlobalContextMenuPatch } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu, React } from "@webpack/common";

import { mergeVoiceTools } from "./menus";
import style from "./styles.css?managed";

const sections = [
    ["mc5mr-rule-disconnect", "mc5mr-rule-mute", "mc5mr-rule-deaf", "mc5mr-rule-both"],
    ["mc5mr-copy-profile"],
    ["mc5mr-fake-switcher-add"],
    ["mc5mr-fake-friend", "mc5mr-fake-friend-request"],
    ["mc5mr-love", "mc5mr-pin-follow", "mc5mr-rule-protect", "mc5mr-walk", "mc5mr-walk-return", "mc5mr-rule-blacklist", "mc5mr-rule-pull", "mc5mr-rule-freeze", "mc5mr-stop-user"]
];
const order = sections.flat();
const arrange: GlobalContextMenuPatchCallback = (navId, children) => {
    if (navId === "channel-context") { mergeVoiceTools(children, []); return; }
    if (navId !== "user-context") return;
    const selected: React.ReactNode[] = [];
    let insertion = -1;
    const clean = (nodes: React.ReactNode[]): React.ReactNode[] => nodes.flatMap(node => {
        if (!React.isValidElement<{ id?: string; children?: React.ReactNode; }>(node)) return [node];
        if (order.includes(node.props.id ?? "")) { selected.push(node); return []; }
        if (node.type === Menu.MenuGroup) {
            const nested = clean(React.Children.toArray(node.props.children));
            return nested.length ? [React.cloneElement(node, { children: nested })] : [];
        }
        return [node];
    });
    const remaining: React.ReactNode[] = [];
    children.forEach(node => {
        const count = selected.length;
        const result = clean([node]);
        if (selected.length > count && insertion < 0) insertion = remaining.length;
        remaining.push(...result);
    });
    if (!selected.length) return;
    selected.sort((a, b) => {
        const index = (node: React.ReactNode) => React.isValidElement<{ id?: string; }>(node) ? order.indexOf(node.props.id ?? "") : 99;
        return index(a) - index(b);
    });
    const groups = sections.map((ids, index) => {
        const entries = selected.filter(node => React.isValidElement<{ id?: string; }>(node) && ids.includes(node.props.id ?? ""));
        return entries.length ? React.createElement(Menu.MenuGroup, { key: `mc5mr-user-section-${index}` }, ...entries) : null;
    }).filter(Boolean);
    remaining.splice(Math.min(insertion, remaining.length), 0, ...groups);
    children.splice(0, children.length, ...remaining.filter((node): node is React.ReactElement | null => node === null || React.isValidElement(node)));
};
export default definePlugin({
    name: "NightcordUI",
    description: "Shared, scoped interface styles for the custom Nightcord plugin panels.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["ContextMenuAPI"],
    hidden: true,
    managedStyle: style,
    start() { addGlobalContextMenuPatch(arrange); },
    stop() { removeGlobalContextMenuPatch(arrange); }
});
