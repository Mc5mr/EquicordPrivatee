/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { sleep } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import type { Channel } from "@vencord/discord-types";
import { Avatar, ChannelStore, closeModal, Constants, IconUtils, Modal, openModal, React, RelationshipStore, RestAPI, showToast, TextInput, Toasts, UserStore, useStateFromStores } from "@webpack/common";

import { EmptyState, Panel, Status } from "../NightcordUI.discordDesktop/ui";
import { ExportMessage, ExportOptions, Format, serialize } from "./formats";
import style from "./styles.css?managed";

const MODAL_KEY = "mc5mr-export-dms";
const FORMATS: { format: Format; label: string; detail: string; }[] = [{ format: "html", label: "HTML", detail: "Web page with media" }, { format: "txt", label: "TXT", detail: "Plain text" }, { format: "md", label: "MD", detail: "Markdown" }, { format: "json", label: "JSON", detail: "Structured data" }, { format: "csv", label: "CSV", detail: "Spreadsheet" }];
const settings = definePluginSettings({
    maxMessages: { type: OptionType.SLIDER, description: "Maximum recent messages; 0 fetches all available history. Large exports take time.", default: 5000, markers: [0, 100, 500, 1000, 5000, 10000, 50000] }
});
const listeners = new Set<() => void>();
let status = "لا يوجد تصدير قيد التشغيل.";
let exporting = false;
let generation = 0;

