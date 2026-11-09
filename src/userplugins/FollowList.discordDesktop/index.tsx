/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { UserAreaButton } from "@api/UserArea";
import { Button } from "@components/Button";
import { Heart } from "@components/Heart";
import { UserIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User, VoiceState } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { Avatar, ChannelStore, closeModal, GuildStore, IconUtils, Menu, Modal, openModal, PermissionsBits, PermissionStore, React, RelationshipStore, showToast, Toasts, UserStore, useStateFromStores, VoiceStateStore } from "@webpack/common";

import { mergeVoiceTools } from "../NightcordUI.discordDesktop/menus";
import { Panel, Status } from "../NightcordUI.discordDesktop/ui";
import style from "./styles.css?managed";

const cl = classNameFactory("vc-mc5mr-follow-");
const MODAL_KEY = "mc5mr-follow-manager";

const voiceActions = findByPropsLazy("selectVoiceChannel") as { selectVoiceChannel(id: string | null): Promise<void> | void; };
const settings = definePluginSettings({
    joinOnFollow: { type: OptionType.BOOLEAN, description: "الدخول مع الهدف عند الفولو: ادخل رومه عند الضغط على متابعة.", default: true },
    onlyWhileConnected: { type: OptionType.BOOLEAN, description: "فقط إذا كنت في روم: لا تدخل الصوت تلقائيًا وأنت خارج الرومات.", default: false },
    joinWhenSpaceOpens: { type: OptionType.BOOLEAN, description: "انتهاز الفرصة عند الخروج: إذا كان روم الهدف ممتلئًا، ادخل عند توفر مكان.", default: true },
    autoReturn: { type: OptionType.BOOLEAN, description: "الرجوع التلقائي: ارجع إلى روم الهدف إذا خرجت أو انتقلت إلى روم آخر.", default: false },
    leaveWithTarget: { type: OptionType.BOOLEAN, description: "الخروج عند خروجه: اخرج من الصوت عندما يغادر الهدف الصوت بالكامل.", default: false },
    manualOnly: { type: OptionType.BOOLEAN, description: "التشغيل اليدوي فقط: ادخل عند الضغط على متابعة دون ملاحقة انتقالاته تلقائيًا.", default: false }
});
const SETTING_KEYS = ["joinOnFollow", "onlyWhileConnected", "joinWhenSpaceOpens", "autoReturn", "leaveWithTarget", "manualOnly"] satisfies (keyof typeof settings.store)[];
const SETTING_LABELS = ["الدخول مع الهدف عند الفولو", "فقط إذا كنت في روم", "انتهاز الفرصة عند الخروج", "الرجوع التلقائي", "الخروج عند خروجه", "التشغيل اليدوي فقط"];
const pinned = new Set<string>();
const listeners = new Set<() => void>();
let target: string | null = null;
let waitingChannel: string | null = null;
let paused = false;
let running = false;
let generation = 0;
let lastJoin = 0;
let lastJoinChannel: string | undefined;
let retrying = false;
let joining: object | undefined;
let requestedChannel: string | undefined;
let joinDeadline: ReturnType<typeof setTimeout> | undefined;
let queued = false;
let pending: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let loaded = false;
let storageFailed = false;
let saving = Promise.resolve();


