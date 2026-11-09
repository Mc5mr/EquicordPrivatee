/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import type { VoiceState } from "@vencord/discord-types";
import { ChannelStore, Constants, FluxDispatcher, PermissionStore, PermissionsBits, React, RestAPI, SelectedChannelStore, showToast, Toasts, UserStore, useStateFromStores, VoiceStateStore } from "@webpack/common";

const settings = definePluginSettings({
    removeMute: { type: OptionType.BOOLEAN, description: "فك ميوت السيرفر عن حسابك تلقائيًا إذا عندك الصلاحية.", default: true, onChange: () => { attempted = ""; queueCheck(); } },
    removeDeafen: { type: OptionType.BOOLEAN, description: "فك دفن السيرفر عن حسابك تلقائيًا إذا عندك الصلاحية.", default: true, onChange: () => { attempted = ""; queueCheck(); } }
});
const KEYS: (keyof typeof settings.store)[] = ["removeMute", "removeDeafen"];
let running = false;
let generation = 0;
let pending: ReturnType<typeof setTimeout> | undefined;
let working = false;
let queued = false;
let lastKey = "";
let attempted = "";
let lastCorrection: { mute?: false; deaf?: false; } = {};
let retries = 0;
let cooldown = 0;

function reset() {
    generation++;
    if (pending) clearTimeout(pending);
    pending = undefined;
    queued = false;
    lastKey = attempted = "";
    lastCorrection = {};
    retries = cooldown = 0;
}

function retryDelay(error: unknown) {
    if (!error || typeof error !== "object" || !("status" in error) || error.status !== 429) return null;
    let seconds = 1;
    if ("body" in error && error.body && typeof error.body === "object" && "retry_after" in error.body && typeof error.body.retry_after === "number") seconds = error.body.retry_after;
    return Number.isFinite(seconds) && seconds >= 0 && seconds <= 3600 ? Math.max(1000, Math.ceil(seconds * 1000)) : null;
}

function queueCheck() {
    if (!running || pending) return;
    const epoch = generation;
    pending = setTimeout(() => {
        pending = undefined;
        if (running && epoch === generation) void check();
    }, Math.max(100, cooldown - Date.now()));
}

function currentVoice(owner: string) {
    const channelId = SelectedChannelStore.getVoiceChannelId();
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
    const state = channel?.guild_id ? VoiceStateStore.getVoiceState(channel.guild_id, owner) : undefined;
    return { channel, state };
}

async function check() {
    if (!running) return;
    if (working) { queued = true; return; }
    if (Date.now() < cooldown) { queueCheck(); return; }
    const owner = UserStore.getCurrentUser()?.id;
    const { channel, state } = owner ? currentVoice(owner) : {};
    if (!owner || !state || !channel?.guild_id || state.channelId !== channel.id) { lastKey = attempted = ""; retries = 0; return; }
    const body: { mute?: false; deaf?: false; } = {};
    if (settings.store.removeMute && state.mute && PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) body.mute = false;
    if (settings.store.removeDeafen && state.deaf && PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel)) body.deaf = false;
    if (!Object.keys(body).length) { lastKey = attempted = ""; retries = 0; return; }
    const key = `${owner}:${channel.guild_id}:${channel.id}:${body.mute === false}:${body.deaf === false}`;
    if (key === attempted) return;
    if (key !== lastKey) { lastKey = key; retries = 0; }
    attempted = key;
    lastCorrection = body;
    cooldown = Date.now() + 1000;
    const epoch = generation;
    working = true;
    try {
        const request = { url: Constants.Endpoints.GUILD_MEMBER(channel.guild_id, owner), body, rejectWithError: true };
        await RestAPI.patch(request);
    } catch (error) {
        if (!running || epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return;
        const delay = retryDelay(error);
        if (delay !== null && retries < 2) {
            retries++;
            cooldown = Date.now() + delay;
            attempted = "";
            queued = true;
        } else showToast("تعذر فك ميوت أو دفن السيرفر. تأكد من صلاحياتك؛ أوقف AutoUnmute وشغّله للمحاولة مجددًا.", Toasts.Type.FAILURE);
    } finally {
        working = false;
        if (queued) { queued = false; queueCheck(); }
    }
}

function About() {
    const options = settings.use(KEYS);
    const status = useStateFromStores([UserStore, VoiceStateStore, ChannelStore, SelectedChannelStore, PermissionStore], () => {
        const owner = UserStore.getCurrentUser()?.id;
        const { channel } = owner ? currentVoice(owner) : {};
        if (!running) return "البلوقن متوقف. شغّله من قائمة البلوقنات لتفعيل الحماية.";
        if (!channel?.guild_id) return "تظهر الصلاحيات لما تدخل روم صوت في سيرفر.";
        return `فك الميوت: ${!options.removeMute ? "معطّل" : PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel) ? "متاح" : "الصلاحية غير متوفرة"}. فك الدفن: ${!options.removeDeafen ? "معطّل" : PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel) ? "متاح" : "الصلاحية غير متوفرة"}.`;
    }, [options.removeMute, options.removeDeafen]);
    return <div dir="rtl"><p>يفك ميوت السيرفر والدفن عن حسابك عند إعطائهما لك، حسب صلاحياتك في الروم. ميوت ودفن نفسك يبقيان باختيارك.</p><p role="status">{status}</p></div>;
}

export default definePlugin({
    name: "AutoUnmute",
    description: "Automatically remove server mute and deafen from your account where you have the required permissions.",
    authors: [Devs.Mc5mr],
    tags: ["Voice", "Utility"],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: About,
    start() { running = true; reset(); FluxDispatcher.wait(queueCheck); },
    stop() { running = false; reset(); },
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const owner = UserStore.getCurrentUser()?.id;
            const state = owner ? voiceStates.find(state => state.userId === owner) : undefined;
            if (!state) return;
            if ((lastCorrection.mute === false && state.mute === false) || (lastCorrection.deaf === false && state.deaf === false)) {
                attempted = "";
                lastCorrection = {};
            }
            FluxDispatcher.wait(queueCheck);
        },
        VOICE_CHANNEL_SELECT() { FluxDispatcher.wait(queueCheck); },
        GUILD_MEMBER_UPDATE({ user }: { user?: { id: string; }; }) {
            if (user?.id === UserStore.getCurrentUser()?.id) { attempted = ""; FluxDispatcher.wait(queueCheck); }
        },
        GUILD_ROLE_UPDATE() { attempted = ""; FluxDispatcher.wait(queueCheck); },
        CONNECTION_OPEN() { reset(); FluxDispatcher.wait(queueCheck); },
        LOGOUT: reset
    }
});
