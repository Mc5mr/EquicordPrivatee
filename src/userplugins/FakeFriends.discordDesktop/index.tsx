/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { Menu, RelationshipStore, showToast, Toasts, UserStore } from "@webpack/common";

type Preview = { type: 1 | 3; since: string; };
const settings = definePluginSettings({}).withPrivateSettings<{ accounts?: Record<string, Record<string, Preview>>; }>();
const logger = new Logger("FakeFriends");
const restores: (() => void)[] = [];
let revision = 0;
const actions: {
    addRelationship(options: { userId: string; type?: number; }, callback?: () => void, ...rest: unknown[]): Promise<unknown>;
    removeRelationship(userId: string, context?: unknown, callback?: () => void, ...rest: unknown[]): Promise<unknown>;
} = findByPropsLazy("addRelationship", "removeRelationship", "acceptFriendRequest");
function previews() {
    const owner = UserStore.getCurrentUser()?.id;
    return owner ? settings.store.accounts?.[owner] ?? {} : {};
}
function setPreview(id: string, type?: 1 | 3) {
    const owner = UserStore.getCurrentUser()?.id;
    if (!owner || id === owner) return;
    const next = { ...previews() };
    if (type) next[id] = { type, since: new Date().toISOString() }; else delete next[id];
    settings.store.accounts = { ...settings.store.accounts, [owner]: next };
    revision++;
    RelationshipStore.emitChange();
}
function replace<K extends keyof typeof RelationshipStore>(key: K, value: typeof RelationshipStore[K]) {
    const original = RelationshipStore[key];
    if (!Reflect.set(RelationshipStore, key, value)) throw new Error("Discord relationship controls are read only.");
    restores.push(() => { if (RelationshipStore[key] === value) Reflect.set(RelationshipStore, key, original); });
}
function restore() {
    restores.splice(0).reverse().forEach(restore => restore());
    RelationshipStore.emitChange();
}
export default definePlugin({
    name: "FakeFriends",
    description: "Local friend and incoming friend request previews from the user context menu.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"], tags: ["Friends", "Utility"], settings, enabledByDefault: true,
    settingsAboutComponent: () => <p>Right click a person and choose Fake Friend or Fake Friend Request. These previews stay on your account locally and send no requests.</p>,
    patches: [{
        find: 'displayName="FriendRequestsStore"',
        replacement: {
            match: /(initialize\(\)\{this.waitFor\((\i\.\i),.{0,160}?\))(\}getIncomingRequests\(\).{0,200}?CONNECTION_OPEN:(\i),)/,
            replace: "$1,this.syncWith([$2],$4)$3"
        }
    }],
    contextMenus: {
        "user-context"(children, { user }: { user: User; }) {
            if (!user || user.id === UserStore.getCurrentUser()?.id) return;
            const value = previews()[user.id];
            const real = !value && RelationshipStore.getRelationshipType(user.id) !== 0;
            children.push(<Menu.MenuGroup key="mc5mr-fake-friends">
                <Menu.MenuItem id="mc5mr-fake-friend" label={value?.type === 1 ? "Remove Fake Friend" : "Fake Friend"} disabled={real} action={() => setPreview(user.id, value?.type === 1 ? undefined : 1)} />
                <Menu.MenuItem id="mc5mr-fake-friend-request" label={value?.type === 3 ? "Remove Fake Friend Request" : "Fake Friend Request"} disabled={real} action={() => setPreview(user.id, value?.type === 3 ? undefined : 3)} />
            </Menu.MenuGroup>);
        }
    },
    start() {
        if (restores.length) return;
        const getType = RelationshipStore.getRelationshipType.bind(RelationshipStore);
        const getMap = RelationshipStore.getMutableRelationships.bind(RelationshipStore);
        const pending = RelationshipStore.getPendingCount.bind(RelationshipStore);
        const friendCount = RelationshipStore.getFriendCount.bind(RelationshipStore);
        const relationshipCount = RelationshipStore.getRelationshipCount.bind(RelationshipStore);
        const friendIds = RelationshipStore.getFriendIDs.bind(RelationshipStore);
        const since = RelationshipStore.getSince.bind(RelationshipStore);
        const sinces = RelationshipStore.getSinces.bind(RelationshipStore);
        const version = RelationshipStore.getVersion.bind(RelationshipStore);
        const stranger = RelationshipStore.isStranger.bind(RelationshipStore);
        const incoming = RelationshipStore.isUnfilteredPendingIncoming.bind(RelationshipStore);
        const local = (id: string) => getType(id) === 0 ? previews()[id] : undefined;
        let cachedOwner = "";
        let cachedRevision = -1;
        let cachedVersion = -1;
        let baseMap = getMap();
        let mergedMap = baseMap;
        let mergedFriends = friendIds();
        let mergedSinces = sinces();
        let rows: [string, Preview][] = [];
        let extraFriends = 0;
        let extraPending = 0;
        const entries = () => {
            const owner = UserStore.getCurrentUser()?.id ?? "";
            const nativeVersion = version();
            const nativeMap = getMap();
            if (owner !== cachedOwner || cachedRevision !== revision || cachedVersion !== nativeVersion || baseMap !== nativeMap) {
                cachedOwner = owner; cachedRevision = revision; cachedVersion = nativeVersion; baseMap = nativeMap;
                rows = Object.entries(previews()).filter(([id]) => getType(id) === 0);
                const friends = rows.filter(([, value]) => value.type === 1).map(([id]) => id);
                extraFriends = friends.length;
                extraPending = rows.filter(([, value]) => value.type === 3).length;
                mergedMap = rows.length ? new Map([...nativeMap, ...rows.map(([id, value]) => [id, value.type] as const)]) : nativeMap;
                mergedFriends = rows.length ? [...friendIds(), ...friends] : friendIds();
                mergedSinces = rows.length ? { ...sinces(), ...Object.fromEntries(rows.map(([id, value]) => [id, value.since])) } : sinces();
            }
            return rows;
        };
        try {
            replace("getRelationshipType", id => local(id)?.type ?? getType(id));
            replace("getMutableRelationships", () => { entries(); return mergedMap; });
            replace("isFriend", id => RelationshipStore.getRelationshipType(id) === 1);
            replace("getFriendIDs", () => { entries(); return mergedFriends; });
            replace("getFriendCount", () => { entries(); return friendCount() + extraFriends; });
            replace("getPendingCount", () => { entries(); return pending() + extraPending; });
            replace("getRelationshipCount", () => relationshipCount() + entries().length);
            replace("isUnfilteredPendingIncoming", id => local(id)?.type === 3 || incoming(id));
            replace("isStranger", id => local(id) ? false : stranger(id));
            replace("getSince", id => local(id)?.since ?? since(id));
            replace("getSinces", () => { entries(); return mergedSinces; });
            replace("getVersion", () => version() + revision);
            const add = actions.addRelationship;
            const remove = actions.removeRelationship;
            const addLocal: typeof add = function (this: typeof actions, options, callback, ...rest) {
                if (!local(options.userId)) return add.apply(this, [options, callback, ...rest]);
                setPreview(options.userId, options.type === undefined || options.type === 1 ? 1 : undefined);
                callback?.();
                return Promise.resolve();
            };
            const removeLocal: typeof remove = function (this: typeof actions, id, context, callback, ...rest) {
                if (!local(id)) return remove.apply(this, [id, context, callback, ...rest]);
                setPreview(id);
                callback?.();
                return Promise.resolve();
            };
            if (!Reflect.set(actions, "addRelationship", addLocal)) throw new Error("Could not attach local friend preview actions.");
            restores.push(() => { if (actions.addRelationship === addLocal) Reflect.set(actions, "addRelationship", add); });
            if (!Reflect.set(actions, "removeRelationship", removeLocal)) throw new Error("Could not attach local friend preview actions.");
            restores.push(() => { if (actions.removeRelationship === removeLocal) Reflect.set(actions, "removeRelationship", remove); });
            RelationshipStore.emitChange();
        } catch (error) { restore(); logger.error(error); showToast("تعذّر تشغيل معاينة الأصدقاء المحلية.", Toasts.Type.FAILURE); }
    },
    flux: {
        CONNECTION_OPEN() { revision++; RelationshipStore.emitChange(); },
        LOGOUT() { revision++; RelationshipStore.emitChange(); }
    },
    stop: restore
});
