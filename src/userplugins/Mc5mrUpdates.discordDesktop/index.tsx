/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { React, showToast } from "@webpack/common";

const Native = VencordNative.pluginHelpers.Mc5mrUpdates as PluginNative<typeof import("./native")>;
let timer: ReturnType<typeof setTimeout> | undefined;
let active = false;
let noticeVersion = "";

const settings = definePluginSettings({
    automatic: { type: OptionType.BOOLEAN, description: "تنزيل تحديثات نسخة Mc5mr تلقائيًا وتثبيتها عند التشغيل التالي.", default: true },
});

function Updates() {
    const [message, setMessage] = React.useState("نسخة Mc5mr. لا تحتاج التحديثات حسابًا أو كلمة سر.");
    const [busy, setBusy] = React.useState(false);
    return <div dir="rtl"><p>{message}</p><Button disabled={busy} onClick={async () => {
        setBusy(true);
        try { setMessage((await Native.check(true)).message); }
        finally { setBusy(false); }
    }}>التحقق وتنزيل التحديث</Button><p>يستمر Discord والبلوقنات بالعمل أثناء التنزيل. أغلق Discord بالكامل وافتحه لتثبيت التحديث.</p></div>;
}

async function tick() {
    try {
        if (settings.store.automatic) {
            const result = await Native.check(true);
            if (active && result.state === "ready" && noticeVersion !== result.version) {
                noticeVersion = result.version ?? "";
                showToast(result.message, "success");
            }
        }
    } finally {
        if (active) timer = setTimeout(tick, 30 * 60_000);
    }
}

export default definePlugin({
    name: "Mc5mrUpdates",
    description: "Account-free automatic updates for the Mc5mr edition, applied on the next full restart.",
    authors: [Devs.Mc5mr],
    enabledByDefault: true,
    required: true,
    hidden: true,
    settings,
    settingsAboutComponent: Updates,
    start() { active = true; void tick().catch(() => {}); },
    stop() { active = false; clearTimeout(timer); timer = undefined; }
});
