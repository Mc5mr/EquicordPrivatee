/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import BadgeAPI from "@plugins/_api/badges";
import definePlugin, { OptionType } from "@utils/types";
import type { ProfileBadge, RenderModalProps, User } from "@vencord/discord-types";
import { closeModal, DisplayProfileUtils, IconUtils, Menu, Modal, openModal, React, TextInput, UsernameUtils, UserProfileStore, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    names: { type: OptionType.CUSTOM, description: "Local names saved separately for each account.", default: {} as Record<string, Record<string, string>> }
});
let running = false;
export function localName(id: string) { return running ? settings.store.names[UserStore.getCurrentUser()?.id ?? ""]?.[id] : undefined; }
export function saveName(owner: string, id: string, name: string) {
    if (!running || owner !== UserStore.getCurrentUser()?.id) return;
    const names = { ...settings.store.names[owner] };
    const value = name.trim().slice(0, 80);
    if (value) names[id] = value; else delete names[id];
    settings.store.names = { ...settings.store.names, [owner]: names };
    cached = undefined;
    UserStore.emitChange();
}
function NameEditor({ user, owner, ...props }: RenderModalProps & { user: User; owner: string; }) {
    const [name, setName] = React.useState(localName(user.id) ?? "");
    return React.createElement(Modal, {
        ...props, title: "Change Name",
        actions: [
            { text: "استعادة الاسم الأصلي", variant: "secondary", onClick: () => { saveName(owner, user.id, ""); props.onClose(); } },
            { text: "حفظ", variant: "primary", onClick: () => { saveName(owner, user.id, name); props.onClose(); } }
        ]
    }, React.createElement(TextInput, { value: name, onChange: setName, maxLength: 80, placeholder: user.globalName || user.username, "aria-label": "الاسم الظاهر عندك فقط" }));
}

export interface Appearance {
    owner: string;
    source: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
    avatarUrl: string;
    bannerUrl: string | null;
    banner?: string | null;
    bio: string;
    pronouns: string;
    badges?: ProfileBadge[];
    accentColor?: number | null;
    themeColors?: [number, number];
    avatarDecorationData?: User["avatarDecorationData"];
    collectibles?: User["collectibles"];
    displayNameStyles?: User["displayNameStyles"];
    profileEffect?: unknown;
    profileFrame?: unknown;
    popoutAnimationParticleType?: unknown;
}
let appearance: Appearance | null = null;
let source: "switcher" | "copy" | null = null;
let cached: { user: User; appearance: Appearance; result: User; } | undefined;
const profileCache = new WeakMap<object, { appearance: Appearance; result: object; }>();
const restores: (() => void)[] = [];
const listeners = new Set<() => void>();
function displayedBadges(value: Appearance, guildId = "") {
    const ownBadges = BadgeAPI.getBadges({ userId: value.owner, guildId });
    const seen = new Set(ownBadges.map(badge => badge.id));
    return [...ownBadges, ...(value.badges ?? []).filter(badge => !seen.has(badge.id))];
}
export function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function snapshot() { return appearance?.owner === UserStore.getCurrentUser()?.id ? appearance : null; }
export function capture(user: User, guildId?: string): Appearance | null {
    const owner = UserStore.getCurrentUser()?.id;
    if (!owner) return null;
    const display = DisplayProfileUtils.getDisplayProfile(user.id, guildId);
    const profile = { ...UserProfileStore.getUserProfile(user.id), ...display };
    const banner = profile?.banner ?? user.banner;
    const themeColors: Appearance["themeColors"] = profile.themeColors ? [profile.themeColors[0], profile.themeColors[1]] : undefined;
    return {
        owner, source: user.id, username: user.username, globalName: user.globalName ?? null,
        avatar: user.avatar, avatarUrl: user.getAvatarURL(guildId, 256, true),
        banner: banner ?? null,
        bannerUrl: banner ? display?.getBannerURL({ size: 1024, canAnimate: true }) ?? IconUtils.getUserBannerURL({ id: user.id, banner, size: 1024, canAnimate: true }) ?? null : null,
        bio: profile?.bio ?? "", pronouns: profile?.pronouns ?? "",
        badges: profile?.badges?.map(badge => ({ ...badge })),
        accentColor: profile?.accentColor, themeColors,
        avatarDecorationData: user.avatarDecorationData,
        collectibles: user.collectibles, displayNameStyles: user.displayNameStyles,
        profileEffect: profile && Reflect.get(profile, "profileEffect"),
        profileFrame: profile && Reflect.get(profile, "profileFrame"),
        popoutAnimationParticleType: profile && Reflect.get(profile, "popoutAnimationParticleType")
    };
}
export function apply(value: Appearance | null, origin: "switcher" | "copy") {
    if (value && value.owner !== UserStore.getCurrentUser()?.id) return;
    appearance = value;
    source = value ? origin : null;
    cached = undefined;
    listeners.forEach(listener => listener());
    UserStore.emitChange();
}
export function reset(origin?: "switcher" | "copy") { if (!origin || origin === source) apply(null, origin ?? "copy"); }

