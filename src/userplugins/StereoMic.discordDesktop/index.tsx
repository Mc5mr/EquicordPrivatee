/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import { React, UserStore, VoiceStateStore } from "@webpack/common";

import { applyAudio, defaults, removeAudio } from "./audio";
let running = false;
let pending: ReturnType<typeof setTimeout> | undefined;
let status = "انتظار دخول روم صوت أو تطبيق الطلب يدويًا.";
const listeners = new Set<() => void>();
function publish(value: string) { status = value; listeners.forEach(listener => listener()); }
function restore() { if (pending) clearTimeout(pending); pending = undefined; try { removeAudio("stereo"); publish("تمت استعادة الصوت."); } catch (error) { publish(String(error)); } }
function activate() {
    if (!running) return;
    try { publish(applyAudio("stereo", { ...defaults, channelsEnabled: true, sampleEnabled: true })); }
    catch (error) { publish(String(error)); }
}
function schedule() {
    if (pending) clearTimeout(pending);
    const owner = UserStore.getCurrentUser()?.id;
    if (!running || !owner || !VoiceStateStore.getVoiceStateForUser(owner)?.channelId) return;
    pending = setTimeout(() => { pending = undefined; if (owner === UserStore.getCurrentUser()?.id) activate(); }, 300);
}
function About() {
    const value = React.useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => status);
    return <div><p>ستيريو تجريبي: يحتاج مصدر صوت ستيريو ودعم محرك الصوت. عطّل Krisp وEcho Cancellation من إعدادات الصوت ثم أعد دخول الروم. لا يحذف ملفات Discord.</p><p role="status">{value}</p><Button onClick={activate}>طلب ستيريو · 48 kHz</Button><Button variant="secondary" onClick={restore}>استعادة الصوت</Button></div>;
}
export default definePlugin({
    name: "StereoMic", description: "Experimental, reversible two-channel microphone encoder request. Requires a stereo input and native support.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }], tags: ["Voice"],
    settingsAboutComponent: About,
    start() { running = true; try { schedule(); } catch (error) { publish(String(error)); } }, stop() { running = false; restore(); },
    flux: { VOICE_STATE_UPDATES: schedule, LOGOUT: restore, CONNECTION_OPEN() { restore(); schedule(); } }
});

