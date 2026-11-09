/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import definePlugin, { OptionType } from "@utils/types";
import { ApplicationStreamingStore, React, UserStore } from "@webpack/common";

import style from "./styles.css?managed";

const settings = definePluginSettings({
    automatic: { type: OptionType.BOOLEAN, description: "Mask chat when you begin sharing your screen.", default: false }
});
let running = false;
let active = false;
let automaticMask = false;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function getActive() { return active; }
function apply() { if (running && active) enableStyle(style); else disableStyle(style); }
function setActive(value: boolean, automatic = false) {
    automaticMask = automatic;
    active = value;
    apply();
    listeners.forEach(listener => listener());
}
function toggle() { if (running) setActive(!active); }
function Icon({ className, active = false }: { className?: string; active?: boolean; }) {
    return <svg className={`vc-nc-composer-icon ${className ?? ""}`} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={active ? { color: "var(--status-danger, #ed4245)" } : undefined}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />{active && <path d="m3 3 18 18" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />}</svg>;
}
function MaskButton({ isMainChat }: { isMainChat: boolean; }) {
    const masked = React.useSyncExternalStore(subscribe, getActive);
    return isMainChat ? <ChatBarButton tooltip={`StreamProof : ${masked ? "ON — click to disable" : "OFF — click to enable"}`} onClick={toggle}><Icon active={masked} /></ChatBarButton> : null;
}
function ownStream(event: { streamKey?: string; stream?: { streamKey?: string; }; }) {
    const owner = UserStore.getCurrentUser()?.id;
    const key = event.streamKey ?? event.stream?.streamKey;
    return !!owner && typeof key === "string" && key.endsWith(`:${owner}`);
}
export default definePlugin({
    name: "StreamProof",
    description: "Blur message text, images, videos and stickers with a chat bar toggle, preserving names, avatars and audio controls.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Privacy", "Appearance"],
    settings,
    chatBarButton: { icon: Icon, render: MaskButton },
    settingsAboutComponent: () => <p dir="rtl">زر العين بجانب كتابة الرسالة يطمس النص والصور والفيديوهات والملصقات وصور معاينات الروابط داخل الرسائل. تبقى أسماء المرسلين وصور حساباتهم وأزرار الصوت واضحة. تستطيع تفعيل الوضع التلقائي للشير من الخيار أعلاه.</p>,
    start() { running = true; setActive(settings.store.automatic && !!ApplicationStreamingStore.getCurrentUserActiveStream?.(), true); },
    stop() { running = false; setActive(false); },
    flux: {
        CONNECTION_OPEN() { apply(); },
        CHANNEL_SELECT() { apply(); },
        STREAM_CREATE(event: { streamKey?: string; stream?: { streamKey?: string; }; }) { if (settings.store.automatic && !active && ownStream(event)) setActive(true, true); },
        STREAM_DELETE(event: { streamKey?: string; stream?: { streamKey?: string; }; }) { if (automaticMask && ownStream(event)) setActive(false); },
        STREAM_CLOSE(event: { streamKey?: string; stream?: { streamKey?: string; }; }) { if (automaticMask && ownStream(event)) setActive(false); },
        LOGOUT() { setActive(false); }
    }
});
