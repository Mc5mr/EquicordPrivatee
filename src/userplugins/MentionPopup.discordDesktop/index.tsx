/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import definePlugin, { OptionType } from "@utils/types";
import { Avatar, ChannelStore, FluxDispatcher, GuildStore, IconUtils, NavigationRouter, React, ReactDOM, SelectedChannelStore, UserStore } from "@webpack/common";

import { getOpenChannelId, setMentionHeight } from "../NightcordUI.discordDesktop/notifications";
import { Panel, ui } from "../NightcordUI.discordDesktop/ui";

interface Popup { id: string; channelId: string; authorId: string; name: string; avatar: string; place: string; content: string; path: string; }
interface IncomingMessage {
    id: string; channel_id?: string; channelId?: string;
    author: { id: string; username: string; global_name?: string; globalName?: string; bot?: boolean; };
    content?: string; mentions?: ({ id: string; } | string)[];
    mention_roles?: string[]; mentionRoles?: string[]; mentioned?: boolean;
}
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let popups: Popup[] = [];
let active = false;
const settings = definePluginSettings({
    roleIds: { type: OptionType.STRING, description: "Role IDs to watch, separated by commas or spaces.", default: "" },
    position: { type: OptionType.SELECT, description: "Popup corner", options: [
        { label: "Top right", value: "top-right", default: true }, { label: "Top left", value: "top-left" },
        { label: "Bottom right", value: "bottom-right" }, { label: "Bottom left", value: "bottom-left" }
    ] },
    width: { type: OptionType.SLIDER, description: "Popup width in pixels", default: 350, markers: [280, 320, 350, 440, 520, 600] },
    timeout: { type: OptionType.SLIDER, description: "Seconds before dismissing; 0 keeps the popup.", default: 20, markers: [0, 10, 20, 30, 60] },
    ignored: { type: OptionType.CUSTOM, description: "Ignored mention authors, stored separately for each signed-in account.", default: {} as Record<string, string[]> }
});
const KEYS: ("position" | "width")[] = ["position", "width"];
function publish() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function dismiss(id: string) {
    const timer = timers.get(id); if (timer) clearTimeout(timer);
    timers.delete(id); popups = popups.filter(popup => popup.id !== id); publish();
}
export function ignore(authorId: string) {
    const owner = UserStore.getCurrentUser()?.id;
    if (!owner) return;
    settings.store.ignored = { ...settings.store.ignored, [owner]: [...new Set([...(settings.store.ignored[owner] ?? []), authorId])] };
    for (const popup of [...popups]) if (popup.authorId === authorId) dismiss(popup.id);
}
export function accept(id: string) {
    const popup = popups.find(item => item.id === id);
    if (popup) { NavigationRouter.transitionTo(popup.path); dismiss(id); }
}
export function getPopups() { return popups; }
function PopupLayer() {
    const items = React.useSyncExternalStore(subscribe, getPopups);
    const { position, width } = settings.use(KEYS);
    const ref = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        const element = ref.current;
        if (!element || position !== "top-right") { setMentionHeight(0); return; }
        const measure = () => setMentionHeight(element.getBoundingClientRect().height + 10);
        measure(); const observer = new ResizeObserver(measure); observer.observe(element);
        return () => { observer.disconnect(); setMentionHeight(0); };
    }, [items.length, position, width]);
    if (!items.length) return null;
    return ReactDOM.createPortal(<div ref={ref} className={ui("notifications", "mention-stack")} dir="rtl" style={{ width, ...(position.startsWith("top") ? { top: 44 } : { bottom: 24 }), ...(position.endsWith("right") ? { right: 16 } : { left: 16 }) }}>
        {items.map(popup => <section className={ui("mention-card")} key={popup.id} role="alert">
            <Avatar src={popup.avatar} size="SIZE_40" />
            <div className={ui("mention-identity")}><strong>{popup.name}</strong><p>جاك منشن من هذا الشخص<br />في: {popup.place}</p></div>
            <div className={ui("mention-actions")}><Button size="small" variant="positive" onClick={() => accept(popup.id)}>قبول</Button><Button size="small" variant="dangerPrimary" onClick={() => dismiss(popup.id)}>رفض</Button><Button size="small" variant="secondary" onClick={() => ignore(popup.authorId)}>تجاهل المستخدم</Button></div>
        </section>)}
    </div>, document.body);
}
function onMessage({ message, optimistic }: { message: IncomingMessage; optimistic?: boolean; }) {
    const me = UserStore.getCurrentUser();
    if (!active || optimistic || !me || !message?.author || message.author.id === me.id || settings.store.ignored[me.id]?.includes(message.author.id)) return;
    if (popups.some(item => item.id === message.id)) return;
    const roles = settings.store.roleIds.split(/[\s,]+/).filter(Boolean);
    if (!message.mentioned && !message.mentions?.some(user => (typeof user === "string" ? user : user.id) === me.id) && !(message.mention_roles ?? message.mentionRoles)?.some(id => roles.includes(id))) return;
    const channelId = message.channel_id ?? message.channelId;
    if (channelId === getOpenChannelId()) return;
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
    if (!channel) return;
    const user = UserStore.getUser(message.author.id);
    if ([1, 3].includes(channel.type) && (message.author.bot || user?.bot)) return;
    if (popups.length >= 5) dismiss(popups[0].id);
    popups = [...popups, { id: message.id, channelId: channel.id, authorId: message.author.id,
        name: message.author.global_name ?? message.author.globalName ?? user?.globalName ?? message.author.username,
        avatar: user ? IconUtils.getUserAvatarURL(user, false, 40) : IconUtils.getDefaultAvatarURL(message.author.id),
        place: channel.guild_id ? `${GuildStore.getGuild(channel.guild_id)?.name ?? "السيرفر"} · ${channel.name}` : "الرسائل الخاصة",
        content: message.content ?? "", path: `/channels/${channel.guild_id ?? "@me"}/${channel.id}/${message.id}` }];
    if (settings.store.timeout > 0) timers.set(message.id, setTimeout(() => dismiss(message.id), settings.store.timeout * 1000));
    publish();
}
function reset() { timers.forEach(clearTimeout); timers.clear(); popups = []; setMentionHeight(0); publish(); }
function dismissOpenConversation() {
    const id = getOpenChannelId();
    for (const popup of [...popups]) if (popup.channelId === id) dismiss(popup.id);
}
export default definePlugin({
    name: "MentionPopup", description: "Mention popups with avatars, accept, dismiss and per-account ignored users.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }], tags: ["Utility", "Notifications"],
    dependencies: ["NightcordUI", "ServerListAPI"], settings,
    settingsAboutComponent: () => <Panel><p>قبول يفتح الرسالة. رفض يغلق التنبيه. تجاهل المستخدم يوقف منشناته حتى تلغي التجاهل.</p><Button onClick={() => {
        const me = UserStore.getCurrentUser(); if (!me) return;
        popups = [{ id: "mention-test", channelId: "", authorId: me.id, name: me.globalName || me.username, avatar: IconUtils.getUserAvatarURL(me, false, 40), place: "معاينة التنبيه", content: "", path: "/channels/@me" }]; publish();
    }}>اختبار التنبيه</Button><Button variant="secondary" onClick={() => { const owner = UserStore.getCurrentUser()?.id; if (owner) settings.store.ignored = { ...settings.store.ignored, [owner]: [] }; reset(); }}>مسح التنبيهات وإلغاء التجاهل</Button></Panel>,
    start() { active = true; SelectedChannelStore.addChangeListener(dismissOpenConversation); addServerListElement(ServerListRenderPosition.Above, PopupLayer); },
    flux: {
        MESSAGE_CREATE(event: { message: IncomingMessage; optimistic?: boolean; }) { FluxDispatcher.wait(() => onMessage(event)); },
        LOGOUT: reset, CONNECTION_OPEN: reset
    },
    stop() { active = false; SelectedChannelStore.removeChangeListener(dismissOpenConversation); removeServerListElement(ServerListRenderPosition.Above, PopupLayer); reset(); }
});
