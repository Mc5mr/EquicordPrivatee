/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openUserProfile } from "@utils/discord";
import { useEffect, useState } from "@webpack/common";

import { BookmarkIcon, ChatIcon, CloseIcon } from "./icons";
import { all, count, describe, load, onChange, openDM, remove } from "./store";
import { cl,Empty, Panel, RoundButton, Row, Rows } from "./ui";

/** From this many on, the list gets a search box */
const SEARCH_FROM = 8;

/**
 * Everybody bookmarked, in the plugin's settings.
 *
 * The Bookmarked tab is the main way to see them, but it is not there while the plugin is
 * off or the screen is shared - and this is where you look for it when it is not. Each row
 * works like the tab: the person opens their profile, the buttons message or forget them.
 */
export function BookmarkList() {
    const [, redraw] = useState(0);
    const [query, setQuery] = useState("");

    useEffect(() => {
        const stop = onChange(() => redraw(n => n + 1));
        // Read here too, so the list is right even while the plugin is switched off.
        load();
        return stop;
    }, []);

    const wanted = query.trim().toLowerCase();
    const people = all()
        .map(bookmark => ({ bookmark, ...describe(bookmark) }))
        .filter(one => !wanted || one.name.toLowerCase().includes(wanted) || one.username.toLowerCase().includes(wanted))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <Panel title="Bookmarked people" count={count()}>
            {count() >= SEARCH_FROM && (
                <input
                    className={cl("search")}
                    placeholder="Search bookmarks"
                    aria-label="Search bookmarks"
                    spellCheck={false}
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                />
            )}

            {!count() && (
                <Empty
                    icon={BookmarkIcon}
                    title="Nobody bookmarked yet"
                    text="Right-click someone, or open the ... menu on their profile, and choose Bookmark."
                />
            )}

            {!!count() && !people.length && <div className={cl("none-found")}>Nobody matches “{query.trim()}”</div>}

            {!!people.length && (
                <Rows>
                    {people.map(({ bookmark, name, username, image }) => (
                        <Row
                            key={bookmark.id}
                            image={image}
                            name={name}
                            detail={username}
                            title={`Open ${name}'s profile`}
                            onClick={() => openUserProfile(bookmark.id)}
                        >
                            <RoundButton icon={ChatIcon} label="Message" onClick={() => openDM(bookmark.id)} />
                            <RoundButton icon={CloseIcon} label="Remove Bookmark" danger onClick={() => remove(bookmark.id)} />
                        </Row>
                    ))}
                </Rows>
            )}
        </Panel>
    );
}