// Only display props are transformed. Authentication, permissions, account
// stores and the real User record are never replaced or mutated.
export function visualUser(user: User | null | undefined) {
    const value = snapshot();
    if (!user) return user;
    const alias = localName(user.id);
    if (!value || user.id !== value.owner) {
        if (!alias) return user;
        return Object.create(user, { globalName: { value: alias }, global_name: { value: alias } }) as User;
    }
    if (cached?.user === user && cached.appearance === value) return cached.result;
    const result = Object.create(user) as User;
    Object.defineProperties(result, {
        username: { value: value.username }, globalName: { value: value.globalName ?? value.username }, global_name: { value: value.globalName ?? value.username },
        primaryGuild: { value: null },
        avatarDecorationData: { value: value.avatarDecorationData ?? null },
        collectibles: { value: value.collectibles ?? null }, displayNameStyles: { value: value.displayNameStyles ?? null },
        avatar: { value: value.avatar }, banner: { value: value.banner ?? null }, getAvatarURL: { value: () => value.avatarUrl }
    });
    cached = { user, appearance: value, result };
    return result;
}
export function visualProfile<T extends { userId: string; bio?: string; pronouns?: string; }>(profile: T | null | undefined): T | null | undefined {
    const value = snapshot();
    if (!value || !profile || profile.userId !== value.owner) return profile;
    const previous = profileCache.get(profile);
    if (previous?.appearance === value) return previous.result as T;
    const result = Object.create(profile) as T;
    const properties: PropertyDescriptorMap = {
        banner: { value: value.banner ?? null }, bio: { value: value.bio }, pronouns: { value: value.pronouns },
        getBannerURL: { value: () => value.bannerUrl },
        getPreviewBanner: { value: () => value.bannerUrl },
        getPreviewBio: { value: () => value.bio },
        getPreviewPronouns: { value: () => value.pronouns },
        profileEffect: { value: value.profileEffect ?? null },
        profileFrame: { value: value.profileFrame ?? null },
        popoutAnimationParticleType: { value: value.popoutAnimationParticleType ?? null },
        canEditThemes: { value: !!value.themeColors },
        canUsePremiumProfileCustomization: { value: !!(value.themeColors || value.banner || value.profileEffect) },
        hasThemeColors: { value: () => !!value.themeColors },
        getPreviewThemeColors: { value: () => value.themeColors },
        primaryColor: { value: value.themeColors?.[0] ?? value.accentColor },
        ...(value.badges ? { badges: { value: value.badges }, getBadges: { value: () => displayedBadges(value) } } : {}),
        accentColor: { value: value.accentColor ?? null },
        themeColors: { value: value.themeColors }
    };
    Object.defineProperties(result, Object.fromEntries(Object.entries(properties).map(([key, descriptor]) => [key, { get() {
        const current = snapshot();
        if (!current || current.owner !== profile.userId) return Reflect.get(profile, key);
        return current === value ? descriptor.value : Reflect.get(visualProfile(profile) ?? profile, key);
    } }])));
    profileCache.set(profile, { appearance: value, result });
    profileCache.set(result, { appearance: value, result });
    return result;
}

