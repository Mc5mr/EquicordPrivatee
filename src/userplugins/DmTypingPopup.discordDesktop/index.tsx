/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import { Avatar, ChannelStore, FluxDispatcher, IconUtils, NavigationRouter, React, ReactDOM, SelectedChannelStore, UserStore } from "@webpack/common";

import { getMentionHeight, getOpenChannelId, subscribeMentionDock } from "../NightcordUI.discordDesktop/notifications";
import { ui } from "../NightcordUI.discordDesktop/ui";
interface Card { key: string; name: string; avatar: string; channelId: string; }
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let cards: Card[] = [];
let active = false;
function publish() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function dismiss(key: string) {
    const timer = timers.get(key); if (timer) clearTimeout(timer);
    timers.delete(key); cards = cards.filter(card => card.key !== key); publish();
}
function clear() { timers.forEach(clearTimeout); timers.clear(); cards = []; publish(); }
export function getCards() { return cards; }
export function openCard(key: string) {
    const card = cards.find(item => item.key === key);
    if (card) { NavigationRouter.transitionTo(card.channelId ? `/channels/@me/${card.channelId}` : "/channels/@me"); dismiss(key); }
}
function TypingLayer() {
    const items = React.useSyncExternalStore(subscribe, getCards);
    const offset = React.useSyncExternalStore(subscribeMentionDock, getMentionHeight);
    if (!items.length) return null;
    return ReactDOM.createPortal(<div className={ui("notifications", "typing-stack")} style={{ top: 44 + offset, right: 16 }}>
        {items.map(card => <button type="button" className={ui("typing-card")} key={card.key} onClick={() => openCard(card.key)}>
            <Avatar src={card.avatar} size="SIZE_40" /><span className={ui("typing-identity")}><strong>{card.name}</strong><span>is typing<span className={ui("typing-dots")} aria-label="…"><i /><i /><i /></span></span></span>
        </button>)}
    </div>, document.body);
}
function onTyping(event: { channelId?: string; userId?: string; channel_id?: string; user_id?: string; }) {
    const channelId = event.channelId ?? event.channel_id; const userId = event.userId ?? event.user_id;
    if (!active || !channelId || !userId || userId === UserStore.getCurrentUser()?.id) return;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel || ![1, 3].includes(channel.type)) return;
    if (channelId === getOpenChannelId()) return;
    const key = `${channelId}:${userId}`;
    const timer = timers.get(key); if (timer) clearTimeout(timer);
    if (!cards.some(card => card.key === key)) {
        if (cards.length >= 3) dismiss(cards[0].key);
        const user = UserStore.getUser(userId);
        cards = [...cards, { key, name: user?.globalName ?? user?.username ?? userId, channelId, avatar: user ? IconUtils.getUserAvatarURL(user, false, 40) : IconUtils.getDefaultAvatarURL(userId) }]; publish();
    }
    timers.set(key, setTimeout(() => dismiss(key), 8000));
}
function dismissOpenConversation() {
    const id = getOpenChannelId();
    for (const card of [...cards]) if (card.channelId === id) dismiss(card.key);
}
export default definePlugin({
    name: "DmTypingPopup", description: "Animated typing cards above the chat; click a card to open that private conversation.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }], tags: ["Utility", "Notifications"],
    dependencies: ["NightcordUI", "ServerListAPI"],
    settingsAboutComponent: () => <Button onClick={() => {
        const me = UserStore.getCurrentUser(); if (!me) return;
        clear();
        cards = [{ key: "typing-test", name: me.globalName || me.username, avatar: IconUtils.getUserAvatarURL(me, false, 40), channelId: "" }]; publish();
        timers.set("typing-test", setTimeout(() => dismiss("typing-test"), 8000));
    }}>اختبار شكل تنبيه الكتابة</Button>,
    start() { active = true; SelectedChannelStore.addChangeListener(dismissOpenConversation); addServerListElement(ServerListRenderPosition.Above, TypingLayer); },
    flux: {
        TYPING_START(event: { channelId?: string; userId?: string; channel_id?: string; user_id?: string; }) { FluxDispatcher.wait(() => onTyping(event)); },
        LOGOUT: clear, CONNECTION_OPEN: clear
    },
    stop() { active = false; SelectedChannelStore.removeChangeListener(dismissOpenConversation); removeServerListElement(ServerListRenderPosition.Above, TypingLayer); clear(); }
});
