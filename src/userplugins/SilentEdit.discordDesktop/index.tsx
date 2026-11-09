/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PencilIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, MessageActions, React, showToast, Toasts, UserStore } from "@webpack/common";

import { describeFailure, replaceMessage } from "../SilentMessageCore.discordDesktop";

let running = false;
let generation = 0;
let editing: Message | undefined;

function EditButtonIcon(props: React.ComponentProps<typeof PencilIcon>) {
    return <PencilIcon {...props} color="var(--text-feedback-critical)" />;
}

export default definePlugin({
    name: "SilentEdit",
    description: "Replace your own text message using the nonce technique, then delete the original. Logger bypass is not guaranteed.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "Aurick", id: 1348025017233047634n }],
    dependencies: ["SilentMessageCore"],
    tags: ["Chat"],
    messagePopoverButton: {
        icon: EditButtonIcon,
        render(message) {
            if (message.author.id !== UserStore.getCurrentUser()?.id || message.deleted) return null;
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return null;
            return {
                label: "Silent Edit", icon: EditButtonIcon, message, channel,
                onClick: () => {
                    if (!running) return;
                    editing = message;
                    MessageActions.startEditMessage(message.channel_id, message.id, message.content);
                }
            };
        }
    },
    async onBeforeMessageEdit(channelId, messageId, message) {
        const original = editing;
        if (!running || original?.channel_id !== channelId || original.id !== messageId) return;
        const epoch = generation;
        try {
            if (message.content !== original.content)
                await replaceMessage(original, message.content, false, () => running && epoch === generation && editing === original);
            if (running && epoch === generation && editing === original) {
                editing = undefined;
                MessageActions.endEditMessage(channelId);
            }
        } catch (error) {
            showToast(describeFailure(error), Toasts.Type.FAILURE);
        }
        return { cancel: true };
    },
    settingsAboutComponent: () => <p dir="rtl">مرر الماوس على رسالتك واضغط القلم الأحمر. يفتح تعديل Discord المعتاد؛ اضغط Enter لحفظ النص البديل. يدعم النص فقط، والنسخ المسجلة عند الآخرين قد تبقى. التعديلات من القلم العادي تبقى عادية.</p>,
    start() { running = true; generation++; },
    stop() { running = false; generation++; editing = undefined; },
    flux: {
        MESSAGE_START_EDIT({ channelId, messageId }: { channelId: string; messageId: string; }) {
            if (editing && (editing.channel_id !== channelId || editing.id !== messageId)) editing = undefined;
        },
        MESSAGE_END_EDIT({ channelId }: { channelId: string; }) {
            if (editing?.channel_id === channelId) editing = undefined;
        },
        LOGOUT() { generation++; editing = undefined; }
    }
});