function publish() {
    revision++;
    listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function storeKey() {
    return `Mc5mrFollowList:${UserStore.getCurrentUser()?.id ?? "signed-out"}`;
}

async function loadPinned() {
    const epoch = ++generation;
    const key = storeKey();
    loaded = false;
    storageFailed = false;
    pinned.clear();
    publish();
    let saved: unknown;
    try { await saving; if (!running || epoch !== generation) return; saved = await DataStore.get<unknown>(key); }
    catch {
        if (running && epoch === generation) { storageFailed = true; publish(); }
        return;
    }
    if (!running || epoch !== generation || key !== storeKey()) return;
    if (Array.isArray(saved)) saved.filter((id): id is string => typeof id === "string" && /^\d{17,20}$/.test(id)).forEach(id => pinned.add(id));
    loaded = true;
    publish();
}

function savePinned() {
    const key = storeKey();
    const snapshot = [...pinned];
    saving = saving.then(() => DataStore.set(key, snapshot)).catch(() => {
        if (key === storeKey() && running) { storageFailed = true; publish(); }
    });
}

function clearJoin() {
    if (joinDeadline) clearTimeout(joinDeadline);
    joinDeadline = undefined;
    requestedChannel = undefined;
    joining = undefined;
}

async function joinTarget() {
    if (!running || paused || !target) return;
    const channelId = VoiceStateStore.getVoiceStateForUser(target)?.channelId;
    if (joining && channelId !== requestedChannel) clearJoin();
    if (joining) { queued = true; return; }
    const currentTarget = target;
    const owner = UserStore.getCurrentUser()?.id;
    const epoch = generation;
    const me = UserStore.getCurrentUser();
    if (!channelId || !me) return;
    if (settings.store.onlyWhileConnected && !VoiceStateStore.getVoiceStateForUser(me.id)?.channelId) return;
    if (VoiceStateStore.getVoiceStateForUser(me.id)?.channelId === channelId) return;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel || (channel.guild_id && (!PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel) || !PermissionStore.can(PermissionsBits.CONNECT, channel)))) return;
    if (settings.store.joinWhenSpaceOpens && channel.userLimit > 0 && Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId)).length >= channel.userLimit && !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
        if (waitingChannel !== channelId) { waitingChannel = channelId; publish(); }
        return;
    }
    if (waitingChannel) { waitingChannel = null; publish(); }
    const retryDelay = lastJoinChannel === channelId ? 800 - (Date.now() - lastJoin) : 0;
    if (retryDelay > 0) {
        retrying = true;
        pending = setTimeout(() => { pending = undefined; retrying = false; void joinTarget(); }, retryDelay);
        return;
    }
    lastJoin = Date.now();
    lastJoinChannel = channelId;
    const attempt = {};
    joining = attempt;
    requestedChannel = channelId;
    joinDeadline = setTimeout(() => {
        if (joining !== attempt) return;
        clearJoin();
        queued = false;
        if (!running || paused || target !== currentTarget || owner !== UserStore.getCurrentUser()?.id) return;
        if (VoiceStateStore.getVoiceStateForUser(me.id)?.channelId === channelId) return;
        publish();
        showToast("لم يتأكد دخول الروم. ستبقى المتابعة مفعّلة، ويمكن إعادة المحاولة عند تحديث حالة الروم.", Toasts.Type.FAILURE);
    }, 10_000);
    try {
        await voiceActions.selectVoiceChannel(channelId);
    } catch {
        if (joining !== attempt || !running || target !== currentTarget || epoch !== generation || owner !== UserStore.getCurrentUser()?.id) return;
        clearJoin();
        queued = false;
        publish();
        showToast("تعذر دخول الروم. ستبقى المتابعة مفعّلة.", Toasts.Type.FAILURE);
    } finally {
        if (joining === attempt && VoiceStateStore.getVoiceStateForUser(me.id)?.channelId === channelId) {
            clearJoin();
            if (queued) { queued = false; schedule(); }
        }
    }
}

function schedule(manual = false) {
    if (pending && !retrying && !manual && running && !paused && target && !settings.store.manualOnly) return;
    if (pending) clearTimeout(pending);
    pending = undefined;
    retrying = false;
    if (!running || paused || !target) return;
    if (!manual && settings.store.manualOnly) return;
    pending = setTimeout(() => {
        pending = undefined;
        if (manual || !settings.store.manualOnly) void joinTarget();
    }, 0);
}

function setTarget(id: string | null) {
    clearJoin();
    queued = false;
    lastJoin = 0;
    lastJoinChannel = undefined;
    if (id) {
        const lock = Vencord.Plugins.plugins.VoiceLock;
        if (lock && "stopRoomLock" in lock && typeof lock.stopRoomLock === "function") lock.stopRoomLock();
    }
    target = id;
    waitingChannel = null;
    paused = false;
    publish();
    if (id && settings.store.joinOnFollow) schedule(true);
    else if (pending) { clearTimeout(pending); pending = undefined; }
}

function togglePause() {
    clearJoin();
    queued = false;
    paused = !paused;
    if (!paused) {
        lastJoin = 0;
        lastJoinChannel = undefined;
        const lock = Vencord.Plugins.plugins.VoiceLock;
        if (lock && "stopRoomLock" in lock && typeof lock.stopRoomLock === "function") lock.stopRoomLock();
    }
    publish();
    schedule(true);
}

