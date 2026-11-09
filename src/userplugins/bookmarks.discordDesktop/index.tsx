/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher, Menu, React, RelationshipStore, showToast, UserStore } from "@webpack/common";

import { BookmarkList } from "./BookmarkList";
import { BookmarkAddIcon, BookmarkIcon } from "./icons";
import { filterRows, useVersion } from "./rows";
import { add, count, isBookmarked, load, remove } from "./store";
import { About } from "./ui";

const FriendsStore: any = findStoreLazy("FriendsStore");

const settings = definePluginSettings({
    people: {
        type: OptionType.COMPONENT,
        component: BookmarkList
    }
});

/** Whether Vencord had this switched on when Discord loaded, which is when the tab is put in */
const enabledAtLoad = !!Settings.plugins.Bookmarks?.enabled;

let running = false;

/** Whether the screen is being shared, as Plugin Hub's Screen Share Protection sees it */
const shared = () => !!(window as any).vcScreenShared;

/** A share starting or ending: the tab goes or comes back, and you are moved off it if you were on it */
function onShared() {
    leaveTab();
    redrawFriends();
}

/** Standing on the tab as it goes would leave its page up with no tab selected */
function leaveTab() {
    try {
        if (FriendsStore.getState?.()?.section === SECTION) {
            FluxDispatcher.dispatch({ type: "FRIENDS_SET_SECTION", section: "ALL" } as any);
        }
    } catch { /* nothing open to move */ }
}

/** Have the Friends page look again at which tabs it has */
function redrawFriends() {
    try {
        // The page keeps its list of tabs until something it is listening to changes, and
        // the relationships are what it listens to.
        RelationshipStore.emitChange?.();
        FriendsStore.emitChange?.();
    } catch { /* not open */ }
}

/** The id of the tab, as Discord keeps track of which one is open */
const SECTION = "BOOKMARKED";

/** Who a menu is about: the person it was opened on, or the other side of a DM */
function personOf(user?: User, channel?: Channel): any {
    if (user) return user;

    const recipients: string[] = (channel as any)?.recipients ?? [];
    return (channel as any)?.type === 1 && recipients[0] ? UserStore.getUser(recipients[0]) : null;
}

/** Whether Ctrl was held on the press that opened the menu, read before Discord builds it */
let ctrlHeld = false;
const noteCtrl = (event: MouseEvent) => {
    // a press inside an open menu is choosing an entry, not opening a menu
    if ((event.target as Element | null)?.closest?.('[role="menu"]')) return;
    ctrlHeld = event.ctrlKey;
};

const menu: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
    // A shared screen should not show who is worth keeping within reach.
    if (shared()) return;
    const person = personOf(user, channel);
    if (!person?.id || person.id === UserStore.getCurrentUser()?.id) return;

    const saved = isBookmarked(person.id);

    // When right-click buttons show at all, as chosen on Additional Settings - except Remove
    // Bookmark on the Bookmarked tab itself, the one place it is the thing you came to do.
    const mode: string = (window as any).vcMenuMode ?? "always";
    const onTab = saved && FriendsStore.getState?.()?.section === SECTION && location.pathname === "/channels/@me";
    if (!onTab && (mode === "never" || (mode !== "always" && !ctrlHeld))) return;
    const Icon = saved ? BookmarkIcon : BookmarkAddIcon;

    const item = (
        <Menu.MenuItem
            id="vc-bm-toggle"
            label={saved ? "Remove Bookmark" : "Bookmark"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => {
                if (saved) remove(person.id);
                else add(person);

                showToast({ text: saved ? "Bookmark removed" : "Bookmarked. Find them under Friends, in Bookmarked", variant: "success" });
            }}
        />
    );

    // Beside Discord's own ways of keeping somebody close: under Add to Favorites on a DM,
    // under Message on a person. Only where neither is there does it get a group of its own.
    for (const id of NEIGHBOURS) {
        const group = findGroupChildrenByChildId(id, children);
        const at = group?.findIndex(child => child?.props?.id === id) ?? -1;
        if (group && at !== -1) return void group.splice(at + 1, 0, item);
    }

    // Still above the other plugins' groups and Discord's closing one (Copy ID, View Avatar)
    const group = <Menu.MenuGroup key="vc-bm-group">{item}</Menu.MenuGroup>;
    const at = children.findIndex(child => /^vc-(local-plugins|cfmod)/.test(String(child?.key ?? "")) || holds(child, isTail));
    if (at === -1) children.push(group);
    else children.splice(at, 0, group);
};

/** The entries Bookmark goes straight under, the first one found */
const NEIGHBOURS = ["favorite-channel", "message-user"];

const TAIL = ["view-avatar", "vc-copy-user-url"];
const isTail = (id: string) => id.startsWith("devmode-copy-id") || TAIL.includes(id);

function holds(node: any, test: (id: string) => boolean): boolean {
    if (!node) return false;
    if (Array.isArray(node)) return node.some(kid => holds(kid, test));
    if (typeof node.props?.id === "string" && test(node.props.id)) return true;

    const kids = node.props?.children;
    return typeof kids === "object" && holds(kids, test);
}

