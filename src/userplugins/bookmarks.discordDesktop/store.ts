/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";
import { IconUtils, UserStore } from "@webpack/common";

const KEY = "Bookmarks_People";

const logger = new Logger("Bookmarks");

const ChannelActions = findByPropsLazy("openPrivateChannel", "ensurePrivateChannel");

/**
 * Open the DM with somebody, making Discord reopen it if it was closed.
 *
 * Asked for the way Discord's own Message buttons ask. The shape of that call has changed
 * between builds: it used to take the person, and now takes a description with the person
 * inside. Handing the old shape to the new function is not an error - it reads as a
 * conversation with nobody in it, and Discord obligingly creates an empty group. So which
 * shape this build wants is read off the function, and if that cannot be told, nothing is
 * opened at all.
 */
export function openDM(userId?: string) {
    if (!userId) return;

    try {
        const actions: any = ChannelActions;
        const source = String(actions.openPrivateChannel);

        if (source.includes("recipientIds")) actions.openPrivateChannel({ recipientIds: [userId] });
        else if (typeof actions.getOrEnsurePrivateChannel === "function") {
            // One or the other, never both. Selecting answers nothing, so chaining the two
            // with ?? would make the old-shape call every time - the empty group above.
            actions.getOrEnsurePrivateChannel(userId)
                .then((channelId: string) => {
                    if (typeof actions.selectPrivateChannel === "function") actions.selectPrivateChannel(channelId);
                    else actions.openPrivateChannel(userId);
                })
                .catch((e: unknown) => logger.error("Could not open the DM", e));
        } else logger.warn("Could not tell how this build opens a DM, so nothing was opened");
    } catch (e) {
        logger.error("Could not open the DM", e);
    }
}

export interface Bookmark {
    id: string;
    /** as they were when bookmarked, for when Discord no longer has them loaded */
    username: string;
    name: string;
    avatar: string | null;
    addedAt: number;
}

let held: Bookmark[] = [];
let loaded = false;

const listeners = new Set<() => void>();

/** Told whenever the list changes, so the page showing it can draw again */
export function onChange(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function changed() {
    set(KEY, held);
    for (const listener of listeners) listener();
}

export async function load() {
    if (loaded) return;
    loaded = true;

    const stored = await get<Bookmark[]>(KEY);
    if (Array.isArray(stored)) held = stored;

    for (const listener of listeners) listener();
}

export const all = () => held;
export const count = () => held.length;
export const isBookmarked = (id?: string | null) => !!id && held.some(one => one.id === id);

/**
 * Remember somebody, along with enough to show them by.
 *
 * Closing a conversation is the point of bookmarking it, and once it is closed Discord may
 * stop keeping that person in memory. Their name and picture are written down here so the
 * list still reads as people rather than as numbers.
 */
export function add(user: any) {
    if (!user?.id || isBookmarked(user.id)) return;

    held = [...held, {
        id: user.id,
        username: user.username ?? "unknown",
        name: user.globalName ?? user.username ?? "Unknown user",
        avatar: user.avatar ?? null,
        addedAt: Date.now()
    }];
    changed();
}

export function remove(id: string) {
    if (!isBookmarked(id)) return;

    held = held.filter(one => one.id !== id);
    changed();
}

/**
 * Somebody on the list as they are now, falling back to how they were when bookmarked.
 *
 * What was written down is brought up to date whenever Discord does have them, so a changed
 * name or picture does not stay stale for ever.
 */
export function describe(bookmark: Bookmark): { name: string; username: string; image: string; } {
    const user: any = UserStore.getUser(bookmark.id);

    if (user) {
        return {
            name: user.globalName ?? user.username,
            username: user.username,
            image: user.getAvatarURL?.(undefined, 80) ?? ""
        };
    }

    let image = "";
    try {
        image = IconUtils.getUserAvatarURL({ id: bookmark.id, avatar: bookmark.avatar } as any, false, 80) ?? "";
    } catch { /* drawn with no picture, which is still a row */ }

    return { name: bookmark.name, username: bookmark.username, image };
}
