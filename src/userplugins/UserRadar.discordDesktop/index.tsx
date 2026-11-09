/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore, Notifications } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import definePlugin, { OptionType } from "@utils/types";
import type { Message, User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, closeModal, GuildStore, Menu, MessageStore, Modal, moment, NavigationRouter, openModal, PresenceStore, React, TextInput, UserStore } from "@webpack/common";

import style from "./styles.css?managed";

type Category = "message" | "edit" | "delete" | "typing" | "voice" | "status" | "activity" | "profile" | "server";
type Preset = "custom" | "stalker" | "lite" | "silent";
interface Watched { id: string; label: string; pinned?: boolean; overrides?: Partial<Record<Category, boolean>>; }
interface Entry { id: string; at: number; userId: string; category: Category; title: string; text: string; guildId?: string; channelId?: string; messageId?: string; startedAt?: number; }
interface MessageEvent { channelId: string; guildId?: string; message: Message; optimistic?: boolean; }
interface PresenceUpdate { user: { id: string; }; status?: string; clientStatus?: Record<string, string>; activities?: { name: string; details?: string; state?: string; type?: number; }[]; }

const settings = definePluginSettings({
    watchlist: { type: OptionType.STRING, description: "Local watchlist.", default: "[]", hidden: true },
    preset: { type: OptionType.STRING, description: "Tracking preset.", default: "custom", hidden: true },
    messages: { type: OptionType.BOOLEAN, description: "Log messages.", default: true },
    edits: { type: OptionType.BOOLEAN, description: "Log message edits.", default: true },
    deletes: { type: OptionType.BOOLEAN, description: "Log deleted messages.", default: true },
    typing: { type: OptionType.BOOLEAN, description: "Log typing.", default: true },
    voice: { type: OptionType.BOOLEAN, description: "Log voice, camera, and stream.", default: true },
    presence: { type: OptionType.BOOLEAN, description: "Log status and activities.", default: true },
    profile: { type: OptionType.BOOLEAN, description: "Log profile changes.", default: true },
    notifications: { type: OptionType.BOOLEAN, description: "Show local notifications.", default: true },
    messagePreview: { type: OptionType.BOOLEAN, description: "Include message content.", default: true },
    maxLogs: { type: OptionType.NUMBER, description: "Maximum events.", default: 2000, isValid: v => typeof v === "number" && Number.isInteger(v) && v >= 100 && v <= 10000 || "Choose between 100 and 10000." }
});

const MANAGER_KEY = "mc5mr-user-radar-manager", LOG_KEY = "mc5mr-user-radar-log";
const categories: Category[] = ["message", "edit", "delete", "typing", "voice", "status", "activity", "profile", "server"];
const categoryNames: Record<Category, string> = { message: "Messages", edit: "Edits", delete: "Deletes", typing: "Typing", voice: "Voice", status: "Status", activity: "Activity", profile: "Profile", server: "Servers" };
const listeners = new Set<() => void>(), watched = new Map<string, Watched>();
const voiceCache = new Map<string, { signature: string; channelId?: string; joinedAt?: number; }>();
const presenceCache = new Map<string, { status: string; activity: string; }>(), profileCache = new Map<string, string>(), typingCache = new Map<string, number>();
const messageCache = new Map<string, { authorId: string; content: string; guildId?: string; channelId: string; }>();
let entries: Entry[] = [], owner: string | undefined, saveTimer: ReturnType<typeof setTimeout> | undefined, revision = 0, running = false;

