/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * The Bookmarked tab, drawn by Discord's own Friends list.
 *
 * The list asks its rows object for the rows of the tab that is open. For ours it is answered
 * here instead, with one row per bookmark in the very shape Discord gives a friend - so the
 * rows, the search box, the count, the scroller, the right-click menu and the empty picture
 * are all Discord's, the same as on All and Pending.
 */

import { PresenceStore, React, RelationshipStore, UserStore, useStateFromStores } from "@webpack/common";

import { all, Bookmark, onChange } from "./store";

/** A bookmarked person Discord has not loaded: a user made from what was written down about them */
function userOf(bookmark: Bookmark): any {
    const known = UserStore.getUser(bookmark.id);
    if (known) return known;

    const User: any = UserStore.getCurrentUser()?.constructor;
    if (!User) return null;

    return new User({
        id: bookmark.id,
        username: bookmark.username,
        global_name: bookmark.name !== bookmark.username ? bookmark.name : null,
        avatar: bookmark.avatar,
        discriminator: "0"
    });
}

function rowOf(bookmark: Bookmark) {
    const user = userOf(bookmark);
    if (!user) return null;

    const presence: any = PresenceStore;
    return {
        key: bookmark.id,
        userId: bookmark.id,
        type: RelationshipStore.getRelationshipType?.(bookmark.id) ?? 0,
        status: presence.getStatus(bookmark.id) ?? "offline",
        isMobile: !!presence.isMobileOnline?.(bookmark.id),
        isVR: false,
        activities: presence.getActivities?.(bookmark.id) ?? [],
        applicationStream: null,
        user,
        usernameLower: String(user.username ?? "").toLowerCase(),
        mutualGuildsLength: 0,
        mutualGuilds: [],
        nickname: RelationshipStore.getNickname?.(bookmark.id),
        spam: false,
        giftIntentType: undefined,
        ignoredUser: false,
        applicationId: undefined,
        isGameRelationship: false,
        // the row's ... button opens the full menu, as right-clicking it does - see index.tsx
        vcBookmark: true
    };
}

/** The rows for a tab: ours from the bookmarks, every other one as Discord has them */
export function filterRows(rows: any, section: string, query: string, ours: string) {
    if (section !== ours) return rows.filter(section, query);

    const wanted = (query ?? "").trim().toLowerCase();
    return all()
        .map(rowOf)
        .filter((row): row is NonNullable<ReturnType<typeof rowOf>> => !!row)
        .filter(row => !wanted || [row.usernameLower, row.nickname, row.user.globalName].some(name => name?.toLowerCase().includes(wanted)))
        .sort((a, b) => (a.user.globalName ?? a.user.username).localeCompare(b.user.globalName ?? b.user.username));
}

/**
 * A number that changes whenever the rows would: a bookmark added or removed, or anybody's
 * status moving. Read by the list while it draws, so it is a hook like any other there.
 */
export function useVersion() {
    const [version, bump] = React.useState(0);
    React.useEffect(() => onChange(() => bump(n => n + 1)), []);

    const statuses = useStateFromStores([PresenceStore], () => all().map(one => PresenceStore.getStatus(one.id)).join());
    return `${version}:${statuses}`;
}
