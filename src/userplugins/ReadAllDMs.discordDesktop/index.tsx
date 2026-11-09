/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { DoubleCheckmarkIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, FluxDispatcher, React, ReadStateStore, showToast, Toasts, Tooltip, UserStore, useStateFromStores } from "@webpack/common";

import style from "./styles.css?managed";

function unreadDMs() {
    return Object.values(ChannelStore.getMutablePrivateChannels()).flatMap(channel => {
        if (channel.guild_id || (channel.type !== 1 && channel.type !== 3) || !ReadStateStore.hasUnreadOrMentions(channel.id)) return [];
        const messageId = ReadStateStore.lastMessageId(channel.id);
        return messageId ? [{ channelId: channel.id, messageId, readStateType: 0 }] : [];
    });
}

function ReadAllDMsButton() {
    const count = useStateFromStores([ChannelStore, ReadStateStore], () => unreadDMs().length);
    const [busy, setBusy] = React.useState(false);
    const pending = React.useRef(false);
    return <Tooltip text={count ? `قراءة الكل: ${count} محادثة خاصة وقروب` : "كل رسائل الخاص مقروءة"}>
        {props => <Button {...props} size="xs" variant="secondary" className="vc-mc5mr-read-dms" disabled={busy || count === 0} aria-label="قراءة كل رسائل الخاص والقروبات" onClick={async event => {
            event.stopPropagation();
            if (pending.current || !UserStore.getCurrentUser()) return;
            const channels = unreadDMs();
            if (!channels.length) return;
            pending.current = true;
            setBusy(true);
            try {
                await FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
            } catch {
                showToast("تعذر تعليم رسائل الخاص كمقروءة. جرّب مرة ثانية.", Toasts.Type.FAILURE);
            } finally { pending.current = false; setBusy(false); }
        }}><DoubleCheckmarkIcon width={16} height={16} /></Button>}
    </Tooltip>;
}

const SafeReadAllDMsButton = ErrorBoundary.wrap(ReadAllDMsButton, { noop: true });

export default definePlugin({
    name: "ReadAllDMs",
    description: "Mark all unread direct messages and group chats as read with one button.",
    authors: [Devs.Mc5mr],
    tags: ["Notifications", "Shortcuts"],
    enabledByDefault: true,
    managedStyle: style,
    headerBarButton: { icon: DoubleCheckmarkIcon, priority: -1000, render: () => <SafeReadAllDMsButton /> },
    renderReadAllDMsButton: SafeReadAllDMsButton
});
