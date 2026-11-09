/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { fetchUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu, showToast, Toasts, UserStore } from "@webpack/common";

import { apply, capture, reset, snapshot } from "../LocalProfileCore.discordDesktop";
let generation = 0;
export default definePlugin({
    name: "CopyProfile",
    description: "Display a visible profile's appearance in your native account views locally.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["LocalProfileCore", "NightcordUI"],
    tags: ["Appearance"],
    contextMenus: { "user-context"(children, { user, guildId }: { user: User; guildId?: string; }) {
        if (!user || user.id === UserStore.getCurrentUser()?.id) return;
        const copied = snapshot()?.source === user.id;
        children.push(<Menu.MenuItem id="mc5mr-copy-profile" label={copied ? "Remove copy profile" : "Copy this profile"} action={async () => {
            const epoch = ++generation;
            if (copied) reset(); else {
                try {
                    const owner = UserStore.getCurrentUser()?.id;
                    const cached = capture(user, guildId);
                    if (cached) apply(cached, "copy");
                    await fetchUserProfile(user.id, guildId ? { guild_id: guildId } : undefined, false);
                    if (epoch !== generation || !owner || owner !== UserStore.getCurrentUser()?.id) return;
                    const value = capture(UserStore.getUser(user.id) ?? user, guildId); if (value) apply(value, "copy");
                }
                catch { if (epoch === generation) showToast("ظهرت البيانات المحفوظة؛ تعذر تحديث تفاصيل البروفايل.", Toasts.Type.FAILURE); }
            }
        }} />);
    } },
    settingsAboutComponent: () => <Button onClick={() => { generation++; reset(); }}>Restore my appearance</Button>,
    flux: { LOGOUT() { generation++; }, CONNECTION_OPEN() { generation++; } },
    stop() { generation++; reset("copy"); }
});
