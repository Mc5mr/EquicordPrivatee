/*
 * Vencord userplugin: ChatGrid
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * View multiple Discord chats side by side — each pane is a full, native
 * Discord chat (real composer, emoji, attachments, autocomplete).
 *
 * How it works: Discord's ConnectedChannel computes a channel's chat props
 * and renders the chat. Two webpack patches below (1) capture that component
 * so the grid can mount extra copies of it, and (2) route its render through
 * $self.GridOrChat — which shows the grid instead of a single chat when the
 * grid is active. A pane is just a ConnectedChannel given a `providedChannel`.
 *
 * - Ctrl+Shift+G — open the grid / add another pane (prompts for its channel).
 * - Drag the divider between panes to resize.
 * - Each pane header: channel switcher, pop-out, close.
 * - Pop-out detaches a pane into a floating, always-on-top OS window.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import "./style.css";

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, showToast, Toasts } from "@webpack/common";

import { cancelGridDrag, ChatGridRoot, openQuickSwitcher } from "./components";
import { closeAllPopouts } from "./popout";
import * as store from "./store";

function onKeyDown(e: KeyboardEvent) {
    // Ctrl+Shift+G — e.code is keyboard-layout independent (ABNT-safe)
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyG") {
        e.preventDefault();
        if (!plugin.ConnectedChannel) { showToast("ChatGrid: the native chat hook is unavailable in this Discord build.", Toasts.Type.FAILURE); return; }
        if (store.state.channels.length >= 6) return;
        store.triggerShortcut();
        // prompt for the new pane's channel — the only place the switcher
        // auto-opens, so a focused empty pane never respawns it on its own
        openQuickSwitcher();
    }
}

// A channel selected from outside the grid (sidebar, notification, jump to
// message) loads into the focused pane — the grid stays put.
function onChannelSelect(e: any) {
    if (e?.channelId) store.routeToFocusedPane(e.channelId);
}

const DEFAULT_ACCENT = "#5865f2";

let accentStyle: HTMLStyleElement | null = null;

/** push the accent colour into the CSS variable the stylesheet reads, via a
 *  dedicated <style> element — Discord rewrites <html>'s inline style during
 *  init, so an inline custom property set there gets wiped. CSS.supports()
 *  also guards the interpolation: only a valid colour token gets through. */
function applyAccent(value: string) {
    const color = typeof value === "string" && CSS.supports("color", value.trim())
        ? value.trim()
        : DEFAULT_ACCENT;
    if (!accentStyle) {
        accentStyle = document.createElement("style");
        accentStyle.id = "vcg-accent-style";
        document.head.appendChild(accentStyle);
    }
    accentStyle.textContent = `html:root{--vcg-accent:${color};}`;
}

const settings = definePluginSettings({
    accentColor: {
        type: OptionType.STRING,
        description: "Accent colour — focused-pane border, divider & input highlights (hex, e.g. #5865f2)",
        default: DEFAULT_ACCENT,
        onChange: applyAccent,
    },
});

function GridIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M12 4v16" /></svg>; }

const plugin = definePlugin({
    name: "ChatGrid",
    description: "View multiple Discord chats side by side, each a full native chat. Ctrl+Shift+G adds a pane.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "fagner", id: 0n }],
    tags: ["Chat", "Utility"],
    settings,
    dependencies: ["ChatInputButtonAPI"],
    renderChatBarButton: props => props.isMainChat && !props.disabled ? <ChatBarButton tooltip="ChatGrid · إضافة محادثة بجانب الحالية" onClick={() => onKeyDown({ ctrlKey: true, shiftKey: true, altKey: false, code: "KeyG", preventDefault() {} } as KeyboardEvent)}><GridIcon /></ChatBarButton> : null,
    chatBarButtonIcon: GridIcon,
    flux: { LOGOUT() { cancelGridDrag(); closeAllPopouts(); store.closeGrid(); }, CONNECTION_OPEN() { cancelGridDrag(); closeAllPopouts(); store.closeGrid(); } },

    // Set at module-load time by the first patch replacement — the real
    // ConnectedChannel memo, used to render extra panes.
    ConnectedChannel: null as any,

    patches: [
        {
            find: '"ConnectedChannel")',
            replacement: [
                {
                    // expose the ConnectedChannel memo
                    match: /(\i)=(\i\.memo\(function\(\i\)\{var \i,\i;let \i,\{providedChannel:)/,
                    replace: "$1=$self.ConnectedChannel=$2",
                },
                {
                    // route ConnectedChannel's render through the grid
                    match: /(useHasAnyModalOpen\)\(\);)return\(0,\i\.jsx\)\((\i),\{guildId:/,
                    replace: "$1return $self.GridOrChat($2,arguments[0],{guildId:",
                },
            ],
        },
    ],

    // Called from the patched ConnectedChannel. realChat = the wrapped chat
    // component, rxProps = ConnectedChannel's own props (has providedChannel
    // for a grid pane), chatProps = the computed chat props.
    GridOrChat(realChat: any, rxProps: any, chatProps: any) {
        return (
            <ChatGridRoot
                RealChat={realChat}
                ConnectedChannel={plugin.ConnectedChannel}
                rxProps={rxProps}
                chatProps={chatProps}
            />
        );
    },

    start() {
        applyAccent(settings.store.accentColor);
        document.addEventListener("keydown", onKeyDown, true);
        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, true);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        accentStyle?.remove();
        accentStyle = null;
        cancelGridDrag();
        closeAllPopouts();
        store.closeGrid();
    },
});

export default plugin;