// Wrap presentation helpers only. No auth/account/permission store is patched.
function installPresentationHooks() {
    const avatar = IconUtils.getUserAvatarURL;
    const wrappedAvatar: typeof avatar = function (user, ...args) {
        const value = snapshot();
        return value && user.id === value.owner ? value.avatarUrl : avatar.call(IconUtils, user, ...args);
    };
    if (typeof avatar === "function" && Reflect.set(IconUtils, "getUserAvatarURL", wrappedAvatar)) restores.push(() => { if (IconUtils.getUserAvatarURL === wrappedAvatar) Reflect.set(IconUtils, "getUserAvatarURL", avatar); });
    const banner = IconUtils.getUserBannerURL;
    const wrappedBanner: typeof banner = function (options) {
        const value = snapshot();
        return value && options.id === value.owner ? value.bannerUrl ?? undefined : banner.call(IconUtils, options);
    };
    if (typeof banner === "function" && Reflect.set(IconUtils, "getUserBannerURL", wrappedBanner)) restores.push(() => { if (IconUtils.getUserBannerURL === wrappedBanner) Reflect.set(IconUtils, "getUserBannerURL", banner); });
    for (const key of ["getName", "getGlobalName", "getFormattedName", "getUserTag"] as const) {
        const original = UsernameUtils[key];
        const wrapped: typeof original = function (...args: unknown[]) {
            const user = args.find((arg): arg is User => !!arg && typeof arg === "object" && "id" in arg && "username" in arg);
            const alias = user && localName(user.id);
            const copied = user && snapshot();
            if (copied && user.id === copied.owner && (key === "getName" || key === "getGlobalName")) return copied.globalName ?? copied.username;
            if (alias && (key === "getName" || key === "getGlobalName")) return alias;
            return Reflect.apply(original, UsernameUtils, args.map(arg => arg === user ? visualUser(user) : arg)) as string;
        };
        if (typeof original === "function" && Reflect.set(UsernameUtils, key, wrapped)) restores.push(() => { if (UsernameUtils[key] === wrapped) Reflect.set(UsernameUtils, key, original); });
    }
    const original = DisplayProfileUtils.getDisplayProfile;
    const wrapped: typeof original = function (...args) { return visualProfile(original.apply(DisplayProfileUtils, args)) ?? null; };
    if (typeof original === "function" && Reflect.set(DisplayProfileUtils, "getDisplayProfile", wrapped)) restores.push(() => { if (DisplayProfileUtils.getDisplayProfile === wrapped) Reflect.set(DisplayProfileUtils, "getDisplayProfile", original); });
}
export function visualProps<T extends { user?: User; currentUser?: User; displayProfile?: { userId: string; bio?: string; pronouns?: string; }; }>(props: T): T {
    if (!snapshot() && !localName(props.user?.id ?? "") && !localName(props.currentUser?.id ?? "")) return props;
    return { ...props, user: visualUser(props.user), currentUser: visualUser(props.currentUser), displayProfile: visualProfile(props.displayProfile) };
}
export default definePlugin({
    name: "LocalProfileCore",
    description: "Session-only appearance previews scoped to profile and account display props.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    settings,
    hidden: true,
    required: true,
    contextMenus: { "user-context"(children, { user }: { user: User; }) {
        const owner = UserStore.getCurrentUser()?.id;
        if (!owner || !user) return;
        children.push(React.createElement(Menu.MenuItem, { id: "mc5mr-change-name", label: "Change Name", action: () => openModal(props => React.createElement(NameEditor, { ...props, user, owner }), { modalKey: "mc5mr-change-name" }) }));
    } },
    patches: [{
        find: "handleOpenSettingsContextMenu=",
        replacement: [
            { match: /\i(?:\.\i)*\.getCurrentUser\(\)/g, replace: "$self.visualUser($&)" }
        ]
    }, {
        find: '"UserProfileAccountPopout"',
        replacement: [
            { match: /\i(?:\.\i)*\.getCurrentUser\(\)/g, replace: "$self.visualUser($&)" },
            {
                match: /(function(?: \i)?\((\i)\)\{)(?=let\{(?=[^}]{0,800}\buser:)(?=[^}]{0,800}\bdisplayProfile:))/g,
                replace: "$1$2=$self.visualProps($2);"
            }
        ]
    }, {
        find: '"UserProfilePopout");',
        replacement: [
            {
                match: /(function(?: \i)?\((\i)\)\{)(?=let\{(?=[^}]{0,800}\buser:)(?=[^}]{0,800}\bdisplayProfile:))/g,
                replace: "$1$2=$self.visualProps($2);"
            }
        ]
    }, {
        // Profile modal rendering only: never modify the underlying UserStore.
        find: ".MODAL_V2,onClose:",
        replacement: [
            { match: /\i(?:\.\i)*\.getUser\(\i\)/g, replace: "$self.visualUser($&)" },
            { match: /\i(?:\.\i)*\.getCurrentUser\(\)/g, replace: "$self.visualUser($&)" }
        ]
    }, {
        find: "getLegacyUsername(){",
        replacement: [{
            match: /getBadges\(\)\{/,
            replace: "$&const vcLocalBadges=$self.copiedBadges(this);if(vcLocalBadges)return vcLocalBadges;"
        }, {
            match: /this\._guildMemberProfile=\i(?=\})/,
            replace: "$&;return $self.visualProfile(this)"
        }]
    }, {
        find: ':"SHOULD_LOAD");',
        replacement: {
            match: /\i(?:\?)?.getPreviewBanner\(\i,\i,\i\)(?=.{0,100}"COMPLETE")/,
            replace: "$self.banner(arguments[0])||$&"
        }
    }],
    localName,
    visualUser,
    visualProfile,
    visualProps,
    copiedBadges(profile: { userId?: string; guildId?: string; }) {
        const value = snapshot();
        return value && profile.userId === value.owner && value.badges ? displayedBadges(value, profile.guildId) : null;
    },
    banner({ displayProfile }: { displayProfile?: { userId: string; }; }) {
        const value = snapshot();
        return value && displayProfile?.userId === value.owner ? value.bannerUrl : null;
    },
    start() { running = true; reset(); installPresentationHooks(); },
    stop() { running = false; closeModal("mc5mr-change-name"); restores.splice(0).reverse().forEach(restore => restore()); reset(); },
    flux: { LOGOUT() { closeModal("mc5mr-change-name"); reset(); }, CONNECTION_OPEN() { closeModal("mc5mr-change-name"); reset(); } }
});
