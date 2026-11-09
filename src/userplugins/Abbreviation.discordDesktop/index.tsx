/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import definePlugin, { OptionType } from "@utils/types";
import { React, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

import { EmptyState, Panel, Status, ui } from "../NightcordUI.discordDesktop/ui";

interface Entry { abbreviation: string; phrase: string; }
let entries: Entry[] = [];
let account: string | undefined;
let generation = 0;
let running = false;
let loaded = false;
const listeners = new Set<() => void>();
function publish() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const settings = definePluginSettings({ wholeMessage: { type: OptionType.BOOLEAN, description: "Replace only when the entire message is an abbreviation.", default: true }, caseSensitive: { type: OptionType.BOOLEAN, description: "Match letter case exactly.", default: false } });

async function load() {
    const epoch = ++generation;
    account = UserStore.getCurrentUser()?.id;
    entries = [];
    loaded = false;
    publish();
    if (!account) return;
    let stored: Entry[] | undefined;
    try { stored = await DataStore.get<Entry[]>(`mc5mr-abbreviation:${account}`); }
    catch { if (epoch === generation && running) showToast("تعذرت قراءة الاختصارات المحفوظة.", Toasts.Type.FAILURE); return; }
    if (epoch !== generation || !running) return;
    entries = Array.isArray(stored) ? stored.filter(entry => entry && typeof entry.abbreviation === "string" && typeof entry.phrase === "string").slice(0, 200) : [];
    loaded = true;
    publish();
}

function Manager() {
    const rows = React.useSyncExternalStore(subscribe, () => entries);
    const [abbreviation, setAbbreviation] = React.useState("");
    const [phrase, setPhrase] = React.useState("");
    const [status, setStatus] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    async function update(remove?: string) {
        if (busy || !account || !loaded) return;
        const owner = account;
        const epoch = generation;
        if (!remove && (!abbreviation.trim() || !phrase.trim() || (rows.length >= 200 && !rows.some(entry => entry.abbreviation === abbreviation.trim())))) return;
        const next = remove ? entries.filter(entry => entry.abbreviation !== remove) : [...entries.filter(entry => entry.abbreviation !== abbreviation.trim()), { abbreviation: abbreviation.trim(), phrase: phrase.trim() }];
        setBusy(true);
        try {
            await DataStore.set(`mc5mr-abbreviation:${owner}`, next);
            if (!running || generation !== epoch || owner !== UserStore.getCurrentUser()?.id) return;
            entries = next; publish(); setAbbreviation(""); setPhrase(""); setStatus("تم الحفظ لهذا الحساب.");
        } catch { setStatus("تعذر الحفظ."); }
        finally { setBusy(false); }
    }
    return <Panel><p className={ui("muted")}>احفظ اختصارًا، ويتوسع عند إرسال الرسالة.</p><div className={ui("grid")}><label className={ui("field")}><span>الاختصار</span><TextInput value={abbreviation} onChange={setAbbreviation} placeholder="مثل: سلام" disabled={!loaded || busy} aria-label="الاختصار" /></label><label className={ui("field")}><span>النص الكامل</span><TextInput value={phrase} onChange={setPhrase} placeholder="النص الذي يحل محل الاختصار" disabled={!loaded || busy} aria-label="النص الكامل" /></label></div><div className={ui("actions")}><Button disabled={busy || !loaded || !abbreviation.trim() || !phrase.trim()} onClick={() => void update()}>حفظ الاختصار</Button>{!loaded && <Button variant="secondary" onClick={() => void load()}>إعادة التحميل</Button>}<span className={ui("count")}>{rows.length} / 200</span></div><Status>{status}</Status>{rows.length ? <div className={ui("scroll")}>{rows.map(entry => <div className={ui("row")} key={entry.abbreviation}><div className={ui("identity")}><strong>{entry.abbreviation}</strong><span>{entry.phrase}</span></div><Button size="small" variant="dangerSecondary" disabled={busy || !loaded} onClick={() => void update(entry.abbreviation)}>حذف</Button></div>)}</div> : <EmptyState title="لا توجد اختصارات" detail="أضف أول اختصار من الحقول أعلاه." />}</Panel>;
}

export default definePlugin({
    name: "Abbreviation",
    description: "Expand your saved abbreviations when sending a message, with per-account local storage.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Chat"],
    dependencies: ["NightcordUI"],
    settings,
    settingsAboutComponent: Manager,
    onBeforeMessageSend(_channelId, message) {
        if (account !== UserStore.getCurrentUser()?.id) return;
        const normalize = (text: string) => settings.store.caseSensitive ? text : text.toLowerCase();
        const replace = (text: string) => entries.find(entry => normalize(entry.abbreviation) === normalize(text))?.phrase ?? text;
        if (settings.store.wholeMessage) {
            const entry = entries.find(entry => normalize(entry.abbreviation) === normalize(message.content.trim()));
            if (entry) message.content = entry.phrase;
        } else message.content = message.content.split(/(\s+)/).map(replace).join("");
    },
    async start() { running = true; await load(); },
    stop() { running = false; generation++; entries = []; loaded = false; account = undefined; publish(); },
    flux: { CONNECTION_OPEN: load, LOGOUT() { generation++; entries = []; loaded = false; account = undefined; publish(); } }
});