function FollowSettings({ inModal = false }: { inModal?: boolean; } = {}) {
    React.useSyncExternalStore(subscribe, () => revision);
    const options = settings.use(SETTING_KEYS);
    const friends = useStateFromStores([RelationshipStore, UserStore, VoiceStateStore, ChannelStore, GuildStore, PermissionStore], () => RelationshipStore.getFriendIDs().filter(id => VoiceStateStore.getVoiceStateForUser(id)?.channelId));
    const pinnedIds = [...pinned];
    const visibleFriends = friends.filter(id => id !== UserStore.getCurrentUser()?.id);
    function row(id: string, isPinned = false) {
        const user = UserStore.getUser(id);
        const channelId = VoiceStateStore.getVoiceStateForUser(id)?.channelId;
        const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
        const canJoin = !!channel && (!channel.guild_id || (PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel) && PermissionStore.can(PermissionsBits.CONNECT, channel)));
        return <div className={cl("row")} key={id}>
            <Avatar src={user ? IconUtils.getUserAvatarURL(user, false, 40) : undefined} size="SIZE_40" aria-hidden />
            <div className={cl("identity")}><strong>{user?.globalName || user?.username || id}</strong><span>{channel ? `#${channel.name} — ${channel.guild_id ? GuildStore.getGuild(channel.guild_id)?.name ?? "سيرفر" : "مكالمة"}` : "ليس في روم صوت"}</span></div>
            <div className={cl("actions")}><Button size="small" disabled={!canJoin} onClick={() => { if (channelId && canJoin) void Promise.resolve(voiceActions.selectVoiceChannel(channelId)).catch(() => showToast("تعذر دخول الروم.", Toasts.Type.FAILURE)); }}>دخول</Button>
            <Button size="small" variant="positive" onClick={() => setTarget(target === id ? null : id)}>{target === id ? "إلغاء" : "متابعة"}</Button>
            {isPinned && <Button size="small" variant="secondary" disabled={!loaded} onClick={() => { pinned.delete(id); savePinned(); publish(); }}>إزالة</Button>}</div>
        </div>;
    }
    return <Panel className={`${cl("manager")}${inModal ? " vc-mc5mr-follow-modal" : ""}`} dir="ltr"><div className={cl("content")}>
        {storageFailed && <Status error>تعذر تحميل أو حفظ التثبيت. <Button size="small" variant="secondary" onClick={() => void loadPinned()}>إعادة التحميل</Button></Status>}
        <h3>جاري المتابعة حاليًا</h3>
        {waitingChannel && !paused && <Status>روم الهدف ممتلئ. بانتظار توفر مكان للدخول.</Status>}
        {target ? <><div>{row(target)}</div><div className={cl("actions")}><Button size="small" variant="secondary" onClick={togglePause}>{paused ? "استئناف المتابعة" : "إيقاف مؤقت"}</Button><Button size="small" variant="dangerSecondary" onClick={() => setTarget(null)}>إلغاء المتابعة</Button></div></> : <p className={cl("empty")}>لا تتابع أحدًا حاليًا. اضغط كليك يمين على مستخدم لمتابعته.</p>}
        <h3>المستخدمون المثبتون</h3>
        {!loaded && !storageFailed ? <Status>جارٍ تحميل التثبيت…</Status> : pinnedIds.length ? <div className={cl("rows")}>{pinnedIds.map(id => row(id, true))}</div> : <p className={cl("empty")}>لا يوجد مستخدمون مثبتون. اضغط كليك يمين على مستخدم واختر "تثبيت في لوحة الفولو".</p>}
        <h3>الأصدقاء في الرومات ({visibleFriends.length})</h3>
        {visibleFriends.length ? <div className={cl("rows")}>{visibleFriends.map(id => row(id))}</div> : <p className={cl("empty")}>لا يوجد أصدقاء في الصوت حاليًا</p>}
        <h3>الإعدادات النشطة</h3>
        <div className={cl("settings-summary")} dir="rtl">{SETTING_KEYS.map((key, index) => <span className={cl("setting")} key={key}><span className={cl(options[key] ? "enabled" : "disabled")} aria-hidden />{SETTING_LABELS[index]}: <strong>{options[key] ? "مفعّل" : "معطّل"}</strong></span>)}</div>
        </div>
    </Panel>;
}

function openManager() {
    openModal(props => <Modal {...props} role="dialog" size="md" title="إدارة الفولو" actionBarInput={<></>} actions={[{ text: "إغلاق", variant: "secondary", onClick: props.onClose }]}><FollowSettings inModal /></Modal>, { modalKey: MODAL_KEY });
}

function FollowStatus() {
    React.useSyncExternalStore(subscribe, () => revision);
    if (!target) return null;
    const user = UserStore.getUser(target);
    return <HeaderBarButton className="vc-mc5mr-header-button" icon={Heart} selected={!paused} tooltip={`${paused ? "استئناف متابعة" : "إيقاف المتابعة مؤقتًا مع"} ${user?.globalName || user?.username || target}`} aria-label={paused ? "استئناف الفولو" : "إيقاف الفولو مؤقتًا"} onClick={togglePause} />;
}

const userContext: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;
    children.push(<Menu.MenuGroup key="mc5mr-follow">
        <Menu.MenuItem id="mc5mr-love" label={target === user.id ? "اكرهك" : "احبك"} action={() => setTarget(target === user.id ? null : user.id)} />
        <Menu.MenuItem id="mc5mr-pin-follow" label={pinned.has(user.id) ? "إزالة التثبيت من لوحة الفولو" : "تثبيت في لوحة الفولو"} disabled={!loaded} action={() => {
            if (pinned.has(user.id)) pinned.delete(user.id);
            else pinned.add(user.id);
            savePinned();
            publish();
        }} />
    </Menu.MenuGroup>);
};

