/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { UserAreaButton } from "@api/UserArea";
import ErrorBoundary from "@components/ErrorBoundary";
import { CogWheel, Microphone, ScreenshareIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { findCssClassesLazy } from "@webpack";
import { React } from "@webpack/common";

import CustomStreamPreview from "../CustomStreamPreview.discordDesktop";
import FakeCamera from "../FakeCamera.discordDesktop";
import FakeDeaf from "../FakeDeaf.discordDesktop";
import FakeMute from "../FakeMute.discordDesktop";
import FakeMuteDeaf from "../FakeMuteDeaf.discordDesktop";
import { ModeButton } from "../FakeVoiceCore.discordDesktop";
import MicSettings from "../MicSettings.discordDesktop";
import style from "./styles.css?managed";

const cl = classNameFactory("vc-mc5mr-voice-");
const VoiceClasses = findCssClassesLazy("actionButtons", "button", "buttonColor");
const KEYS: Parameters<typeof useSettings>[0] = ["plugins.FakeMute.enabled", "plugins.FakeDeaf.enabled", "plugins.FakeMuteDeaf.enabled", "plugins.FakeCamera.enabled", "plugins.MicSettings.enabled", "plugins.CustomStreamPreview.enabled"];

function SettingsIcon({ stream = false }: { stream?: boolean; }) {
    return <span className={cl("settings-icon")}>
        {stream ? <ScreenshareIcon width={20} height={20} /> : <Microphone width={20} height={20} />}
        <CogWheel className={cl("gear")} width={11} height={11} />
    </span>;
}

function VoiceDock() {
    useSettings(KEYS);
    const mic = isPluginEnabled(MicSettings.name);
    const stream = isPluginEnabled(CustomStreamPreview.name);
    const buttonClass = classes(VoiceClasses.button, VoiceClasses.buttonColor);
    return <div className={classes(cl("dock"), VoiceClasses.actionButtons)} aria-label="أدوات الصوت">
        <UserAreaButton className={classes(cl("cell"), buttonClass)} icon={<SettingsIcon />} aria-label="Microphone Settings" tooltipText={mic ? "إعدادات المايك" : "فعّل MicSettings من الإعدادات"} disabled={!mic} onClick={() => { if (mic) MicSettings.openSettings(); }} />
        <UserAreaButton className={classes(cl("cell"), buttonClass)} icon={<SettingsIcon stream />} aria-label="إعدادات معاينة الشير" tooltipText={stream ? "إعدادات معاينة الشير" : "فعّل CustomStreamPreview من الإعدادات"} disabled={!stream} onClick={() => { if (stream) CustomStreamPreview.openGallery(); }} />
        <ModeButton dock className={buttonClass} mode="mute" label="فيك ميوت" disabled={!isPluginEnabled(FakeMute.name)} />
        <ModeButton dock className={buttonClass} mode="deaf" label="فيك دفن" disabled={!isPluginEnabled(FakeDeaf.name)} />
        <ModeButton dock className={buttonClass} mode="both" label="فيك ميوت ودفن" disabled={!isPluginEnabled(FakeMuteDeaf.name)} />
        <ModeButton dock className={buttonClass} mode="camera" label="فيك كاميرا" disabled={!isPluginEnabled(FakeCamera.name)} />
    </div>;
}

export default definePlugin({
    name: "UserAreaTweaks",
    description: "Arrange six voice tools in two rows above your account controls.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Appearance"],
    managedStyle: style,
    dependencies: ["FakeVoiceCore"],
    userAreaButton: { icon: Microphone, priority: -100, render: () => <ErrorBoundary noop><VoiceDock /></ErrorBoundary> },
    settingsAboutComponent: () => <p dir="rtl">ستة أزرار فوق شريط الحساب، ثلاثة بكل صف. فعّل بلوقن كل أداة لتشغيل زرها. تتبع الألوان ثيمك، وتعطيل هذا التنسيق يعيد أزرار الفيك لمكانها السابق.</p>
});
