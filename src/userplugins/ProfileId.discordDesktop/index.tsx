/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { CopyIdIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { ui } from "../NightcordUI.discordDesktop/ui";

interface UserContextProps {
    user: User;
}

const userContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user?.id) return;

    children.push(
        <Menu.MenuItem
            id="mc5mr-copy-user-id"
            label="Copy User ID"
            action={() => copyToClipboard(user.id)}
            icon={CopyIdIcon}
            leadingAccessory={{ type: "icon", icon: CopyIdIcon }}
        />
    );
};

export default definePlugin({
    name: "ProfileId",
    description: "Displays a copyable user ID beside profile nicknames and in the user context menu.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Friends"],
    dependencies: ["NicknameIconsAPI", "NightcordUI"],
    renderNicknameIcon({ userId }) {
        return <Button className={ui("profile-id")} size="xs" variant="secondary" title={`Copy User ID: ${userId}`} aria-label={`نسخ الآيدي ${userId}`} onClick={event => {
            event.stopPropagation();
            copyToClipboard(userId);
        }}>{userId}</Button>;
    },
    contextMenus: {
        "user-context": userContext
    }
});
