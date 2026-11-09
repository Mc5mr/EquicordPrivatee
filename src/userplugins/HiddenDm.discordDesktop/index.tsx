/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import { ChannelStore, React, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

import { EmptyState, Panel, Status, ui } from "../NightcordUI.discordDesktop/ui";

const hiddenChannels = new Set<string>();
const listeners = new Set<() => void>();
let revision = 0;
let generation = 0;
let active = false;
let loaded = false;
let storageFailed = false;
let saving = Promise.resolve();
let instance: { forceUpdate(): void; } | undefined;

function storeKey() { return `Mc5mrHiddenDms:${UserStore.getCurrentUser()?.id ?? "signed-out"}`; }
function publish() { revision++; instance?.forceUpdate(); listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

async function load() {
    const epoch = ++generation;
    const key = storeKey();
    loaded = false;
    storageFailed = false;
    hiddenChannels.clear();
    publish();
    let saved: unknown;
    try { await saving; if (!active || epoch !== generation) return; saved = await DataStore.get<unknown>(key); }
    catch { if (active && epoch === generation) { storageFailed = true; publish(); } return; }
    if (!active || epoch !== generation || key !== storeKey()) return;
    hiddenChannels.clear();
    if (Array.isArray(saved)) saved.filter((id): id is string => typeof id === "string" && /^\d{17,20}$/.test(id)).forEach(id => hiddenChannels.add(id));
    loaded = true;
    publish();
}

function saveHiddenChannels() {
    const key = storeKey();
    const snapshot = [...hiddenChannels];
    saving = saving.then(() => DataStore.set(key, snapshot)).catch(() => {
        if (active && key === storeKey()) { storageFailed = true; publish(); showToast("تعذر حفظ قائمة المحادثات المخفية.", Toasts.Type.FAILURE); }
    });
}

function toggleHidden(channelId: string) {
    if (!loaded) return;
    if (hiddenChannels.has(channelId)) hiddenChannels.delete(channelId);
    else hiddenChannels.add(channelId);
    saveHiddenChannels();
    publish();
}

function unhideAll() {
    if (!loaded) return;
    hiddenChannels.clear();
    saveHiddenChannels();
    publish();
}

function HiddenPanel() {
    React.useSyncExternalStore(subscribe, () => revision);
    return <Panel><p className={ui("muted")}>المحادثات مخفية من القائمة عندك، ورسائلها تبقى في الحساب.</p>
        <div className={ui("toolbar")}><Button disabled={!loaded} onClick={() => { const id = SelectedChannelStore.getChannelId(); const channel = ChannelStore.getChannel(id); if (channel && [1, 3].includes(channel.type)) toggleHidden(id); else showToast("افتح محادثة خاصة أولًا.", Toasts.Type.FAILURE); }}>إخفاء / إظهار الخاص المفتوح</Button><Button disabled={!loaded || !hiddenChannels.size} onClick={unhideAll}>إظهار الكل</Button><span className={ui("count")}>{hiddenChannels.size} محادثة مخفية</span></div>
        {storageFailed && <Status error>تعذر التخزين. <Button size="small" variant="secondary" onClick={() => void load()}>إعادة التحميل</Button></Status>}
        {!loaded && !storageFailed ? <Status>جارٍ التحميل…</Status> : hiddenChannels.size ? <div className={ui("scroll")}>{[...hiddenChannels].map(id => <div className={ui("row")} key={id}><div className={ui("identity")}><strong>{ChannelStore.getChannel(id)?.name || "محادثة خاصة"}</strong><span>{id}</span></div><Button size="small" variant="secondary" disabled={!loaded} onClick={() => toggleHidden(id)}>إظهار</Button></div>)}</div> : <EmptyState title="لا توجد محادثات مخفية" detail="افتح الخاص ثم استخدم الزر أعلاه." />}
    </Panel>;
}

export default definePlugin({
    name: "HiddenDm",
    description: "Hide DMs from your local list and restore them from plugin settings.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Organisation"],
    dependencies: ["NightcordUI"],
    patches: [{
        find: '"dm-quick-launcher"===',
        replacement: [{
            match: /(?<=channels:\i,)privateChannelIds:(\i)(?=,listRef:)/,
            replace: "$&.filter(c=>!$self.isHidden(c))"
        }, { match: /render\(\)\{/, replace: "$&$self.capture(this);" }]
    }],
    isHidden(channelId: string) {
        return hiddenChannels.has(channelId);
    },
    capture(value: { forceUpdate(): void; }) { instance = value; },
    start() { active = true; void load(); },
    flux: {
        CONNECTION_OPEN() { void load(); },
        LOGOUT() { generation++; loaded = false; hiddenChannels.clear(); publish(); }
    },
    stop() {
        active = false;
        loaded = false;
        generation++;
        hiddenChannels.clear();
        publish();
        instance = undefined;
    },
    settingsAboutComponent: HiddenPanel
});
