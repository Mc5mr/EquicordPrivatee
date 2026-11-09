/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { TrashIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, React, showToast, Toasts, UserStore } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";
import { describeFailure, replaceMessage } from "../SilentMessageCore.discordDesktop";

let running = false;
let generation = 0;

async function remove(message: Message) {
    const owner = UserStore.getCurrentUser()?.id;
    const epoch = generation;
    if (!running || message.author.id !== owner) return;
    try { await replaceMessage(message, "** **", true, () => running && epoch === generation); showToast("تم حذف الرسالة الأصلية والمؤقتة.", Toasts.Type.SUCCESS); }
    catch (error) { showToast(describeFailure(error), Toasts.Type.FAILURE); }
}

function DeleteButtonIcon(props: React.ComponentProps<typeof TrashIcon>) {
    return <TrashIcon {...props} color="var(--text-feedback-critical)" />;
}

export default definePlugin({
    name: "SilentDelete",
    description: "Delete your own text message using a temporary nonce replacement. Previously recorded copies cannot be guaranteed removed.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "Aurick", id: 1348025017233047634n }, { name: "appleflyer", id: 1209096766075703368n }],
    dependencies: ["SilentMessageCore", "NightcordUI"],
    tags: ["Chat"],
    messagePopoverButton: {
        icon: DeleteButtonIcon,
        render(message) {
            if (message.author.id !== UserStore.getCurrentUser()?.id || message.deleted) return null;
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return null;
            return { label: "Silent Delete", icon: DeleteButtonIcon, message, channel, onClick: () => void remove(message) };
        }
    },
    settingsAboutComponent: () => <Panel><p>مرر الماوس على رسالتك واضغط السلة الحمراء للحذف مباشرة. يدعم النص فقط؛ النسخ التي حفظها الآخرون قد تبقى في اللوق.</p></Panel>,
    start() { running = true; generation++; },
    stop() { running = false; generation++; },
    flux: { LOGOUT() { generation++; } }
});