export default definePlugin({
    name: "FollowList",
    description: "Follow people in voice and manage them in a centered panel.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Friends", "Voice"],
    dependencies: ["NightcordUI"],
    settings,
    managedStyle: style,
    userAreaButton: { priority: -10, icon: UserIcon, render: () => <UserAreaButton className="vc-nc-user-button" icon={<UserIcon width={20} height={20} />} tooltipText="إدارة الفولو" aria-label="إدارة الفولو" onClick={openManager} /> },
    headerBarButton: { priority: -5, icon: Heart, render: FollowStatus },
    openManager,
    settingsAboutComponent: () => <p dir="rtl">افتح إدارة الفولو من زر الشخص أسفل اليسار. فعّل خيارات المتابعة هنا، وتظهر حالتها أسفل القائمة. اضغط القلب الوردي بالأعلى لإيقاف المتابعة مؤقتًا واستئنافها لنفس الشخص.</p>,
    pauseFollow() {
        if (!target || paused) return;
        clearJoin();
        queued = false;
        paused = true;
        if (pending) clearTimeout(pending);
        pending = undefined;
        publish();
    },
    contextMenus: {
        "user-context": userContext,
        "channel-context": (children, { channel }: { channel: Channel; }) => {
            if (!channel || channel.type !== 2) return;
            const ids = [...new Set([...pinned, ...(target ? [target] : [])])].filter(id => VoiceStateStore.getVoiceStateForUser(id)?.channelId === channel.id);
            mergeVoiceTools(children, [<Menu.MenuItem key="mc5mr-follow-channel" id="mc5mr-follow-channel" label={`قائمة الفولو (${ids.length})`}>
                {ids.length ? ids.map(id => <Menu.MenuItem key={id} id={`mc5mr-follow-person-${id}`} label={UserStore.getUser(id)?.globalName || UserStore.getUser(id)?.username || id}>
                    {target === id && <Menu.MenuItem id={`mc5mr-follow-stop-${id}`} label="اكرهك · إيقاف الفولو" action={() => setTarget(null)} />}
                    {pinned.has(id) && <Menu.MenuItem id={`mc5mr-unpin-${id}`} label="إزالة التثبيت" action={() => { pinned.delete(id); savePinned(); publish(); }} />}
                </Menu.MenuItem>) : <Menu.MenuItem id="mc5mr-follow-empty" label="القائمة فارغة" disabled />}
            </Menu.MenuItem>]);
        }
    },
    flux: {
        CONNECTION_OPEN() {
            clearJoin();
            queued = false;
            lastJoin = 0;
            lastJoinChannel = undefined;
            if (pending) clearTimeout(pending);
            pending = undefined;
            retrying = false;
            void loadPinned();
            schedule();
        },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const me = UserStore.getCurrentUser();
            const mine = voiceStates.find(state => state.userId === me?.id);
            const movedTarget = voiceStates.find(state => state.userId === target);
            if (mine?.channelId && mine.channelId === requestedChannel) {
                clearJoin();
                if (queued) { queued = false; schedule(); }
            }
            if (movedTarget && waitingChannel) { waitingChannel = null; publish(); }
            if (target && !paused && movedTarget && !movedTarget.channelId && settings.store.leaveWithTarget && !settings.store.manualOnly) {
                if (pending) clearTimeout(pending);
                pending = undefined;
                if (me && VoiceStateStore.getVoiceStateForUser(me.id)?.channelId) void Promise.resolve(voiceActions.selectVoiceChannel(null)).catch(() => showToast("تعذر الخروج من الروم.", Toasts.Type.FAILURE));
                return;
            }
            if (settings.store.manualOnly) return;
            if (movedTarget || waitingChannel || (mine && settings.store.autoReturn)) schedule();
        },
        CHANNEL_UPDATE({ channel }: { channel: Channel; }) { if (channel.id === waitingChannel) schedule(); },
        LOGOUT() {
            generation++;
            loaded = false;
            setTarget(null);
            pinned.clear();
            publish();
        }
    },
    async start() {
        running = true;
        await loadPinned();
    },
    stop() {
        closeModal(MODAL_KEY);
        running = false;
        loaded = false;
        generation++;
        target = null;
        waitingChannel = null;
        pinned.clear();
        if (pending) clearTimeout(pending);
        pending = undefined;
        lastJoin = 0;
        lastJoinChannel = undefined;
        retrying = false;
        clearJoin();
        queued = false;
        publish();
    }
});