function updateStatus(value: string) { status = value; listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function cancel() { generation++; updateStatus("أُلغي التصدير. الطلب الجاري قد يكتمل ثم يتوقف."); }

function ExportIcon({ className }: { className?: string; }) {
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m-4 4 4-4 4 4M5 12H3v8h18v-8h-2" /></svg>;
}
function ExportPanel() {
    const value = React.useSyncExternalStore(subscribe, () => status);
    const [query, setQuery] = React.useState("");
    const [selected, setSelected] = React.useState("");
    const [format, setFormat] = React.useState<Format>("html");
    const [options, setOptions] = React.useState<ExportOptions>({ media: true, embeds: true, reactions: true });
    const conversations = useStateFromStores([ChannelStore, UserStore, RelationshipStore], () => {
        const rows: { id: string; userId: string | undefined; channel: Channel | undefined; name: string; avatar: string | undefined; }[] = ChannelStore.getSortedPrivateChannels().map(channel => {
            const id = channel.recipients?.[0]; const user = id ? UserStore.getUser(id) : undefined;
            return { id: channel.id, userId: id, channel, name: channel.name || user?.globalName || user?.username || channel.id, avatar: user ? IconUtils.getUserAvatarURL(user, false, 40) : undefined };
        });
        for (const id of RelationshipStore.getFriendIDs()) {
            if (rows.some(row => row.userId === id)) continue;
            const user = UserStore.getUser(id);
            rows.push({ id: `user:${id}`, userId: id, channel: undefined, name: user?.globalName || user?.username || id, avatar: user ? IconUtils.getUserAvatarURL(user, false, 40) : undefined });
        }
        return rows;
    });
    const rows = conversations.filter(row => `${row.name} ${row.userId ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <Panel className="vc-nc-export" dir="ltr"><TextInput value={query} onChange={setQuery} placeholder="Search for a friend or a DM…" aria-label="Search conversations" /><small>CHOOSE A CONVERSATION</small><div className="vc-nc-export-conversations">{rows.length ? rows.map(row => <button type="button" className={`vc-nc-export-conversation${selected === row.id ? " selected" : ""}`} key={row.id} disabled={exporting} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}><Avatar src={row.avatar ?? IconUtils.getDefaultAvatarURL(row.userId ?? row.id)} size="SIZE_32" /><strong>{row.name}</strong></button>) : <EmptyState title="No matching conversations" />}</div><div className="vc-nc-export-options">{([["media", "Images / Videos / Audio"], ["embeds", "Links / Embeds"], ["reactions", "Reactions"]] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} disabled={exporting} onChange={event => setOptions(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><small>EXPORT FORMAT</small><div className="vc-nc-export-formats">{FORMATS.map(item => <button key={item.format} type="button" disabled={exporting} aria-pressed={format === item.format} className={format === item.format ? "selected" : ""} onClick={() => setFormat(item.format)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div><Button disabled={!selected || exporting} onClick={() => {
        const row = conversations.find(item => item.id === selected);
        if (row) void exportMessages(row.channel, format, options, row.userId);
    }}>{exporting ? "Exporting…" : "Export"}</Button><Status>{value}</Status>{exporting && <Button variant="secondary" onClick={cancel}>Cancel export</Button>}</Panel>;
}
function openExporter() { openModal(props => <Modal {...props} title="Export DMs" size="lg"><ExportPanel /></Modal>, { modalKey: MODAL_KEY }); }

async function fetchMessages(channel: Channel, epoch: number) {
    const messages: ExportMessage[] = [];
    let before: string | undefined;
    const limit = settings.store.maxMessages || Number.POSITIVE_INFINITY;
    const owner = UserStore.getCurrentUser()?.id;
    while (messages.length < limit) {
        if (epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return null;
        const pageSize = Math.min(100, limit - messages.length);
        const response = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(channel.id), query: { limit: pageSize, ...(before ? { before } : {}) } });
        if (epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return null;
        const page = response.body as ExportMessage[];
        if (!Array.isArray(page)) throw new Error("Unexpected history response.");
        if (!page.length) break;
        const next = page[page.length - 1].id;
        if (next === before) throw new Error("Pagination did not advance.");
        messages.push(...page);
        before = next;
        updateStatus(`جُمعت ${messages.length} رسالة...`);
        if (page.length < pageSize) break;
        await sleep(1200);
    }
    return messages.reverse();
}

export async function exportMessages(channel: Channel | undefined, format: Format, options: ExportOptions = { media: true, embeds: true, reactions: true }, userId?: string) {
    if (exporting) { showToast("تصدير آخر قيد التشغيل.", Toasts.Type.FAILURE); return; }
    exporting = true;
    const epoch = ++generation;
    const owner = UserStore.getCurrentUser()?.id;
    updateStatus("جارٍ جمع رسائل المحادثة...");
    try {
        if (!channel && userId) {
            const { openPrivateChannel } = await import("@utils/discord");
            if (epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return;
            await openPrivateChannel(userId, false);
            const id = ChannelStore.getDMFromUserId(userId);
            channel = id ? ChannelStore.getChannel(id) : undefined;
        }
        if (!channel || (channel.type !== 1 && channel.type !== 3)) throw new Error("تعذر فتح المحادثة.");
        if (epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return;
        const messages = await fetchMessages(channel, epoch);
        if (!messages || epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return;
        const filename = `dm-${channel.id}-${new Date().toISOString().slice(0, 10)}.${format}`;
        const contents = serialize(messages, channel.name || channel.id, format, options);
        const mime = format === "json" ? "application/json" : format === "html" ? "text/html" : format === "csv" ? "text/csv" : "text/plain";
        saveFile(new File([contents], filename, { type: `${mime};charset=utf-8` }));
        updateStatus(`اكتمل تصدير ${messages.length} رسالة.`);
        showToast(status, Toasts.Type.SUCCESS);
    } catch (error) {
        if (epoch === generation) { updateStatus(`تعذر التصدير: ${String(error)}`); showToast(status, Toasts.Type.FAILURE); }
    } finally { exporting = false; listeners.forEach(listener => listener()); }
}

export default definePlugin({
    name: "DmCapture",
    description: "Export accessible DM history as HTML, TXT, Markdown, JSON, or CSV, with pagination and cancellation.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Utility", "Chat"],
    settings,
    managedStyle: style,
    headerBarButton: { priority: -21, icon: ExportIcon, render: () => <HeaderBarButton className="vc-mc5mr-header-button" icon={ExportIcon} tooltip="Export DMs" onClick={openExporter} /> },
    settingsAboutComponent: () => <Button onClick={openExporter}>Export DMs</Button>,
    flux: { LOGOUT() { cancel(); closeModal(MODAL_KEY); }, CONNECTION_OPEN: cancel },
    stop() { cancel(); closeModal(MODAL_KEY); }
});
