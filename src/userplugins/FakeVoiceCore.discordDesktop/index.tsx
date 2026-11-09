/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserAreaButton } from "@api/UserArea";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import type { VoiceState } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, MediaEngineStore, React, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

export type Mode = "mute" | "deaf" | "both" | "camera";
type Modes = Record<Mode, boolean>;
interface GatewaySocket { isSessionEstablished(): boolean; send(op: number, data: unknown, ...rest: unknown[]): unknown; }
const gateway = findByPropsLazy("getSocket") as { getSocket(): GatewaySocket | undefined; };
const empty = (): Modes => ({ mute: false, deaf: false, both: false, camera: false });
let modes = empty();
const listeners = new Set<() => void>();
function getModes() { return modes; }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function setModes(value: Modes) { modes = value; listeners.forEach(listener => listener()); }
const cl = classNameFactory("vc-mc5mr-voice-");
let running = false;
let installed: { socket: GatewaySocket; original: GatewaySocket["send"]; wrapper: GatewaySocket["send"]; } | undefined;

function restoreSocket() {
    if (installed && installed.socket.send === installed.wrapper) installed.socket.send = installed.original;
    installed = undefined;
}

export function transformVoice(op: number, data: unknown): unknown {
    if (!running || op !== 4 || !data || typeof data !== "object" || !("channel_id" in data) || typeof data.channel_id !== "string" || !data.channel_id) return data;
    const { mute, deaf, both, camera } = modes;
    return {
        ...data,
        ...((mute || both) ? { self_mute: true } : {}),
        ...((deaf || both) ? { self_deaf: true } : {}),
        ...(camera ? { self_video: true } : {})
    };
}

function installSocket() {
    const socket = gateway.getSocket();
    if (!socket || installed?.socket === socket) return;
    restoreSocket();
    const original = socket.send;
    const wrapper: GatewaySocket["send"] = function (this: GatewaySocket, op, data, ...rest) {
        return original.call(this, op, transformVoice(op, data), ...rest);
    };
    socket.send = wrapper;
    installed = { socket, original, wrapper };
}

function refreshVoice(): boolean {
    const channelId = UserStore.getCurrentUser() ? SelectedChannelStore.getVoiceChannelId() : null;
    if (!channelId) return false;
    installSocket();
    const socket = gateway.getSocket();
    if (!socket?.isSessionEstablished()) return false;
    socket.send(4, {
        guild_id: ChannelStore.getChannel(channelId)?.guild_id ?? null,
        channel_id: channelId,
        self_mute: MediaEngineStore.isMute(),
        self_deaf: MediaEngineStore.isDeaf(),
        self_video: MediaEngineStore.isVideoEnabled()
    });
    return true;
}

export function setMode(mode: Mode, enabled: boolean) {
    const previous = modes;
    if (previous[mode] === enabled) return;
    if (!running) { showToast("فعّل بلوقن الصوت أولًا.", Toasts.Type.FAILURE); return; }
    setModes({ ...previous, [mode]: enabled });
    try {
        if (enabled && !refreshVoice()) {
            setModes(previous);
            showToast("ادخل روم صوت أولًا، وتأكد أن الاتصال جاهز.", Toasts.Type.FAILURE);
        } else if (!enabled) refreshVoice();
    } catch {
        setModes(previous);
        showToast("تعذر إرسال الحالة الصوتية؛ لم يتغير المايك أو الاستماع الحقيقي.", Toasts.Type.FAILURE);
    }
}

export function ModeIcon({ className, mode }: { className?: string; mode: Mode; }) {
    return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {mode === "camera" ? <><rect x="3" y="6" width="13" height="12" rx="2" fill="currentColor" /><path d="m17 10 5-3v10l-5-3Z" fill="currentColor" /></> : mode === "mute" ? <><rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></> : <><path d="M3 14v-3a9 9 0 0 1 18 0v3" stroke="currentColor" strokeWidth={mode === "both" ? "3" : "1.8"} strokeLinecap="round" /><rect x="2" y="12" width="5" height="8" rx="2" fill={mode === "both" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" /><rect x="17" y="12" width="5" height="8" rx="2" fill={mode === "both" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />{mode === "both" && <path d="M19 19v1a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</>}
    </svg>;
}

export function ModeButton({ mode, label, dock = false, disabled = false, className = "" }: { mode: Mode; label: string; dock?: boolean; disabled?: boolean; className?: string; }) {
    const state = React.useSyncExternalStore(subscribe, getModes);
    return <UserAreaButton className={classes(cl(dock ? "cell" : "original", { active: state[mode] }), className)} disabled={disabled} icon={<ModeIcon mode={mode} />} tooltipText={disabled ? `فعّل بلوقن ${label} من الإعدادات` : `${label}: ${state[mode] ? "تشغيل" : "إيقاف"}`} role="switch" aria-label={label} aria-checked={state[mode]} orangeGlow={!dock && state[mode]} onClick={() => { if (!disabled) setMode(mode, !state[mode]); }} />;
}

export default definePlugin({
    name: "FakeVoiceCore",
    description: "Shared session-only self voice flags for the four independent voice buttons.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    hidden: true,
    start() {
        setModes(empty());
        running = true;
        try { installSocket(); } catch { showToast("تعذر العثور على اتصال الصوت؛ الأزرار غير جاهزة.", Toasts.Type.FAILURE); }
    },
    stop() {
        setModes(empty());
        try { refreshVoice(); } catch { showToast("تعذر استعادة الحالة؛ افصل الصوت وأعد الدخول.", Toasts.Type.FAILURE); }
        running = false;
        restoreSocket();
    },
    flux: {
        CONNECTION_OPEN() {
            if (!running) return;
            installSocket();
            if (Object.values(modes).some(Boolean)) refreshVoice();
        },
        LOGOUT() { setModes(empty()); restoreSocket(); },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (voiceStates.some(state => state.userId === UserStore.getCurrentUser()?.id && !state.channelId) && !SelectedChannelStore.getVoiceChannelId()) setModes(empty());
        }
    }
});
