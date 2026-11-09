/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { sleep } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { Constants, Menu, React, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

interface Pending { dueAt: number; owner: string; channelId: string; timer: ReturnType<typeof setTimeout>; }
const pending = new Map<string, Pending>();
const settings = definePluginSettings({
    seconds: { type: OptionType.NUMBER, description: "Delete new messages you send in the armed channel after this many seconds.", default: 30, isValid: value => typeof value === "number" && Number.isFinite(value) && value >= 10 && value <= 3600 || "Choose between 10 and 3600 seconds." },
    channelId: { type: OptionType.STRING, description: "Session-only armed channel.", default: "", hidden: true },
    delayVersion: { type: OptionType.NUMBER, description: "Delay default migration.", default: 0, hidden: true },
    revision: { type: OptionType.NUMBER, description: "Pending deletion revision.", default: 0, hidden: true }
});
const KEYS: "seconds"[] = ["seconds"];
let running = false;
let generation = 0;
let work = Promise.resolve();
let armedChannel = "";
let revision = 0;
const listeners = new Set<() => void>();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;
let clock = Math.floor(Date.now() / 1000);
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function snapshot() { return revision; }
function idleSubscribe() { return () => {}; }
function clockSnapshot() { return clock; }
function subscribeClock(listener: () => void) {
    clockListeners.add(listener);
    clock = Math.floor(Date.now() / 1000);
    if (!clockTimer) clockTimer = setInterval(() => { clock = Math.floor(Date.now() / 1000); clockListeners.forEach(update => update()); }, 1000);
    return () => { clockListeners.delete(listener); if (!clockListeners.size) { clearInterval(clockTimer); clockTimer = undefined; } };
}

function publish() { revision++; listeners.forEach(listener => listener()); }
function cancel(id: string) { const value = pending.get(id); if (value) clearTimeout(value.timer); pending.delete(id); publish(); }
function clear() { generation++; work = Promise.resolve(); for (const value of pending.values()) clearTimeout(value.timer); pending.clear(); armedChannel = ""; clearInterval(clockTimer); clockTimer = undefined; publish(); }
function toggle(channelId: string) { const active = armedChannel === channelId; clear(); if (!active && channelId) armedChannel = channelId; publish(); showToast(active ? "توقف الحذف وأُلغيت المؤقتات المعلقة." : "تفعّل الحذف لرسائلك الجديدة في هذه المحادثة.", Toasts.Type.SUCCESS); }

function schedule(id: string, channelId: string, owner: string) {
    if (pending.has(id)) return;
    if (pending.size >= 100) { clear(); showToast("توقف الحذف المؤقت بعد بلوغ 100 رسالة معلقة.", Toasts.Type.FAILURE); return; }
    const epoch = generation;
    const delay = Number.isFinite(settings.store.seconds) && settings.store.seconds >= 10 && settings.store.seconds <= 3600 ? settings.store.seconds * 1000 : 30_000;
    const dueAt = Date.now() + delay;
    const timer = setTimeout(() => {
        const remove = async () => {
            if (!running || generation !== epoch || !pending.has(id) || UserStore.getCurrentUser()?.id !== owner) return;
            try {
                const response = await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, id) });
                if (response && response.status >= 400) throw response;
                if (generation === epoch) cancel(id);
            }
            catch (error) {
                if (generation !== epoch || UserStore.getCurrentUser()?.id !== owner) return;
                cancel(id);
                if ((error as { status?: number; }).status !== 404) showToast("تعذر حذف هذه الرسالة؛ أُلغي مؤقتها وبقي الوضع مفعّلًا لبقية الرسائل.", Toasts.Type.FAILURE);
            }
            await sleep(1500);
        };
        work = work.then(remove, remove);
    }, delay);
    pending.set(id, { owner, channelId, dueAt, timer }); publish();
}

