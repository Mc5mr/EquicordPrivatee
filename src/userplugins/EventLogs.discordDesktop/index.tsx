/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import type { VoiceState } from "@vencord/discord-types";
import { ChannelStore, closeModal, Menu, Modal, openModal, PermissionsBits, PermissionStore, React, showToast, TextInput, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { EmptyState, Panel, Status, ui } from "../NightcordUI.discordDesktop/ui";

interface Entry { at: string; kind: string; text: string; }
const settings = definePluginSettings({ revision: { type: OptionType.NUMBER, description: "Local event revision.", default: 0, hidden: true }, voice: { type: OptionType.BOOLEAN, description: "Log voice state updates in your own current voice room.", default: true }, friends: { type: OptionType.BOOLEAN, description: "Log changes to your own friend relationships.", default: true } });
const listeners = new Set<() => void>();
const lastVoiceEntries = new Map<string, string>();
let revision = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveBusy = false;
let dirty = false;
const MODAL_KEY = "mc5mr-event-logs";
let entries: Entry[] = [];
let account: string | undefined;
let generation = 0;
let running = false;
let saving = Promise.resolve();
let storageFailed = false;
let loaded = false;

const headerCl = classNameFactory("vc-mc5mr-header-");

function storageError() { if (!storageFailed) showToast("تعذر حفظ أو قراءة سجل الأحداث؛ الأحداث الحالية متاحة في الذاكرة فقط.", Toasts.Type.FAILURE); storageFailed = true; publish(); }

function publish() { revision++; listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!dirty || !account || !loaded) return;
    dirty = false;
    saveBusy = true;
    const owner = account;
    const snapshot = [...entries];
    saving = saving.then(() => DataStore.set(`mc5mr-events:${owner}`, snapshot)).catch(() => { if (running && account === owner) storageError(); }).finally(() => { saveBusy = false; if (dirty) persist(); });
}
function persist() {
    if (!account || !loaded) return;
    dirty = true;
    if (!saveTimer && !saveBusy) saveTimer = setTimeout(flush, 500);
}
function append(kind: string, text: string) {
    if (!running || !account || account !== UserStore.getCurrentUser()?.id) return;
    entries = [...entries.slice(-499), { at: new Date().toISOString(), kind, text }];
    publish(); persist();
}
async function load() {
    flush();
    const epoch = ++generation;
    account = UserStore.getCurrentUser()?.id;
    entries = []; loaded = false; storageFailed = false; lastVoiceEntries.clear(); publish();
    if (!account) return;
    let value: Entry[] | undefined;
    try { await saving; if (epoch !== generation || !running) return; value = await DataStore.get<Entry[]>(`mc5mr-events:${account}`); }
    catch { if (running && epoch === generation) storageError(); return; }
    if (!running || epoch !== generation) return;
    const stored = Array.isArray(value) ? value.filter(entry => entry && typeof entry.at === "string" && Number.isFinite(Date.parse(entry.at)) && typeof entry.kind === "string" && typeof entry.text === "string").slice(-500) : [];
    const buffered = entries;
    entries = [...stored, ...buffered].slice(-500);
    loaded = true;
    publish();
    if (buffered.length) persist();
}
function Logs() {
    React.useSyncExternalStore(subscribe, () => revision);
    const [query, setQuery] = React.useState("");
    const visible = entries.filter(entry => `${entry.kind} ${entry.text}`.toLowerCase().includes(query.toLowerCase()));
    return <Panel><p className={ui("muted")}>آخر 500 حدث رصدته جلستك الحالية، محفوظة لهذا الحساب.</p>{storageFailed && <Status error>تعذر التخزين؛ صدّر السجل قبل إغلاق العميل.</Status>}<TextInput value={query} onChange={setQuery} placeholder="البحث في الأحداث" aria-label="البحث في سجل الأحداث" /><div className={ui("toolbar")}><span className={ui("count")}>{visible.length} / {entries.length} حدث</span><div className={ui("actions")}><Button size="small" variant="secondary" disabled={!entries.length} onClick={() => saveFile(new File([JSON.stringify(entries, null, 2)], "EventLogs.json", { type: "application/json" }))}>تصدير JSON</Button><Button size="small" variant="dangerSecondary" disabled={!entries.length || !loaded} onClick={() => { entries = []; publish(); persist(); }}>مسح السجل</Button></div></div>{visible.length ? <div className={ui("scroll")}>{visible.slice().reverse().map((entry, index) => <article className={ui("log-entry")} key={`${entry.at}:${index}`}><time>{new Date(entry.at).toLocaleString()}</time><strong>{entry.kind}</strong><span>{entry.text}</span></article>)}</div> : <EmptyState title={query ? "لا توجد أحداث مطابقة" : "السجل فارغ"} detail="تظهر هنا تحديثات الصوت والعلاقات التي يرصدها البلوقن." />}</Panel>;
}
function Icon({ className }: { className?: string; }) { return <svg className={className} width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M4 2h16v20H4zm3 4v2h10V6zm0 5v2h10v-2zm0 5v2h6v-2z" /></svg>; }
function open() { openModal(props => <Modal {...props} size="xl" title="Event Logs"><Logs /></Modal>, { modalKey: MODAL_KEY }); }

export default definePlugin({
    name: "EventLogs",
    description: "Keep a local per-account record of observed voice-room updates and changes to your own friend relationships.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility"],
    dependencies: ["NightcordUI"],
    settings,
    headerBarButton: { priority: -30, icon: Icon, render: () => <HeaderBarButton className={headerCl("button")} icon={Icon} tooltip="سجل الأحداث" onClick={open} /> },
    settingsAboutComponent: () => <Button onClick={open}>فتح السجل المحلي</Button>,
    contextMenus: { "user-context"(children) { children.push(<Menu.MenuItem id="mc5mr-event-logs" label="Event Logs" action={open} />); } },
    async start() { running = true; await load(); },
    stop() { flush(); running = false; generation++; loaded = false; account = undefined; entries = []; lastVoiceEntries.clear(); closeModal(MODAL_KEY); },
    flux: {
        CONNECTION_OPEN: load,
        LOGOUT() { flush(); generation++; loaded = false; account = undefined; entries = []; lastVoiceEntries.clear(); publish(); closeModal(MODAL_KEY); },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!settings.store.voice) return;
            const me = UserStore.getCurrentUser();
            const current = me ? VoiceStateStore.getVoiceStateForUser(me.id)?.channelId : undefined;
            for (const state of voiceStates) {
                if (state.userId !== me?.id && (!current || state.channelId !== current)) continue;
                const channel = state.channelId ? ChannelStore.getChannel(state.channelId) : undefined;
                if (channel?.guild_id && !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel)) continue;
                const text = `${UserStore.getUser(state.userId)?.username || state.userId} · ${channel?.name || "Disconnected"} · server mute=${state.mute} · server deaf=${state.deaf}`;
                if (lastVoiceEntries.get(state.userId) === text) continue;
                lastVoiceEntries.set(state.userId, text);
                if (lastVoiceEntries.size > 500) { const oldest = lastVoiceEntries.keys().next().value; if (oldest) lastVoiceEntries.delete(oldest); }
                append("Voice update", text);
            }
        },
        RELATIONSHIP_ADD({ relationship }: { relationship?: { id: string; type: number; }; }) { if (settings.store.friends && relationship) append("Relationship", `${relationship.id} · type=${relationship.type}`); },
        RELATIONSHIP_REMOVE({ id }: { id: string; }) { if (settings.store.friends) append("Relationship removed", id); }
    }
});
