/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

import { SpeedIcon } from "./icons";
import { About } from "./ui";

const logger = new Logger("Performance");

const settings = definePluginSettings({
    hiddenHistory: {
        type: OptionType.BOOLEAN,
        displayName: "Scroll past blocked messages",
        description: "Keeps chats loading past blocked messages.",
        default: true
    }
});

/** How far one scroll may carry on by itself: 20 pages of 28 is 560 messages */
const PAGES_PER_SCROLL = 20;

let running = false;
let pendingScroll: ReturnType<typeof setTimeout> | undefined;

/**
 * The chat you last scrolled in, and how many more pages it may load without you.
 *
 * Discord loads older messages as you reach the top, then measures how much taller the list
 * got. Under 100 pixels and it decides the load showed nothing new, and waits for you to scroll
 * again. Blocked and ignored messages all fold into one row, so a page of them adds next to
 * nothing - measured: 28 more blocked messages made the list 52 px taller. Discord also keeps
 * only 60 messages loaded, so the row reads "60 blocked messages" however far back it goes.
 * Every scroll quietly pages a little further and nothing on screen changes: it looks stuck.
 *
 * A scroll now carries on by itself, a page at a time, while each page is still all hidden.
 * The moment a page has something to show, Discord takes over as it always does.
 */
let scrolled: { manager: any; channelId: string | undefined; pages: number; } | null = null;

/** Discord's own handler for the wheel, touch, scroll keys and the scrollbar */
function onGesture(manager: any) {
    scrolled = { manager, channelId: manager?.props?.channel?.id, pages: PAGES_PER_SCROLL };
}

/** Asked after a load that made the list under 100 px taller. True keeps loading going */
function keepLoading(manager: any): boolean {
    try {
        if (!running || !settings.store.hiddenHistory || !scrolled) return false;

        const { messages, channel } = manager?.props ?? {};
        // the same scroller is reused from chat to chat, so the chat has to match too
        if (scrolled.manager !== manager || scrolled.channelId !== channel?.id) return false;
        if (scrolled.pages <= 0 || messages?.error) return false;

        scrolled.pages--;
        // Discord's own scroll check decides: it loads only if you are still at the edge, there
        // is more to fetch, and nothing is loading. Run after the update that got us here.
        if (pendingScroll) clearTimeout(pendingScroll);
        pendingScroll = setTimeout(() => {
            pendingScroll = undefined;
            if (running && scrolled && scrolled.manager === manager && scrolled.channelId === manager?.props?.channel?.id) manager.handleScroll?.();
        }, 0);
        return true;
    } catch (e) {
        logger.error("Could not keep loading", e);
        return false;
    }
}

migratePluginSettings("Performance", "Smoother");

export default definePlugin({
    name: "Performance",
    description: "Continues scrolling through pages of blocked or ignored messages.",
    authors: [{ name: "reqon", id: 497562304498368513n }],
    enabledByDefault: false,

    settings,

    settingsAboutComponent: () => (
        <About
            icon={SpeedIcon}
            title="Discord, without the slow and stuck bits"
            note={false}
            steps={[
                <>Scroll up in a chat full of blocked or ignored messages and it keeps loading until there is something to see, instead of sitting on the loading placeholder.</>,
                <>It only ever loads when you scroll, and at most 20 pages for each scroll, so it never runs away with itself.</>
            ]}
        />
    ),

    patches: [
        {
            find: "loadMorePausedUntilUserScroll=this.loadMorePausedUntilUserScroll||",
            replacement: [
                {
                    // after a load: pause unless the list grew 100 px, now unless a scroll is still carrying on
                    match: /(loadMorePausedUntilUserScroll=this\.loadMorePausedUntilUserScroll\|\|)(\i<100)/,
                    replace: "$1($2&&!$self.keepLoading(this))"
                },
                {
                    match: /handleUserScrollGesture=\(\)=>\{/,
                    replace: "$&$self.onGesture(this);"
                }
            ]
        }
    ],

    onGesture,
    keepLoading,

    start() {
        running = true;
    },

    stop() {
        running = false;
        if (pendingScroll) clearTimeout(pendingScroll);
        pendingScroll = undefined;
        scrolled = null;
    }
});
