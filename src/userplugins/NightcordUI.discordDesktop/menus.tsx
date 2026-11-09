/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Menu, React } from "@webpack/common";
const channelOrder = ["mc5mr-move-all", "mc5mr-list-protect", "mc5mr-list-blacklist", "mc5mr-slide", "mc5mr-slide-stop", "mc5mr-list-pull", "mc5mr-list-freeze", "mc5mr-follow-channel", "mc5mr-stop-all"];
type MenuElement = React.ReactElement<{ id?: string; children?: React.ReactNode; }>;

function isMenuElement(node: React.ReactNode): node is MenuElement {
    return node !== null && typeof node === "object" && "type" in node && "props" in node;
}

function menuChildren(children: React.ReactNode): React.ReactNode[] {
    return Array.isArray(children) ? children.flat() : children == null ? [] : [children];
}

export function mergeVoiceTools(children: React.ReactNode[], entries: React.ReactNode[]) {
    const selected: MenuElement[] = [];
    let removed = 0;
    let insertion = -1;
    const clean = (nodes: React.ReactNode[]): React.ReactNode[] => nodes.flatMap(node => {
        if (Array.isArray(node)) return clean(node);
        if (!isMenuElement(node)) return [node];
        if (node.props.id === "mc5mr-voice-tools" || channelOrder.includes(node.props.id ?? "")) {
            selected.push(...(node.props.id === "mc5mr-voice-tools" ? menuChildren(node.props.children).filter(isMenuElement) : [node]));
            removed++;
            return [];
        }
        if (node.type === Menu.MenuGroup || node.type === React.Fragment) {
            const previous = menuChildren(node.props.children);
            const nested = clean(previous);
            if (nested.length === previous.length && nested.every((child, index) => child === previous[index])) return [node];
            return nested.length ? [React.createElement(node.type, { ...node.props, key: node.key }, ...nested)] : [];
        }
        return [node];
    });
    const remaining: React.ReactNode[] = [];
    for (const node of children) {
        const before = removed;
        const result = clean([node]);
        if (removed > before && insertion < 0) insertion = remaining.length;
        remaining.push(...result);
    }
    selected.push(...entries.flat().filter(isMenuElement));
    const merged = selected.filter((node, index) => node.props.id == null || !selected.slice(index + 1).some(other => other.props.id === node.props.id))
        .sort((a, b) => {
            const rank = (node: MenuElement) => { const index = channelOrder.indexOf(node.props.id ?? ""); return index < 0 ? channelOrder.length : index; };
            return rank(a) - rank(b);
        });
    if (merged.length) remaining.splice(insertion < 0 ? remaining.length : insertion, 0, <Menu.MenuItem key="mc5mr-voice-tools" id="mc5mr-voice-tools" label="Voice Tools">{merged}</Menu.MenuItem>);
    children.splice(0, children.length, ...remaining);
}
