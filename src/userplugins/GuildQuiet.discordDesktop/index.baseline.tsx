/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { sleep } from "@utils/misc";
import definePlugin from "@utils/types";
import type { Guild } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, GuildStore, lodash, Menu, ReadStateUtils, showToast, Toasts, UserStore } from "@webpack/common";
import type { DebouncedFunc } from "lodash";

const { updateGuildNotificationSettings } = findByPropsLazy("updateGuildNotificationSettings");
const settings = definePluginSettings({}).withPrivateSettings<{ enabledAccounts?: string[]; }>();
const pending = new Set<string>();
let readPending: DebouncedFunc<() => void> | undefined;
let generation = 0;
let busy = false;

function isEnabled() {
    const user = UserStore.getCurrentUser();
    return !!user && !!settings.store.enabledAccounts?.includes(user.id);
}

function queueRead(channelId: string) {
    if (!readPending || !isEnabled()) return;
    pending.add(channelId);
    readPending();
}

function readGuild(guildId: string) {
    for (const id of ChannelStore.getChannelIds(guildId)) {
        if (ChannelStore.getChannel(id)?.guild_id === guildId) queueRead(id);
    }
}

function readAll() {
    for (const id of Object.keys(GuildStore.getGuilds())) readGuild(id);
}

async function quietGuild(guildId: string) {
    await updateGuildNotificationSettings(guildId, { muted: true, message_notifications: 2, suppress_everyone: true, suppress_roles: true });
    readGuild(guildId);
}

async function quietAll() {
    if (busy || !readPending || !isEnabled()) return;
    busy = true;
    const epoch = generation;
    try {
        for (const id of Object.keys(GuildStore.getGuilds())) {
            if (epoch !== generation || !isEnabled()) return;
            await quietGuild(id);
            await sleep(500);
        }
        if (epoch === generation && isEnabled()) showToast("تم كتم السيرفرات. الرسائل والمنشنات الجديدة ستُعلّم كمقروءة تلقائيًا.", Toasts.Type.SUCCESS);
    } catch { if (epoch === generation && isEnabled()) showToast("توقف كتم السيرفرات بعد خطأ.", Toasts.Type.FAILURE); }
    finally {
        busy = false;
        if (epoch !== generation && isEnabled()) void quietAll();
    }
}

function toggle() {
    const user = UserStore.getCurrentUser();
    if (!user) return;
    const enabled = isEnabled();
    const accounts = settings.store.enabledAccounts ?? [];
    settings.store.enabledAccounts = enabled ? accounts.filter(id => id !== user.id) : [...accounts, user.id];
    generation++;
    readPending?.cancel();
    pending.clear();
    if (enabled) showToast("تم إيقاف القراءة التلقائية. يبقى كتم السيرفرات حسب إعدادات Discord.", Toasts.Type.SUCCESS);
    else { readAll(); void quietAll(); }
}

const guildContext: NavContextMenuPatchCallback = (children, { guild }: { guild: Guild; }) => {
    if (!guild?.id) return;
    children.push(<Menu.MenuItem key="mc5mr-quiet-all" id="mc5mr-quiet-all" label={isEnabled() ? "Stop Auto Mark as Read" : "Mute All Servers & Mark as Read"} action={toggle} />);
};

export default definePlugin({
    name: "GuildQuiet",
    description: "Mute all servers and keep their messages and mentions marked as read while enabled.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Servers"],
    settings,
    contextMenus: { "guild-context": guildContext },
    flux: {
        MESSAGE_CREATE({ message }) { queueRead(message.channel_id); },
        MESSAGE_UPDATE({ message }) { queueRead(message.channel_id); },
        CONNECTION_OPEN() { generation++; readPending?.cancel(); pending.clear(); readAll(); void quietAll(); },
        GUILD_CREATE({ guild }) {
            if (readPending && isEnabled()) void quietGuild(guild.id).catch(() => showToast("تعذر كتم السيرفر الجديد.", Toasts.Type.FAILURE));
        },
        LOGOUT() { generation++; readPending?.cancel(); pending.clear(); }
    },
    start() {
        readPending = lodash.debounce(() => {
            const ids = [...pending];
            pending.clear();
            if (!isEnabled()) return;
            for (const id of ids) {
                const channel = ChannelStore.getChannel(id);
                if (channel?.guild_id) ReadStateUtils.ackChannel(channel);
            }
        }, 250, { maxWait: 1000 });
        readAll();
        void quietAll();
    },
    stop() { generation++; readPending?.cancel(); readPending = undefined; pending.clear(); }
});