function Icon({ className, active = false }: { className?: string; active?: boolean; }) {
    return <svg className={`vc-nc-composer-icon ${className ?? ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 2h4M12 2v3M18 6l2-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="14" r="8" stroke="currentColor" strokeWidth="1.8" /><path d="M12 9v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />{!active && <path d="m3 22 18-19" stroke="var(--status-danger, #ed4245)" strokeWidth="1.8" strokeLinecap="round" />}</svg>;
}
function ToggleButton({ channel, isMainChat }: { channel: { id: string; }; isMainChat: boolean; }) {
    settings.use(KEYS);
    React.useSyncExternalStore(subscribe, snapshot);
    return isMainChat ? <ChatBarButton tooltip={armedChannel === channel.id ? "إيقاف الحذف وإلغاء المؤقتات" : `حذف رسائلي الجديدة بعد ${settings.store.seconds} ثانية`} onClick={() => toggle(channel.id)}><Icon className={armedChannel === channel.id ? "vc-nc-icon-active" : ""} active={armedChannel === channel.id} /></ChatBarButton> : null;
}
function Countdown({ message }: { message: { id: string; }; }) {
    const value = React.useSyncExternalStore(subscribe, () => pending.get(message.id));
    React.useSyncExternalStore(value ? subscribeClock : idleSubscribe, clockSnapshot);
    return value ? <p style={{ color: "var(--text-danger)" }}>Self Destruct · {Math.max(0, Math.ceil((value.dueAt - Date.now()) / 1000))}s <Button size="small" onClick={() => cancel(message.id)}>إلغاء حذف هذه الرسالة</Button></p> : null;
}

export default definePlugin({
    name: "SelfDestruct",
    description: "Arm a channel to delete your new messages after a chosen delay, with a countdown and cancellation.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Chat"],
    settings,
    chatBarButton: { icon: Icon, render: ToggleButton },
    renderMessageAccessory: props => typeof props.message?.id === "string" ? <Countdown message={{ id: props.message.id }} /> : null,
    contextMenus: { message(children, { message }: { message?: { id: string; }; }) { if (message && pending.has(message.id)) children.push(<Menu.MenuItem id="mc5mr-cancel-destruct" label="Cancel Self Destruct" action={() => cancel(message.id)} />); } },
    settingsAboutComponent: () => <p dir="rtl">زر الساعة بجوار كتابة الرسالة يفعّل الحذف لهذه المحادثة. الافتراضي 30 ثانية، ويمكن تعديل المدة أعلاه. إعادة الضغط أو إغلاق العميل يلغي المؤقتات التي لم تبدأ؛ الحذف لا يزيل النسخ المحفوظة لدى الآخرين.</p>,
    start() {
        try { if (!settings.store.delayVersion) { if (settings.store.seconds === 60) settings.store.seconds = 30; settings.store.delayVersion = 1; } }
        catch { showToast("تعذر حفظ المدة الافتراضية؛ يستخدم المؤقت المدة الحالية.", Toasts.Type.FAILURE); }
        running = true; clear();
    },
    stop() { running = false; clear(); },
    flux: {
        LOGOUT: clear,
        MESSAGE_DELETE({ id }: { id: string; }) { if (pending.has(id)) cancel(id); },
        MESSAGE_CREATE({ message, optimistic, sendMessageOptions, channelId, mc5mrLocalPreview }: { message?: { id: string; channel_id?: string; channelId?: string; author?: { id: string; }; }; optimistic?: boolean; sendMessageOptions?: { sendAnalytics?: { duration: number; queueSize: number; }; }; channelId?: string; mc5mrLocalPreview?: boolean; }) {
            const owner = UserStore.getCurrentUser()?.id;
            const destination = message?.channel_id ?? message?.channelId ?? channelId;
            if (!running || optimistic && !sendMessageOptions?.sendAnalytics || mc5mrLocalPreview || !owner || !message || message.author?.id !== owner || !destination || destination !== armedChannel || !/^\d{17,20}$/.test(message.id)) return;
            schedule(message.id, destination, owner);
        }
    }
});
