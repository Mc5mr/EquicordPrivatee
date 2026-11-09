/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import type { MessageDecorationProps } from "@api/MessageDecorations";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import style from "./styles.css?managed";

const settings = definePluginSettings({
    relative: { type: OptionType.BOOLEAN, description: "إظهار عمر الرسالة بجانب الاسم مع الوقت الكامل عند تمرير المؤشر.", default: true },
});
const keys = ["relative"] satisfies (keyof typeof settings.store)[];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let timer: ReturnType<typeof setTimeout> | undefined;
let active = false;
let formatter: Intl.RelativeTimeFormat | undefined;

export function relativeAge(timestamp: number, now: number) {
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    const format = formatter ??= new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
    if (minutes < 60) return format.format(-minutes, "minute");
    if (minutes < 1440) return format.format(-Math.floor(minutes / 60), "hour");
    return format.format(-Math.floor(minutes / 1440), "day");
}

function Timestamp({ message }: MessageDecorationProps) {
    const { relative } = settings.use(keys);
    const now = React.useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 60_000)) * 60_000;
    const timestamp = Number(message.timestamp);
    const full = React.useMemo(() => Number.isFinite(timestamp) ? { iso: new Date(timestamp).toISOString(), title: new Date(timestamp).toLocaleString() } : null, [timestamp]);
    if (!relative || !Number.isFinite(timestamp)) return null;
    return <time className="vc-mc5mr-message-age" dateTime={full?.iso} title={full?.title}>{relativeAge(timestamp, now)}</time>;
}

function tick() {
    if (!active) return;
    listeners.forEach(listener => listener());
    timer = setTimeout(tick, 60_000);
}

const SafeTimestamp = ErrorBoundary.wrap(Timestamp, { noop: true });

export default definePlugin({
    name: "MessageTimestamps",
    description: "Shows live relative message ages with the complete timestamp on hover.",
    authors: [Devs.fagner],
    enabledByDefault: true,
    settings,
    managedStyle: style,
    renderMessageDecoration: props => <SafeTimestamp {...props} />,
    start() { active = true; tick(); },
    stop() { active = false; clearTimeout(timer); timer = undefined; listeners.clear(); }
});
