/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserAreaButton } from "@api/UserArea";
import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import type { VoiceState } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, PermissionsBits, PermissionStore, React, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";

const actions = findByPropsLazy("selectVoiceChannel") as { selectVoiceChannel(id: string): void | Promise<void>; };
const listeners = new Set<() => void>();
let locked: string | null = null;
let pending: ReturnType<typeof setTimeout> | undefined;
let attempts: number[] = [];
let running = false;

function publish() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function LockIcon({ className }: { className?: string; }) {
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m5.6 5.6 12.8 12.8" stroke="currentColor" strokeWidth="2" /></svg>;
}

function stopLock() {
    locked = null;
    attempts = [];
    if (pending) clearTimeout(pending);
    pending = undefined;
    publish();
}

function toggle() {
    if (locked) return stopLock();
    const me = UserStore.getCurrentUser();
    locked = me ? VoiceStateStore.getVoiceStateForUser(me.id)?.channelId ?? null : null;
    if (locked) {
        const follow = Vencord.Plugins.plugins.FollowList;
        if (follow && "pauseFollow" in follow && typeof follow.pauseFollow === "function") follow.pauseFollow();
    }
    if (!locked) showToast("ادخل روم صوت أولًا.", Toasts.Type.FAILURE);
    publish();
}

function LockButton() {
    const channelId = React.useSyncExternalStore(subscribe, () => locked);
    return <UserAreaButton className="vc-nc-user-button" icon={<LockIcon />} tooltipText={channelId ? "إلغاء تثبيت الروم" : "تثبيت الروم الحالي"} aria-checked={!!channelId} role="switch" onClick={toggle} />;
}

async function returnToRoom() {
    pending = undefined;
    const me = UserStore.getCurrentUser();
    const destination = locked ? ChannelStore.getChannel(locked) : undefined;
    const current = me ? VoiceStateStore.getVoiceStateForUser(me.id)?.channelId : null;
    if (!running || !locked || current === locked) return;
    if (!destination || (destination.guild_id && (!PermissionStore.can(PermissionsBits.CONNECT, destination) || !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, destination)))) return stopLock();
    attempts = attempts.filter(time => Date.now() - time < 60_000);
    if (attempts.length >= 3) { stopLock(); showToast("توقف التثبيت بعد تغييرات متكررة.", Toasts.Type.FAILURE); return; }
    attempts.push(Date.now());
    try { await actions.selectVoiceChannel(locked); }
    catch { stopLock(); showToast("تعذر الرجوع للروم.", Toasts.Type.FAILURE); }
}

export default definePlugin({
    name: "VoiceLock",
    description: "Pin your current voice room and try to return after disconnection or a move.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Utility", "Voice"],
    userAreaButton: { priority: -20, icon: LockIcon, render: LockButton },
    stopRoomLock: stopLock,
    settingsAboutComponent: () => <Panel><p>يحاول العودة للروم بعد الفصل أو النقل، ويتوقف إذا فقدت صلاحية الدخول أو تكررت المحاولات. تفعيل التثبيت يوقف الفولو مؤقتًا؛ بدء الفولو يلغي التثبيت.</p><Button onClick={toggle}>تفعيل / إلغاء تثبيت الروم</Button></Panel>,
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!locked) return;
            const mine = voiceStates.find(state => state.userId === UserStore.getCurrentUser()?.id);
            if (!mine) return;
            if (mine.channelId === locked) {
                if (pending) clearTimeout(pending);
                pending = undefined;
            } else if (!pending) pending = setTimeout(() => void returnToRoom(), mine.channelId ? 0 : 250);
        },
        LOGOUT: stopLock
    },
    start() { running = true; },
    stop() { running = false; stopLock(); }
});