function publish() { revision++; listeners.forEach(fn => fn()); }
function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function storageKey(id: string) { return `mc5mr-user-radar:${id}`; }
function displayName(id: string) { const user = UserStore.getUser(id); return watched.get(id)?.label || user?.globalName || user?.username || id; }
function preset() { return (["custom", "stalker", "lite", "silent"].includes(settings.store.preset) ? settings.store.preset : "custom") as Preset; }
function saveWatchlist() { settings.store.watchlist = JSON.stringify([...watched.values()]); publish(); }
function parseWatchlist() {
    watched.clear();
    try {
        const list = JSON.parse(settings.store.watchlist) as Watched[];
        if (Array.isArray(list)) for (const item of list) if (item && /^\d{17,20}$/.test(item.id)) watched.set(item.id, { id: item.id, label: item.label || "", pinned: !!item.pinned, overrides: item.overrides ?? {} });
    } catch { settings.store.watchlist = "[]"; }
}
function globalEnabled(category: Category) {
    const mode = preset();
    if (mode === "stalker" || mode === "silent") return true;
    if (mode === "lite") return ["message", "delete", "voice", "status", "profile"].includes(category);
    return category === "message" ? settings.store.messages : category === "edit" ? settings.store.edits : category === "delete" ? settings.store.deletes : category === "typing" ? settings.store.typing : category === "voice" ? settings.store.voice : category === "status" || category === "activity" ? settings.store.presence : category === "profile" ? settings.store.profile : true;
}
function enabled(userId: string, category: Category) { return watched.get(userId)?.overrides?.[category] ?? globalEnabled(category); }
function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    const account = owner;
    if (account) saveTimer = setTimeout(() => { saveTimer = undefined; if (running && owner === account) void DataStore.set(storageKey(account), entries); }, 500);
}
async function load() {
    const account = UserStore.getCurrentUser()?.id; owner = account; entries = []; voiceCache.clear(); presenceCache.clear(); profileCache.clear(); typingCache.clear(); messageCache.clear(); publish();
    if (!account) return;
    const stored = await DataStore.get<Entry[]>(storageKey(account));
    if (running && owner === account && Array.isArray(stored)) { entries = stored.filter(e => e && typeof e.id === "string" && categories.includes(e.category)).slice(-settings.store.maxLogs); publish(); }
}
function append(userId: string, category: Category, title: string, text: string, location: Partial<Entry> = {}) {
    if (!running || !watched.has(userId) || !enabled(userId, category) || owner !== UserStore.getCurrentUser()?.id) return;
    const entry: Entry = { id: `${Date.now()}:${Math.random().toString(36).slice(2)}`, at: Date.now(), userId, category, title, text, ...location };
    entries = [...entries.slice(-(settings.store.maxLogs - 1)), entry]; publish(); persist();
    if (settings.store.notifications && preset() !== "silent") void Notifications.showNotification({ title: `${displayName(userId)} · ${title}`, body: text, onClick: entry.channelId ? () => NavigationRouter.transitionTo(`/channels/${entry.guildId ?? "@me"}/${entry.channelId}${entry.messageId ? `/${entry.messageId}` : ""}`) : undefined });
}
function addUser(id: string, label = "") { if (!/^\d{17,20}$/.test(id)) return false; const user = UserStore.getUser(id); watched.set(id, { id, label: label || user?.globalName || user?.username || "", overrides: {} }); saveWatchlist(); return true; }
function rememberMessage(key: string, value: { authorId: string; content: string; guildId?: string; channelId: string; }) {
    if (!watched.has(value.authorId)) return;
    messageCache.set(key, value);
    if (messageCache.size > settings.store.maxLogs) {
        const oldest = messageCache.keys().next().value;
        if (oldest) messageCache.delete(oldest);
    }
}
function removeUser(id: string) { watched.delete(id); entries = entries.filter(e => e.userId !== id); saveWatchlist(); persist(); }
function toggleUser(user: User) { watched.has(user.id) ? removeUser(user.id) : addUser(user.id, user.globalName || user.username); }
function avatar(id: string) { return UserStore.getUser(id)?.getAvatarURL(undefined, 80, true); }
function Icon({ className }: { className?: string; }) { return <svg className={className} width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4c5.5 0 9.5 5.2 10.7 7.1a1.7 1.7 0 0 1 0 1.8C21.5 14.8 17.5 20 12 20S2.5 14.8 1.3 12.9a1.7 1.7 0 0 1 0-1.8C2.5 9.2 6.5 4 12 4m0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4" /></svg>; }
function download(data: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function importData(file: File) { void file.text().then(text => { const data = JSON.parse(text) as { watched?: Watched[]; entries?: Entry[]; }; if (Array.isArray(data.watched)) for (const item of data.watched) if (/^\d{17,20}$/.test(item.id)) watched.set(item.id, item); if (Array.isArray(data.entries)) entries = data.entries.filter(e => categories.includes(e.category)).slice(-settings.store.maxLogs); saveWatchlist(); persist(); }).catch(() => undefined); }

function Presets() {
    const current = preset();
    return <section><h4>GLOBAL PRESET MODE</h4><div className="vc-ur-presets">{(["custom", "stalker", "lite", "silent"] as Preset[]).map(mode => <button key={mode} className={current === mode ? "active" : ""} onClick={() => { settings.store.preset = mode; publish(); }}><b>{mode[0].toUpperCase() + mode.slice(1)}</b><small>{mode === "custom" ? "Per-user control" : mode === "stalker" ? "Everything tracked" : mode === "lite" ? "Essential tracking only" : "Log silently"}</small></button>)}</div></section>;
}
function WatchCard({ item }: { item: Watched; }) {
    const [expanded, setExpanded] = React.useState(false), image = avatar(item.id);
    return <article className="vc-ur-watch-card"><div className="vc-ur-user-row"><button className={`vc-ur-pin ${item.pinned ? "active" : ""}`} onClick={() => { item.pinned = !item.pinned; saveWatchlist(); }}>◆</button>{image && <img src={image} />}<div className="vc-ur-user-main"><b>{displayName(item.id)}</b><small>{item.id} · {entries.filter(e => e.userId === item.id).length} events</small></div><TextInput value={item.label} onChange={value => { item.label = value; saveWatchlist(); }} placeholder="label" /><Button size="small" onClick={() => openLog(item.id)}>Activity</Button><button className="vc-ur-plain" onClick={() => setExpanded(!expanded)}>{expanded ? "⌃" : "⌄"}</button><button className="vc-ur-delete" onClick={() => removeUser(item.id)}>⌫</button></div>{expanded && <div className="vc-ur-overrides">{categories.map(category => <label key={category}><span>{categoryNames[category]}</span><input type="checkbox" checked={enabled(item.id, category)} onChange={event => { item.overrides ??= {}; item.overrides[category] = event.currentTarget.checked; saveWatchlist(); }} /></label>)}</div>}</article>;
}
function Manager() {
    React.useSyncExternalStore(subscribe, () => revision);
    const [id, setId] = React.useState(""), [query, setQuery] = React.useState("");
    const list = [...watched.values()].filter(item => `${displayName(item.id)} ${item.id}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || displayName(a.id).localeCompare(displayName(b.id)));
    return <div className="vc-ur-shell"><div className="vc-ur-hero"><div><span>USER RADAR</span><h2>Watchlist control center</h2><p>Track selected users locally, tune every signal, and review a searchable timeline.</p></div><div className="vc-ur-live"><i /> Radar active <b>{watched.size}</b></div></div><div className="vc-ur-add"><TextInput value={id} onChange={setId} placeholder="paste a Discord user ID" /><Button disabled={!/^\d{17,20}$/.test(id)} onClick={() => { if (addUser(id)) setId(""); }}>add user</Button></div><Presets /><div className="vc-ur-list-head"><h4>WATCHLIST ({watched.size})</h4><TextInput value={query} onChange={setQuery} placeholder="search…" /></div><div className="vc-ur-watch-list">{list.length ? list.map(item => <WatchCard key={item.id} item={item} />) : <div className="vc-ur-empty"><Icon /><h3>{watched.size ? "No matching users" : "Your radar is clear"}</h3><p>{watched.size ? "Try a different search." : "Paste a user ID above or add somebody from their right-click menu."}</p></div>}</div><footer><label className="vc-ur-import"><input type="file" accept="application/json" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) importData(file); }} />Import</label><Button onClick={() => download({ watched: [...watched.values()], entries }, "UserRadar-export.json")}>Export</Button><Button variant="dangerSecondary" disabled={!entries.length} onClick={() => { entries = []; persist(); publish(); }}>Clear All Logs</Button></footer></div>;
}
function openEvent(entry: Entry) {
    const channel = entry.channelId ? ChannelStore.getChannel(entry.channelId) : undefined;
    const guild = entry.guildId ? GuildStore.getGuild(entry.guildId) : undefined;
    openModal(props => <Modal {...props} size="lg" title={entry.title}>
        <div className="vc-ur-details">
            <p>{entry.text}</p>
            <dl>
                <dt>Person</dt><dd>{displayName(entry.userId)}</dd>
                <dt>When</dt><dd><time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })}</time></dd>
                <dt>Elapsed</dt><dd>{moment(entry.at).fromNow()}</dd>
                <dt>Event</dt><dd>{categoryNames[entry.category]}</dd>
                {entry.guildId && <><dt>Server</dt><dd>{guild?.name ?? entry.guildId}</dd></>}
                {entry.channelId && <><dt>Channel</dt><dd>{channel?.name || entry.channelId}</dd></>}
            </dl>
            {entry.channelId && <Button onClick={() => { props.onClose(); NavigationRouter.transitionTo(`/channels/${entry.guildId ?? "@me"}/${entry.channelId}${entry.messageId ? `/${entry.messageId}` : ""}`); }}>Open channel</Button>}
        </div>
    </Modal>, { modalKey: "mc5mr-user-radar-event" });
}
function Log({ userId }: { userId?: string; }) {
    React.useSyncExternalStore(subscribe, () => revision);
    const [query, setQuery] = React.useState(""), [filter, setFilter] = React.useState<Category | "all">("all");
    const [visibleCount, setVisibleCount] = React.useState(100);
    React.useEffect(() => setVisibleCount(100), [query, filter, userId]);
    const all = entries.filter(e => !userId || e.userId === userId), source = all.filter(e => (filter === "all" || e.category === filter) && `${e.title} ${e.text} ${displayName(e.userId)}`.toLowerCase().includes(query.toLowerCase()));
    const today = source.filter(e => new Date(e.at).toDateString() === new Date().toDateString()), voice = today.filter(e => e.category === "voice").reduce((n, e) => n + (e.startedAt ? e.at - e.startedAt : 0), 0);
    return <div className="vc-ur-shell"><div className="vc-ur-stats"><span><b>{today.filter(e => e.category === "message").length}</b>MESSAGES TODAY</span><span><b>{Math.round(voice / 60000)}m</b>VOICE TODAY</span><span><b>{today.filter(e => e.category === "status").length}</b>STATUS CHANGES</span><span><b>{today.length}</b>EVENTS TODAY</span></div><TextInput value={query} onChange={setQuery} placeholder="Search activity…" /><div className="vc-ur-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>{categories.map(c => <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{categoryNames[c]} {all.filter(e => e.category === c).length}</button>)}</div><div className="vc-ur-events">{source.slice(-visibleCount).reverse().map(entry => <article key={entry.id} onClick={() => openEvent(entry)}><div className={`vc-ur-event-icon ${entry.category}`}>{categoryNames[entry.category][0]}</div><div><b>{!userId && `${displayName(entry.userId)} · `}{entry.title}</b><p>{entry.text}</p></div><Button size="small" onClick={event => { event.stopPropagation(); openEvent(entry); }}>{moment(entry.at).fromNow()}</Button><button className="vc-ur-delete" onClick={event => { event.stopPropagation(); entries = entries.filter(e => e.id !== entry.id); persist(); publish(); }}>⌫</button></article>)}</div>{!source.length && <p className="vc-ur-empty">No matching activity yet.</p>}<footer><span>{Math.min(visibleCount, source.length)} of {source.length} events</span>{source.length > visibleCount && <Button onClick={() => setVisibleCount(count => count + 100)}>Show 100 more</Button>}<Button onClick={() => download(source, "UserRadar-activity.json")}>Export</Button><Button variant="dangerSecondary" onClick={() => { const ids = new Set(source.map(e => e.id)); entries = entries.filter(e => !ids.has(e.id)); persist(); publish(); }}>Clear</Button></footer></div>;
}
function Dashboard() {
    const [tab, setTab] = React.useState<"watchlist" | "activity">("watchlist");
    return <div className="vc-ur-dashboard"><nav><button className={tab === "watchlist" ? "active" : ""} onClick={() => setTab("watchlist")}>Watchlist</button><button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Activity log</button></nav>{tab === "watchlist" ? <Manager /> : <Log />}</div>;
}
function openManager() { openModal(props => <Modal {...props} size="xxl" title="UserRadar"><Dashboard /></Modal>, { modalKey: MANAGER_KEY }); }
function openLog(userId?: string) { openModal(props => <Modal {...props} size="xxl" title={`${userId ? displayName(userId) : "UserRadar"} · Activity Log`}><Log userId={userId} /></Modal>, { modalKey: LOG_KEY }); }
const userContext: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => { if (user && user.id !== UserStore.getCurrentUser()?.id) children.push(<Menu.MenuItem id="mc5mr-user-radar-toggle" label={watched.has(user.id) ? "إزالة من UserRadar" : "إضافة إلى UserRadar"} action={() => toggleUser(user)} />); };

export default definePlugin({
    name: "UserRadar", description: "Rich local watchlist and searchable activity timeline.", authors: [{ name: "Mc5mr", id: 523157034141745153n }], tags: ["Utility", "Notifications"], settings, managedStyle: style, enabledByDefault: false,
    headerBarButton: { priority: -25, icon: Icon, render: () => <HeaderBarButton icon={Icon} tooltip="UserRadar" onClick={openManager} /> }, contextMenus: { "user-context": userContext },
    settingsAboutComponent: () => <div dir="rtl"><p>قائمة مراقبة وسجل نشاط محلي على جهازك.</p><Button onClick={openManager}>فتح UserRadar</Button></div>,
    start() { running = true; parseWatchlist(); void load(); },
    stop() { running = false; if (saveTimer) clearTimeout(saveTimer); if (owner) void DataStore.set(storageKey(owner), entries); owner = undefined; entries = []; watched.clear(); closeModal(MANAGER_KEY); closeModal(LOG_KEY); closeModal("mc5mr-user-radar-event"); },
    flux: {
        CONNECTION_OPEN() { parseWatchlist(); void load(); }, LOGOUT() { owner = undefined; entries = []; closeModal(MANAGER_KEY); closeModal(LOG_KEY); closeModal("mc5mr-user-radar-event"); publish(); },
        MESSAGE_CREATE({ message, guildId, channelId, optimistic }: MessageEvent) { if (optimistic || !message?.author?.id) return; rememberMessage(`${channelId}:${message.id}`, { authorId: message.author.id, content: message.content || "Attachment or embed", guildId, channelId }); if (watched.has(message.author.id)) append(message.author.id, "message", "sent a message", settings.store.messagePreview ? message.content || "Attachment or embed" : "Sent a message", { guildId, channelId, messageId: message.id }); },
        MESSAGE_UPDATE({ message, guildId, channelId }: MessageEvent) { if (!message?.author?.id || !watched.has(message.author.id)) return; const key = `${channelId}:${message.id}`, previous = messageCache.get(key)?.content ?? "Previous content unavailable", next = message.content || "Attachment or embed"; rememberMessage(key, { authorId: message.author.id, content: next, guildId, channelId }); if (previous !== next) append(message.author.id, "edit", "edited a message", `${previous} → ${next}`, { guildId, channelId, messageId: message.id }); },
        MESSAGE_DELETE({ id, channelId, guildId }: { id: string; channelId: string; guildId?: string; }) { const cached = messageCache.get(`${channelId}:${id}`), message = MessageStore.getMessage(channelId, id), userId = cached?.authorId ?? message?.author?.id; if (userId && watched.has(userId)) append(userId, "delete", "deleted a message", cached?.content ?? message?.content ?? "Deleted content unavailable", { guildId: guildId ?? cached?.guildId, channelId, messageId: id }); messageCache.delete(`${channelId}:${id}`); },
        TYPING_START({ channelId, userId }: { channelId: string; userId: string; }) { if (!watched.has(userId)) return; const key = `${userId}:${channelId}`, now = Date.now(); if (now - (typingCache.get(key) ?? 0) < 60000) return; typingCache.set(key, now); const channel = ChannelStore.getChannel(channelId); append(userId, "typing", "started typing", `#${channel?.name || channelId}`, { guildId: channel?.guild_id, channelId }); },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) { for (const state of voiceStates ?? []) { if (!watched.has(state.userId)) continue; const previous = voiceCache.get(state.userId), signature = `${state.channelId ?? "off"}:${!!state.selfVideo}:${!!state.selfStream}`; if (previous?.signature === signature) continue; const channel = state.channelId ? ChannelStore.getChannel(state.channelId) : undefined, joinedAt = state.channelId ? previous?.joinedAt ?? Date.now() : undefined; voiceCache.set(state.userId, { signature, channelId: state.channelId ?? undefined, joinedAt }); const title = !state.channelId ? "left voice" : state.selfStream ? "screen sharing" : state.selfVideo ? "camera enabled" : `in #${channel?.name || state.channelId}`; append(state.userId, "voice", title, !state.channelId ? `Left after ${previous?.joinedAt ? Math.round((Date.now() - previous.joinedAt) / 1000) : 0}s` : `#${channel?.name || state.channelId}`, { guildId: channel?.guild_id, channelId: state.channelId ?? previous?.channelId, startedAt: !state.channelId ? previous?.joinedAt : joinedAt }); } },
        PRESENCE_UPDATES({ updates }: { updates: PresenceUpdate[]; }) { for (const update of updates ?? []) { const id = update.user?.id; if (!id || !watched.has(id)) continue; const status = update.status ?? PresenceStore.getStatus(id) ?? "offline", activity = (update.activities ?? []).map(a => `${a.name}${a.details ? ` · ${a.details}` : ""}${a.state ? ` · ${a.state}` : ""}`).join(" | "), previous = presenceCache.get(id); if (previous?.status !== status) append(id, "status", `${status} session`, `${previous?.status ?? "unknown"} → ${status}${update.clientStatus ? ` · ${Object.keys(update.clientStatus).join(", ")}` : ""}`); if (activity && previous?.activity !== activity) append(id, "activity", "activity changed", activity); presenceCache.set(id, { status, activity }); } },
        USER_UPDATE({ user }: { user: User; }) { if (!user?.id || !watched.has(user.id)) return; const signature = `${user.username}|${user.globalName}|${user.avatar}`, previous = profileCache.get(user.id); profileCache.set(user.id, signature); if (previous && previous !== signature) append(user.id, "profile", "profile changed", `${previous} → ${signature}`); },
        GUILD_MEMBER_ADD({ guildId, user }: { guildId: string; user: User; }) { if (watched.has(user?.id)) append(user.id, "server", "joined a server", GuildStore.getGuild(guildId)?.name || guildId, { guildId }); },
        GUILD_MEMBER_REMOVE({ guildId, user }: { guildId: string; user: User; }) { if (watched.has(user?.id)) append(user.id, "server", "left a server", GuildStore.getGuild(guildId)?.name || guildId, { guildId }); }
    }
});
