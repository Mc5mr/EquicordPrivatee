/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Avatar, ChannelStore, FluxDispatcher, IconUtils, React, ReactDOM, SelectedChannelStore, UserStore, useStateFromStores } from "@webpack/common";

import { EmptyState } from "../NightcordUI.discordDesktop/ui";
import style from "./styles.css?managed";

const cl = classNameFactory("vc-nc-fdm-");
const listeners = new Set<() => void>();
let visible = false;
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function setVisible(value: boolean) { visible = value; listeners.forEach(listener => listener()); }
function FloatingLayer() {
    const opened = React.useSyncExternalStore(subscribe, () => visible);
    return opened ? ReactDOM.createPortal(<Composer />, document.body) : null;
}
const messages = new Map<string, string>();
let sequence = 0;

function clear(channelId?: string) {
    for (const [id, channel] of messages) {
        if (channelId && channel !== channelId) continue;
        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: channel, id, mlDeleted: true });
        messages.delete(id);
    }
}
export function toLocal(date: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function insertPreview({ channelId, authorId, content, date, call, missed = false, minutes = 5 }: {
    channelId: string; authorId: string; content: string; date: string; call: boolean; missed?: boolean; minutes?: number;
}): boolean {
    const channel = ChannelStore.getChannel(channelId);
    const owner = UserStore.getCurrentUser()?.id;
    const author = UserStore.getUser(authorId);
    const timestamp = new Date(date);
    const participants = owner ? [...new Set([owner, ...(channel?.recipients ?? [])])] : [];
    if (!channel || ![1, 3].includes(channel.type) || !author || !participants.includes(authorId) || !Number.isFinite(timestamp.getTime())) return false;
    if ((!call && (!content.trim() || content.length > 2000)) || (call && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440))) return false;
    if (timestamp.getTime() < 1420070400000) return false;
    const id = ((BigInt(timestamp.getTime() - 1420070400000) << 22n) + BigInt(++sequence % 4194304)).toString();
    const duration = missed ? 0 : Math.round(minutes * 60);
    FluxDispatcher.dispatch({
        type: "MESSAGE_CREATE", mc5mrLocalPreview: true, channelId: channel.id, optimistic: false, isPushNotification: false,
        message: { id, channel_id: channel.id, nonce: id, author: {
            id: author.id, username: author.username, global_name: author.globalName, avatar: author.avatar,
            discriminator: author.discriminator, bot: author.bot ?? false, public_flags: author.publicFlags ?? 0
        }, content: call ? "" : content, timestamp: timestamp.toISOString(), edited_timestamp: null,
        type: call ? 3 : 0, flags: 0, attachments: [], components: [], embeds: [], mentions: [], mention_roles: [],
        mention_everyone: false, tts: false, pinned: false,
        ...(call ? { call: { participants: missed ? [authorId] : participants, duration: missed ? null : duration,
            ended_timestamp: new Date(timestamp.getTime() + duration * 1000).toISOString() } } : {}) }
    });
    messages.set(id, channel.id);
    return true;
}
function Icon({ className }: { className?: string; }) {
    return <svg className={`vc-nc-composer-icon ${className ?? ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M15.35 7.24C15.9 6.67 16 5.8 16 5a3 3 0 1 1 3 3c-.8 0-1.67.09-2.24.65a1.5 1.5 0 0 0 0 2.11l.4.4.46.43c.25.25.12.66-.18.84A3 3 0 0 0 16 15v.5a.5.5 0 0 1-.5.5H15c-.43 0-.84.1-1.21.26a.56.56 0 0 1-.63-.1L6.91 9.91 4.3 12.54a1 1 0 0 0 0 1.42l2.17 2.17.83-.84a1 1 0 0 1 1.42 1.42l-.84.83.59.59 1.83-1.84a1 1 0 0 1 1.42 1.42l-1.84 1.83.17.17a1 1 0 0 0 1.42 0c.2-.2.6-.07.69.22a3 3 0 0 0 .56 1c.09.11.09.27-.02.36a3 3 0 0 1-4.06-.16l-5.76-5.76a3 3 0 0 1 0-4.24L6.9 7.09h.01l.97-.97a3 3 0 0 1 4.24 0l1.12 1.12a1.5 1.5 0 0 0 2.1 0Z" /><path fill="currentColor" d="M19 14a1 1 0 0 1 1 1v3h3a1 1 0 0 1 0 2h-3v3a1 1 0 0 1-2 0v-3h-3a1 1 0 1 1 0-2h3v-3a1 1 0 0 1 1-1Z" /></svg>;
}
function Participant({ user, selected, onClick }: { user: User; selected: boolean; onClick(): void; }) {
    return <button type="button" className={cl("person", { selected })} aria-pressed={selected} onClick={onClick}><Avatar src={IconUtils.getUserAvatarURL(user, false, 24)} size="SIZE_24" /><span>{user.globalName || user.username}</span></button>;
}
function Composer() {
    const channel = useStateFromStores([SelectedChannelStore, ChannelStore], () => ChannelStore.getChannel(SelectedChannelStore.getChannelId()));
    const me = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    const users = useStateFromStores([UserStore, ChannelStore], () => [...new Set([me?.id, ...(channel?.recipients ?? [])])].filter((id): id is string => !!id).map(id => UserStore.getUser(id)).filter(user => !!user));
    const [mode, setMode] = React.useState<"message" | "call">("message");
    const [authorId, setAuthorId] = React.useState(me?.id ?? "");
    const [content, setContent] = React.useState("");
    const [date, setDate] = React.useState(toLocal(new Date()));
    const [missed, setMissed] = React.useState(false);
    const [minutes, setMinutes] = React.useState("5");
    const [status, setStatus] = React.useState("");
    const valid = !!channel && [1, 3].includes(channel.type);
    const selected = users.some(user => user.id === authorId) ? authorId : me?.id ?? "";
    function insert() {
        if (!channel) return;
        try {
            if (!insertPreview({ channelId: channel.id, authorId: selected, content, date, call: mode === "call", missed, minutes: Number(minutes) })) { setStatus("Check the participant, date and content."); return; }
            setContent(""); setStatus("Local preview added ✓");
        } catch { setStatus("Could not add this preview."); }
    }
    return <section className={cl("floating")} role="dialog" aria-modal="false" aria-label="Fake DM" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setVisible(false); } }}>
        <header className={cl("header")}><div><span className={cl("title")}>{mode === "call" ? "Call preview" : channel?.type === 3 ? "Group chat preview" : "Message preview"}</span><small>{channel?.name || users.filter(user => user.id !== me?.id).map(user => user.globalName || user.username).join(", ")}</small></div><Button size="small" variant="none" aria-label="Close Fake DM" onClick={() => setVisible(false)}>×</Button></header>
        <div className={cl("panel")} dir="ltr">
            <div className={cl("tabs")} role="tablist" aria-label="Preview type">{(["message", "call"] as const).map(tab => <button type="button" role="tab" aria-selected={mode === tab} className={cl("tab", { selected: mode === tab })} key={tab} onClick={() => { setMode(tab); setStatus(""); }}>{tab === "message" ? "● Message" : "☎ Call"}</button>)}</div>
            {valid ? <><div className={cl("people")}>{users.map(user => <Participant key={user.id} user={user} selected={selected === user.id} onClick={() => setAuthorId(user.id)} />)}</div>
                {mode === "call" && <div className={cl("call-options")}><button type="button" aria-pressed={!missed} className={cl("tab", { selected: !missed })} onClick={() => setMissed(false)}>Answered</button><button type="button" aria-pressed={missed} className={cl("tab", { selected: missed })} onClick={() => setMissed(true)}>Missed</button>{!missed && <label><input type="number" min="0" max="1440" step="1" value={minutes} onChange={e => setMinutes(e.target.value)} aria-label="Call duration in minutes" /> min</label>}</div>}
                <div className={cl("date-row")}><label htmlFor="vc-nc-fdm-date">Date :</label><input id="vc-nc-fdm-date" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /><button type="button" className={cl("now")} onClick={() => setDate(toLocal(new Date()))}>Now</button></div>
                <div className={cl("input-row")}>{mode === "message" && <textarea autoFocus value={content} onChange={e => setContent(e.target.value)} rows={3} maxLength={2000} placeholder="Message… (↵ send)" aria-label="Local message preview" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); insert(); } }} />}
                    <div className={cl("actions")}><Button size="small" disabled={mode === "message" && !content.trim()} onClick={insert}>{mode === "message" ? "Send" : "Inject Call"}</Button><Button size="small" variant="dangerSecondary" onClick={() => { clear(channel.id); setStatus("Local previews cleared ✓"); }}>Clear</Button></div></div>
                {status && <div className={cl("status")} role="status">{status}</div>}
            </> : <EmptyState title="Open a DM or group chat" detail="Choose a conversation to create your preview." />}
        </div>
    </section>;
}
function open() { setVisible(!visible); }
export default definePlugin({
    name: "FakeDM",
    description: "Compose local message and call previews in direct messages and group chats.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI", "ServerListAPI"], tags: ["Chat", "Utility"], managedStyle: style,
    chatBarButton: { icon: Icon, render: ({ channel }) => channel && [1, 3].includes(channel.type) ? <ChatBarButton tooltip="Fake DM" onClick={open}><Icon /></ChatBarButton> : null },
    settingsAboutComponent: () => <Button onClick={open}>Open Fake DM</Button>,
    start() { setVisible(false); addServerListElement(ServerListRenderPosition.Above, FloatingLayer); },
    flux: { LOGOUT() { clear(); setVisible(false); }, CONNECTION_OPEN() { clear(); setVisible(false); }, CHANNEL_SELECT() { setVisible(false); } },
    stop() { removeServerListElement(ServerListRenderPosition.Above, FloatingLayer); clear(); setVisible(false); }
});
