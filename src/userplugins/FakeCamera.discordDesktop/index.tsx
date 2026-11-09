/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import { React, SelectedChannelStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { ModeButton, ModeIcon, setMode } from "../FakeVoiceCore.discordDesktop";
import { Panel } from "../NightcordUI.discordDesktop/ui";

function Icon({ className }: { className?: string; }) { return <ModeIcon mode="camera" className={className} />; }

function checkCamera() {
    const channelId = SelectedChannelStore.getVoiceChannelId();
    const owner = UserStore.getCurrentUser()?.id;
    const state = channelId && owner ? Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId)).find(state => state.userId === owner) : undefined;
    showToast(!state?.channelId ? "ادخل روم صوت أولًا." : state.selfVideo ? "Discord يعرض علامة الكاميرا في حالة حسابك. تحقق من ظهورها عند صديقك." : "حالة Discord لا تعرض الكاميرا؛ إرسال العلامة وحده لم يعمل في جلستك. لا يوجد فيديو مرسل.", state?.selfVideo ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
}

export default definePlugin({
    name: "FakeCamera",
    description: "Advertise a self voice state without changing local media. Server moderation still applies.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI", "FakeVoiceCore"],
    tags: ["Voice"],
    userAreaButton: { icon: Icon, render: () => <ModeButton mode="camera" label="فيك كاميرا" /> },
    settingsAboutComponent: () => <Panel><p>يرسل طلب علامة الكاميرا فقط؛ لا يشغّل جهاز التصوير ولا يرسل فيديو. قد لا يقبل Discord العلامة دون مصدر فيديو. الحالات تُمسح عند فصل الصوت أو تسجيل الخروج.</p><Button onClick={() => setMode("camera", true)}>طلب علامة الكاميرا</Button><Button onClick={() => setMode("camera", false)}>إيقاف</Button><Button variant="secondary" onClick={checkCamera}>فحص حالة Discord</Button></Panel>,
    stop() { setMode("camera", false); }
});
