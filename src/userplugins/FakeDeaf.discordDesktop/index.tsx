/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";

import { ModeButton, ModeIcon, setMode } from "../FakeVoiceCore.discordDesktop";
import { Panel } from "../NightcordUI.discordDesktop/ui";

function Icon({ className }: { className?: string; }) { return <ModeIcon mode="deaf" className={className} />; }

export default definePlugin({
    name: "FakeDeaf",
    description: "Advertise a self voice state without changing local media. Server moderation still applies.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI", "FakeVoiceCore"],
    tags: ["Voice"],
    userAreaButton: { icon: Icon, render: () => <ModeButton mode="deaf" label="فيك دفن" /> },
    settingsAboutComponent: () => <Panel><p>الزر أسفل اليسار. يغير حالة حسابك الذاتية المعلنة فقط؛ لا يتجاوز ميوت أو دفن السيرفر، ولا يغير المايك أو الاستماع الحقيقي. الحالات تُمسح عند فصل الصوت أو تسجيل الخروج.</p><Button onClick={() => setMode("deaf", true)}>تشغيل فيك دفن</Button><Button onClick={() => setMode("deaf", false)}>إيقاف</Button></Panel>,
    stop() { setMode("deaf", false); }
});