export default definePlugin({
    name: "Bookmarks",
    description: "Bookmark profiles and find them again from Friends.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            menus
            icon={BookmarkIcon}
            title="Bookmark anyone's profile"
            note="Kept on this computer only. Nobody is told they were bookmarked."
            steps={[
                <>Right-click someone, or open the <strong>...</strong> menu on their profile, and choose <strong>Bookmark</strong>.</>,
                <>Open <strong>Friends</strong> and the <strong>Bookmarked</strong> tab. Click someone to message them, or right-click them for the rest.</>,
                <>They stay there even after you close their DM.</>
            ]}
        />
    ),

    patches: [
        {
            // The tabs along the top of the Friends page. Ours goes in straight after Pending.
            find: "#{intl::FRIENDS_SECTION_ONLINE}),className:",
            replacement: [
                {
                    match: /className:(\i\.\i)\},\{id:(\i\.\i)\.SUGGESTIONS,show:/,
                    replace: "className:$1},{id:$self.SECTION,show:$self.tabShown(),className:$1,content:\"Bookmarked\",announceName:\"Bookmarked\"},{id:$2.SUGGESTIONS,show:"
                },
            ]
        },
        {
            // The list every tab but Add Friend shares. Ours is drawn by it too, from the
            // bookmarks, so it looks and behaves exactly like All and Pending - see rows.ts.
            find: "Unexpected pending friend requests section index",
            replacement: [
                {
                    // each tab starts with an empty search; Discord only lists its own tabs,
                    // and a tab with no entry reads as one being searched
                    match: /(for\(let (\i) of Object\.values\(\i\.\i\)\)(\i)\[\2\]="";)/,
                    replace: "$1$3[$self.SECTION]=\"\";"
                },
                {
                    // the rows of the open tab
                    match: /(\i)=(\i\.useMemo)\(\(\)=>(\i)\.filter\((\i),(\i)\[\4\]\),\[\3,\5,\4\]\)/,
                    replace: "$1=$2(()=>$self.filterRows($3,$4,$5[$4]),[$3,$5,$4,$self.useVersion()])"
                },
                {
                    // the count above them: "Bookmarked — 12"
                    match: /(function\(\i,(\i),\i,\i\)\{switch\(\i\)\{)(case \i\.\i\.ONLINE:return)/,
                    replace: "$1case $self.SECTION:return $self.title($2);$3"
                }
            ]
        },
        {
            // The picture a tab shows with nobody in it. Ours has one of its own words.
            find: '"FriendsEmptyState: Invalid empty state"',
            replacement: {
                match: /(case"SECTION_NO_RESULTS":return (\i)\.SECTION_NO_RESULTS;)(default:throw)/,
                replace: "$1case $self.SECTION:return $self.empty($2.SECTION_ONLINE);$3"
            }
        },
        {
            // A row's ... button. A friend's opens calls and Remove Friend; a bookmark may not
            // be a friend at all, so it opens the menu right-clicking the row opens.
            find: "peopleListItemRef=",
            replacement: {
                match: /handleOpenActionsMenu=(\i)=>\{/,
                replace: "handleOpenActionsMenu=$1=>{if(this.props.vcBookmark)return void this.peopleListItemRef.current?.handleContextMenu?.($1,this.props.user);"
            }
        }
    ],

    SECTION,

    /**
     * Whether the tab is there. The tab is part of Discord's page for as long as the window
     * lives, so switching the plugin off cannot take it out - it is asked each time instead.
     */
    tabShown() {
        return running && !shared();
    },

    /** Whether Discord loaded with the tab in, which is the only time it can go in */
    patchesLive() {
        return enabledAtLoad;
    },

    /** One line for Additional Settings */
    hubSummary() {
        const n = count();
        return n ? `${n} bookmarked` : "";
    },

    filterRows: (rows: any, section: string, query: string) => filterRows(rows, section, query, SECTION),
    useVersion,

    title: (n: number) => `Bookmarked — ${n}`,

    /** Discord's own picture for an empty tab, with words of ours under it */
    empty(base: any) {
        if (!base) return base;
        return {
            ...base,
            renderContent: () => {
                const shown = base.renderContent?.();
                const note = "Nobody bookmarked yet. Right-click someone and choose Bookmark.";
                return React.isValidElement(shown) ? React.cloneElement(shown as any, { note }) : note;
            }
        };
    },

    contextMenus: {
        "user-context": menu,
        "user-profile-actions": menu,
        "user-profile-overflow-menu": menu
    },

    async start() {
        running = true;
        window.addEventListener("contextmenu", noteCtrl, true);
        window.addEventListener("mousedown", noteCtrl, true);
        window.addEventListener("vc-screen-shared", onShared);
        redrawFriends();

        await load();
    },

    stop() {
        running = false;
        window.removeEventListener("contextmenu", noteCtrl, true);
        window.removeEventListener("mousedown", noteCtrl, true);
        ctrlHeld = false;

        window.removeEventListener("vc-screen-shared", onShared);
        leaveTab();
        redrawFriends();
    }
});
