/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { UserAreaButton } from "@api/UserArea";
import ErrorBoundary from "@components/ErrorBoundary";
import { Microphone } from "@components/Icons";
import { openMicrophoneSettingsModal } from "@plugins/betterMicrophone.desktop/modals";
import { openScreenshareModal } from "@plugins/betterScreenshare.desktop/modals";
import { MicrophoneSettingsIcon, ScreenshareSettingsIcon } from "@plugins/philsPluginLibrary";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { findCssClassesLazy } from "@webpack";
import { React } from "@webpack/common";

import FakeCamera from "../FakeCamera.discordDesktop";
import FakeDeaf from "../FakeDeaf.discordDesktop";
import FakeMute from "../FakeMute.discordDesktop";
import FakeMuteDeaf from "../FakeMuteDeaf.discordDesktop";
import { ModeButton } from "../FakeVoiceCore.discordDesktop";
import style from "./styles.css?managed";

const cl = classNameFactory("vc-mc5mr-voice-");
const VoiceClasses = findCssClassesLazy("actionButtons", "button", "buttonColor");
const KEYS: Parameters<typeof useSettings>[0] = ["plugins.BetterMicrophone.enabled", "plugins.BetterScreenshare.enabled", "plugins.FakeMute.enabled", "plugins.FakeDeaf.enabled", "plugins.FakeMuteDeaf.enabled", "plugins.FakeCamera.enabled"];

function VoiceDock() {
    useSettings(KEYS);
    const buttonClass = classes(VoiceClasses.button, VoiceClasses.buttonColor);
    return <div className={classes(cl("dock"), VoiceClasses.actionButtons)} aria-label="أدوات الصوت">
        <UserAreaButton className={classes(cl("cell"), buttonClass)} icon={<MicrophoneSettingsIcon />} tooltipText="إعدادات المايك" aria-label="إعدادات المايك" disabled={!isPluginEnabled("BetterMicrophone")} onClick={openMicrophoneSettingsModal} />
        <UserAreaButton className={classes(cl("cell"), buttonClass)} icon={<ScreenshareSettingsIcon />} tooltipText="إعدادات الشير" aria-label="إعدادات الشير" disabled={!isPluginEnabled("BetterScreenshare")} onClick={openScreenshareModal} />
        <ModeButton dock className={buttonClass} mode="mute" label="فيك ميوت" disabled={!isPluginEnabled(FakeMute.name)} />
        <ModeButton dock className={buttonClass} mode="deaf" label="فيك دفن" disabled={!isPluginEnabled(FakeDeaf.name)} />
        <ModeButton dock className={buttonClass} mode="both" label="فيك ميوت ودفن" disabled={!isPluginEnabled(FakeMuteDeaf.name)} />
        <ModeButton dock className={buttonClass} mode="camera" label="فيك كاميرا" disabled={!isPluginEnabled(FakeCamera.name)} />
    </div>;
}

export default definePlugin({
    name: "UserAreaTweaks",
    description: "Arrange voice tools above your account controls.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Appearance"],
    required: true,
    managedStyle: style,
    dependencies: ["FakeVoiceCore"],
    userAreaButton: { icon: Microphone, priority: -100, render: () => <ErrorBoundary noop><VoiceDock /></ErrorBoundary> },
    settingsAboutComponent: () => <p dir="rtl">أزرار الصوت تظهر فوق شريط الحساب. فعّل بلوقن كل أداة لتشغيل زرها.</p>
});
