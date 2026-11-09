/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import type { Channel, User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, Constants, GuildChannelStore, Menu, PermissionsBits, PermissionStore, React, RestAPI, SelectedChannelStore, SelectedGuildStore, showToast, Toasts, UserStore, VoiceStateStore } from "@webpack/common";

import { mergeVoiceTools } from "../NightcordUI.discordDesktop/menus";

type RuleKind = "protect" | "blacklist" | "pull" | "freeze" | "mute" | "deaf" | "both" | "disconnect" | "denyMe" | "cameraDisconnect";
interface Rule {
    kind: RuleKind;
    userId: string;
    guildId: string;
    channelId: string;
    destination?: string;
}
interface MemberChange {
    channel_id?: string | null;
    mute?: boolean;
    deaf?: boolean;
}

const names: Record<RuleKind, string> = { protect: "Protect", blacklist: "Blacklist", pull: "Pull", freeze: "❄ تجميد", mute: "Auto Mute", deaf: "Auto Deafen", both: "Auto Mute & Deafen", disconnect: "Auto Disconnect", denyMe: "محروم مني", cameraDisconnect: "فصل عند تشغيل الكاميرا" };
const stopNames: Partial<Record<RuleKind, string>> = { protect: "Unprotect", blacklist: "شيل البلاك لست", pull: "Unpull", freeze: "فك التجميد", denyMe: "إلغاء محروم مني", cameraDisconnect: "إلغاء فصل الكاميرا" };
const persistentKinds = new Set<RuleKind>(["denyMe", "cameraDisconnect"]);
const rules = new Map<string, Rule>();
const cameraGuardGuilds = new Set<string>();
const slides = new Map<string, string>();
const slideMembers = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
const recent = new Map<string, number[]>();
const inFlight = new Set<string>();
const cooldowns = new Map<string, ReturnType<typeof setTimeout>>();
const work = new Map<string, Promise<void>>();
const walking = new Map<string, symbol>();
const pauses = new Map<ReturnType<typeof setTimeout>, () => void>();
let revision = 0;
let generation = 0;
let running = false;
let batchBusy = false;
let pending: ReturnType<typeof setTimeout> | undefined;
let storageOwner: string | undefined;

function storageKey(owner: string) { return `mc5mr-voice-rules:${owner}`; }
function cameraGuardStorageKey(owner: string) { return `mc5mr-camera-guard:${owner}`; }

function savePersistentRules() {
    if (!storageOwner) return;
    const saved = [...rules.values()].filter(rule => persistentKinds.has(rule.kind)).map(({ kind, userId, guildId }) => ({ kind, userId, guildId }));
    void DataStore.set(storageKey(storageOwner), saved);
    void DataStore.set(cameraGuardStorageKey(storageOwner), [...cameraGuardGuilds]);
}

async function loadPersistentRules() {
    const owner = UserStore.getCurrentUser()?.id;
    if (!owner || storageOwner === owner) return;
    storageOwner = owner;
    const [saved, savedCameraGuards] = await Promise.all([DataStore.get(storageKey(owner)), DataStore.get(cameraGuardStorageKey(owner))]);
    if (storageOwner !== owner || UserStore.getCurrentUser()?.id !== owner) return;
    if (Array.isArray(saved)) {
        for (const item of saved) {
            if (!item || typeof item !== "object" || !("kind" in item) || !("userId" in item) || !("guildId" in item)) continue;
            const { kind, userId, guildId } = item;
            if ((kind !== "denyMe" && kind !== "cameraDisconnect") || typeof userId !== "string" || typeof guildId !== "string") continue;
            rules.set(ruleKey(kind, userId), { kind, userId, guildId, channelId: "" });
        }
    }
    cameraGuardGuilds.clear();
    if (Array.isArray(savedCameraGuards)) for (const guildId of savedCameraGuards) if (typeof guildId === "string") cameraGuardGuilds.add(guildId);
    publish();
    schedule();
}

function pause(delay: number) {
    return new Promise<void>(resolve => {
        const timer = setTimeout(() => { pauses.delete(timer); resolve(); }, delay);
        pauses.set(timer, resolve);
    });
}

function coolDown(userId: string, delay: number) {
    const previous = cooldowns.get(userId);
    if (previous) clearTimeout(previous);
    cooldowns.set(userId, setTimeout(() => { cooldowns.delete(userId); schedule(); }, delay));
}

function publish() {
    revision++;
    listeners.forEach(listener => listener());
}

function ruleKey(kind: RuleKind, userId: string, channelId = "") { return `${kind}:${userId}${kind === "blacklist" ? `:${channelId}` : ""}`; }

function voiceState(userId: string, guildId?: string) {
    return guildId && typeof VoiceStateStore.getVoiceState === "function" ? VoiceStateStore.getVoiceState(guildId, userId) : VoiceStateStore.getVoiceStateForUser(userId);
}

function voiceChannel(userId: string, guildId?: string) {
    const selected = userId === UserStore.getCurrentUser()?.id ? SelectedChannelStore.getVoiceChannelId?.() : undefined;
    const id = selected ?? voiceState(userId, guildId)?.channelId;
    return id ? ChannelStore.getChannel(id) : undefined;
}

function destinations(channel: Channel) {
    return GuildChannelStore.getChannels(channel.guild_id).VOCAL
        .map(entry => entry.channel)
        .filter(other => other.type === 2 && other.id !== channel.id && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, other) && PermissionStore.can(PermissionsBits.CONNECT, other) && PermissionStore.can(PermissionsBits.MOVE_MEMBERS, other));
}

function permitted(channel: Channel, change: MemberChange) {
    if (!channel.guild_id) return false;
    if (change.mute !== undefined && !PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) return false;
    if (change.deaf !== undefined && !PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel)) return false;
    if (change.channel_id !== undefined) {
        if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) return false;
        if (change.channel_id) {
            const destination = ChannelStore.getChannel(change.channel_id);
            if (!destination || destination.guild_id !== channel.guild_id || !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, destination) || !PermissionStore.can(PermissionsBits.CONNECT, destination)) return false;
        }
    }
    return true;
}

async function changeMember(userId: string, guildId: string, change: MemberChange) {
    const channel = voiceChannel(userId, guildId || undefined);
    const activeGuildId = guildId || channel?.guild_id;
    if (!channel || !activeGuildId || channel.guild_id !== activeGuildId || !permitted(channel, change)) throw new Error("الصلاحيات المطلوبة غير متاحة أو الشخص خرج من السيرفر.");
    const request = { url: Constants.Endpoints.GUILD_MEMBER(activeGuildId, userId), body: change, rejectWithError: true };
    await RestAPI.patch(request);
}

function removeUserRules(userId: string) {
    walking.delete(userId);
    for (const [key, rule] of rules) if (rule.userId === userId) rules.delete(key);
    savePersistentRules();
    publish();
}

function desiredChange(rule: Rule): MemberChange {
    const state = voiceState(rule.userId, rule.guildId || undefined);
    const activeGuildId = state?.channelId ? ChannelStore.getChannel(state.channelId)?.guild_id : undefined;
    if (!state?.channelId || !activeGuildId || (rule.guildId && activeGuildId !== rule.guildId)) return {};
    const change: MemberChange = {};
    if (rule.kind === "disconnect") return { channel_id: null };
    if (rule.kind === "denyMe") {
        const me = UserStore.getCurrentUser();
        const mine = me ? voiceState(me.id, activeGuildId) : undefined;
        return mine?.channelId === state.channelId ? { channel_id: null } : {};
    }
    if (rule.kind === "cameraDisconnect") return state.selfVideo ? { channel_id: null } : {};
    if (rule.kind === "mute" || rule.kind === "both") { if (!state.mute) change.mute = true; }
    if (rule.kind === "deaf" || rule.kind === "both") { if (!state.deaf) change.deaf = true; }
    if (rule.kind === "protect") {
        if (state.mute) change.mute = false;
        if (state.deaf) change.deaf = false;
        if (state.channelId !== rule.channelId) change.channel_id = rule.channelId;
    }
    if (rule.kind === "freeze" && state.channelId !== rule.channelId) change.channel_id = rule.channelId;
    if (rule.kind === "blacklist" && state.channelId === rule.channelId) change.channel_id = rule.destination ?? null;
    if (rule.kind === "pull") {
        const me = UserStore.getCurrentUser();
        const myChannel = me ? voiceChannel(me.id, rule.guildId) : undefined;
        if (myChannel?.guild_id === rule.guildId && myChannel.id !== state.channelId) change.channel_id = myChannel.id;
    }
    return change;
}

function queueChange(rule: Rule) {
    const key = ruleKey(rule.kind, rule.userId, rule.channelId);
    if (inFlight.has(key) || cooldowns.has(rule.userId)) return;
    const epoch = generation;
    let attempted: MemberChange | undefined;
    inFlight.add(key);
    const task = (work.get(rule.userId) ?? Promise.resolve()).then(async () => {
        if (!running || epoch !== generation || rules.get(key) !== rule || cooldowns.has(rule.userId)) return;
        const change = desiredChange(rule);
        if (!Object.keys(change).length) return;
        const now = Date.now();
        const attempts = (recent.get(rule.userId) ?? []).filter(time => now - time < 60_000);
        if (attempts.length >= 6) {
            if (!cooldowns.has(rule.userId)) {
                coolDown(rule.userId, Math.max(1000, 60_000 - (now - attempts[0])));
                showToast("توقفت تغييرات هذا الشخص مؤقتًا لكثرتها؛ القاعدة محفوظة وتُستأنف بعد المهلة.", Toasts.Type.FAILURE);
            }
            return;
        }
        attempts.push(now);
        recent.set(rule.userId, attempts);
        attempted = change;
        await changeMember(rule.userId, rule.guildId, change);
    }).catch(error => {
        if (epoch !== generation || rules.get(key) !== rule) return;
        if (error && typeof error === "object" && "status" in error && error.status === 429) {
            const seconds = "body" in error && error.body && typeof error.body === "object" && "retry_after" in error.body ? error.body.retry_after : 1;
            coolDown(rule.userId, typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.max(1000, Math.min(3_600_000, Math.ceil(seconds * 1000))) : 1000);
            showToast("دسكورد طلب مهلة؛ القاعدة محفوظة وستُستأنف بعدها.", Toasts.Type.FAILURE);
            return;
        }
        rules.delete(key);
        savePersistentRules();
        publish();
        showToast(String(error), Toasts.Type.FAILURE);
    }).finally(() => {
        if (epoch !== generation) return;
        inFlight.delete(key);
        if (work.get(rule.userId) === task) work.delete(rule.userId);
        const current = rules.get(key);
        if (running && current && !cooldowns.has(rule.userId)) {
            const next = desiredChange(current);
            if (Object.keys(next).length && (current !== rule || JSON.stringify(next) !== JSON.stringify(attempted))) schedule();
        }
    });
    work.set(rule.userId, task);
}

function queueCameraGuard(state: VoiceState, guildId: string) {
    if (state.userId === UserStore.getCurrentUser()?.id || !state.selfVideo || !cameraGuardGuilds.has(guildId)) return;
    const key = `camera-guard:${guildId}:${state.userId}`;
    if (inFlight.has(key) || cooldowns.has(state.userId)) return;
    const epoch = generation;
    inFlight.add(key);
    const task = (work.get(state.userId) ?? Promise.resolve()).then(async () => {
        const current = voiceState(state.userId, guildId);
        const me = UserStore.getCurrentUser();
        const mine = me ? voiceState(me.id, guildId) : undefined;
        if (!running || epoch !== generation || !cameraGuardGuilds.has(guildId) || !current?.selfVideo || !mine?.channelId || current.channelId !== mine.channelId || cooldowns.has(state.userId)) return;
        const now = Date.now();
        const attempts = (recent.get(state.userId) ?? []).filter(time => now - time < 60_000);
        if (attempts.length >= 6) {
            if (!cooldowns.has(state.userId)) coolDown(state.userId, Math.max(1000, 60_000 - (now - attempts[0])));
            return;
        }
        attempts.push(now);
        recent.set(state.userId, attempts);
        await changeMember(state.userId, guildId, { channel_id: null });
    }).catch(error => {
        if (epoch === generation && cameraGuardGuilds.has(guildId)) showToast(`تعذر فصل صاحب الكاميرا: ${String(error)}`, Toasts.Type.FAILURE);
    }).finally(() => {
        inFlight.delete(key);
        if (work.get(state.userId) === task) work.delete(state.userId);
    });
    work.set(state.userId, task);
}

function enforceCameraGuard(guildId: string, states?: VoiceState[]) {
    if (!cameraGuardGuilds.has(guildId)) return;
    const me = UserStore.getCurrentUser();
    const mine = me ? voiceState(me.id, guildId) : undefined;
    if (!mine?.channelId) return;
    const candidates = states ?? Object.values(VoiceStateStore.getVoiceStates(guildId));
    for (const state of candidates) {
        const channel = state.channelId ? ChannelStore.getChannel(state.channelId) : undefined;
        if (channel?.guild_id === guildId && state.channelId === mine.channelId) queueCameraGuard(state, guildId);
    }
}

function CameraGuardIcon({ className, active = false }: { className?: string; active?: boolean; }) {
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill={active ? "var(--status-danger)" : "currentColor"} d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v1.8l3.2-2a1.2 1.2 0 0 1 1.8 1v9.4a1.2 1.2 0 0 1-1.8 1l-3.2-2v1.8a2.5 2.5 0 0 1-2.5 2h-8A2.5 2.5 0 0 1 4 17.5z" /></svg>;
}

function CameraGuardButton() {
    React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision);
    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) return null;
    const active = cameraGuardGuilds.has(guildId);
    const Icon = (props: { className?: string; }) => <CameraGuardIcon {...props} active={active} />;
    return <HeaderBarButton icon={Icon} tooltip={active ? "إيقاف فصل الكاميرا في رومي" : "فصل من يشغل الكاميرا في رومي"} onClick={() => {
        if (active) cameraGuardGuilds.delete(guildId);
        else cameraGuardGuilds.add(guildId);
        savePersistentRules();
        publish();
        if (!active) enforceCameraGuard(guildId);
        showToast(active ? "تم إيقاف فصل الكاميرا في رومك." : "تم تفعيل فصل من يشغل الكاميرا في رومك فقط.", Toasts.Type.SUCCESS);
    }} />;
}

function reconcile() {
    if (!running) return;
    const me = UserStore.getCurrentUser();
    if (!me) return;
    for (const rule of rules.values()) {
        if (Object.keys(desiredChange(rule)).length) queueChange(rule);
    }
    for (const [sourceId, destination] of slides) {
        const source = ChannelStore.getChannel(sourceId);
        if (!source?.guild_id) continue;
        const occupants = new Set(Object.values(VoiceStateStore.getVoiceStatesForChannel(sourceId)).map(state => state.userId));
        const previous = slideMembers.get(sourceId) ?? new Set<string>();
        slideMembers.set(sourceId, occupants);
        for (const state of Object.values(VoiceStateStore.getVoiceStatesForChannel(sourceId))) {
            if (previous.has(state.userId) || state.userId === me.id || rules.has(ruleKey("protect", state.userId))) continue;
            const key = ruleKey("blacklist", state.userId, sourceId);
            if (!rules.has(key)) {
                const rule: Rule = { kind: "blacklist", userId: state.userId, guildId: source.guild_id, channelId: sourceId, destination };
                rules.set(key, rule);
                queueChange(rule);
                publish();
            }
        }
    }
}

function schedule() {
    if (!running || (!rules.size && !slides.size)) return;
    if (pending) return;
    pending = setTimeout(() => {
        pending = undefined;
        reconcile();
    }, 0);
}

function toggleRule(kind: RuleKind, userId: string, channel: Channel) {
    if (!channel.guild_id) return;
    walking.delete(userId);
    const key = ruleKey(kind, userId, channel.id);
    if (rules.has(key)) rules.delete(key);
    else {
        // Mute and deafen may coexist. Movement rules and protect conflict.
        const compatible = (kind === "mute" || kind === "deaf");
        for (const [otherKey, other] of rules) if (other.userId === userId && !(kind === "blacklist" && other.kind === "blacklist") && !(compatible && (other.kind === "mute" || other.kind === "deaf"))) rules.delete(otherKey);
        rules.set(key, { kind, userId, guildId: channel.guild_id, channelId: channel.id });
    }
    savePersistentRules();
    publish();
    schedule();
}

function togglePersistentRule(kind: "denyMe" | "cameraDisconnect", userId: string, guildId: string) {
    const key = ruleKey(kind, userId);
    if (rules.has(key)) rules.delete(key);
    else rules.set(key, { kind, userId, guildId, channelId: "" });
    savePersistentRules();
    publish();
    schedule();
    showToast(rules.has(key) ? `تم تفعيل ${names[kind]}.` : `تم إلغاء ${names[kind]}.`, Toasts.Type.SUCCESS);
}

function clearAll(clearSaved = true) {
    generation++;
    rules.clear();
    cameraGuardGuilds.clear();
    slides.clear();
    slideMembers.clear();
    recent.clear();
    work.clear();
    inFlight.clear();
    walking.clear();
    batchBusy = false;
    if (pending) clearTimeout(pending);
    pending = undefined;
    for (const [timer, resolve] of pauses) { clearTimeout(timer); resolve(); }
    pauses.clear();
    for (const timer of cooldowns.values()) clearTimeout(timer);
    cooldowns.clear();
    if (clearSaved) savePersistentRules();
    publish();
}

async function batch(channel: Channel, destination: string) {
    if (batchBusy || !channel.guild_id) return;
    batchBusy = true;
    const epoch = generation;
    try {
        const ids = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id)).map(state => state.userId);
        for (const [index, id] of ids.entries()) {
            if (!running || epoch !== generation) break;
            if (voiceChannel(id)?.id !== channel.id) continue;
            await changeMember(id, channel.guild_id, { channel_id: destination });
            if (!running || epoch !== generation) break;
            if (index < ids.length - 1) await pause(300);
        }
        if (epoch === generation) showToast("اكتمل نقل الأعضاء.", Toasts.Type.SUCCESS);
    } catch (error) {
        showToast(`توقف النقل: ${String(error)}`, Toasts.Type.FAILURE);
    } finally { if (epoch === generation) batchBusy = false; }
}

async function walk(userId: string, channel: Channel, returnToStart: boolean) {
    if (batchBusy || walking.has(userId) || !channel.guild_id) return;
    const epoch = generation;
    removeUserRules(userId);
    const token = Symbol();
    walking.set(userId, token);
    try {
        const route = destinations(channel);
        for (const [index, destination] of route.entries()) {
            if (!running || epoch !== generation || walking.get(userId) !== token) return;
            await changeMember(userId, channel.guild_id, { channel_id: destination.id });
            if (!running || epoch !== generation || walking.get(userId) !== token) return;
            if (index < route.length - 1 || returnToStart) await pause(1500);
        }
        if (running && epoch === generation && walking.get(userId) === token && returnToStart) await changeMember(userId, channel.guild_id, { channel_id: channel.id });
    } catch (error) {
        showToast(`توقف الوالك: ${String(error)}`, Toasts.Type.FAILURE);
    } finally { if (walking.get(userId) === token) walking.delete(userId); }
}

function stopSlide(id: string) {
    slides.delete(id);
    slideMembers.delete(id);
    for (const [key, rule] of rules) if (rule.kind === "blacklist" && rule.channelId === id && rule.destination) rules.delete(key);
    publish();
}

function listItem(kind: RuleKind, channelId: string) {
    const list = [...rules.values()].filter(rule => rule.kind === kind && rule.channelId === channelId);
    const label = ({ protect: "Protected List", blacklist: "Blacklist List", pull: "Pull List", freeze: "🧊 Freeze list" } as Partial<Record<RuleKind, string>>)[kind] ?? names[kind];
    return <Menu.MenuItem key={kind} id={`mc5mr-list-${kind}`} label={`${label} (${list.length})`}>
        {list.length ? list.map(rule => <Menu.MenuItem key={rule.userId} id={`mc5mr-list-${kind}-${rule.userId}`} label={UserStore.getUser(rule.userId)?.globalName || UserStore.getUser(rule.userId)?.username || rule.userId}>
            <Menu.MenuItem id={`mc5mr-remove-${kind}-${rule.userId}`} label="إزالة من القائمة" action={() => { rules.delete(ruleKey(kind, rule.userId, rule.channelId)); publish(); }} />
        </Menu.MenuItem>) : <Menu.MenuItem id={`mc5mr-empty-${kind}`} label="القائمة فارغة" disabled />}
    </Menu.MenuItem>;
}

const userContext: NavContextMenuPatchCallback = (children, { user, guildId, channelId }: { user: User; guildId?: string; channelId?: string; }) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;
    const contextGuild = guildId ?? ChannelStore.getChannel(channelId ?? "")?.guild_id ?? SelectedGuildStore.getGuildId();
    const persistentItem = (kind: "denyMe" | "cameraDisconnect") => <Menu.MenuItem key={kind} id={`mc5mr-rule-${kind}`} label={rules.has(ruleKey(kind, user.id)) ? stopNames[kind] : names[kind]} action={() => togglePersistentRule(kind, user.id, contextGuild ?? "")} />;
    const source = voiceChannel(user.id, contextGuild);
    const mine = voiceChannel(UserStore.getCurrentUser()?.id ?? "");
    const contextChannel = ChannelStore.getChannel(channelId ?? "");
    const channel = source?.guild_id ? source : mine?.guild_id && (!contextGuild || mine.guild_id === contextGuild) ? mine : contextChannel?.type === 2 ? contextChannel : undefined;
    const anchor = (kind: RuleKind) => kind === "blacklist" || kind === "pull" ? (contextChannel?.type === 2 ? contextChannel : mine?.guild_id && (!contextGuild || mine.guild_id === contextGuild) ? mine : undefined) : channel;
    const activeKey = (kind: RuleKind) => ruleKey(kind, user.id, anchor(kind)?.id);
    const toggle = (kind: RuleKind) => {
        const key = activeKey(kind);
        if (rules.has(key)) { rules.delete(key); publish(); return; }
        const target = anchor(kind);
        if (!target?.guild_id) { showToast("افتح القائمة من السيرفر وأنت داخل الروم الذي تريد ربط القاعدة به.", Toasts.Type.FAILURE); return; }
        if ((kind === "freeze" || kind === "protect") && !source) { showToast("الشخص يحتاج يكون داخل روم لتثبيته وحفظ مكانه.", Toasts.Type.FAILURE); return; }
        const change = kind === "protect" ? { mute: false, deaf: false, channel_id: target.id } : kind === "mute" ? { mute: true } : kind === "deaf" ? { deaf: true } : kind === "both" ? { mute: true, deaf: true } : { channel_id: null };
        if (!permitted(target, change)) { showToast("رتبتك لا تملك صلاحيات هذا الأمر في الروم.", Toasts.Type.FAILURE); return; }
        toggleRule(kind, user.id, target);
        showToast(`${names[kind]} · ${target.name}`, Toasts.Type.SUCCESS);
    };
    const beginWalk = (returnToStart: boolean) => {
        const current = voiceChannel(user.id);
        if (!current?.guild_id) { showToast("الشخص ليس داخل روم صوت الآن.", Toasts.Type.FAILURE); return; }
        if (batchBusy || walking.has(user.id)) { showToast("انتظر اكتمال عملية نقل هذا الشخص.", Toasts.Type.FAILURE); return; }
        if (!permitted(current, { channel_id: null })) { showToast("تحتاج صلاحية نقل الأعضاء.", Toasts.Type.FAILURE); return; }
        void walk(user.id, current, returnToStart);
    };
    children.push(<Menu.MenuGroup key="mc5mr-voice-actions">
        {persistentItem("denyMe")}
        {persistentItem("cameraDisconnect")}
        {(["disconnect", "mute", "deaf", "protect", "blacklist", "pull", "freeze"] as RuleKind[]).map(kind => <Menu.MenuItem key={kind} id={`mc5mr-rule-${kind}`} label={rules.has(activeKey(kind)) ? stopNames[kind] ?? `إيقاف ${names[kind]}` : names[kind]} action={() => toggle(kind)} />)}
        <Menu.MenuItem id="mc5mr-walk" label="Walk" action={() => beginWalk(false)} />
        <Menu.MenuItem id="mc5mr-walk-return" label="Walk & Return" action={() => beginWalk(true)} />
        {(walking.has(user.id) || [...rules.values()].some(rule => rule.userId === user.id)) && <Menu.MenuItem id="mc5mr-stop-user" label="إيقاف أكشنز هذا الشخص" action={() => removeUserRules(user.id)} />}
    </Menu.MenuGroup>);
};

const channelContext: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel?.guild_id || channel.type !== 2) return;
    const targetChannels = destinations(channel);
    const canMove = PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);
    mergeVoiceTools(children, [
        <Menu.MenuItem key="mc5mr-move-all" id="mc5mr-move-all" label="Random Room" disabled={!canMove || batchBusy}>
            {targetChannels.map(destination => <Menu.MenuItem key={destination.id} id={`mc5mr-all-${destination.id}`} label={destination.name} action={() => void batch(channel, destination.id)} />)}
        </Menu.MenuItem>,
        <Menu.MenuItem key="mc5mr-slide" id="mc5mr-slide" label="الزحلقة" disabled={!canMove}>
            {targetChannels.map(destination => <Menu.MenuItem key={destination.id} id={`mc5mr-slide-${destination.id}`} label={destination.name} action={() => {
                slides.set(channel.id, destination.id);
                slideMembers.set(channel.id, new Set(Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id)).map(state => state.userId)));
                publish();
            }} />)}
        </Menu.MenuItem>,
        slides.has(channel.id) && <Menu.MenuItem id="mc5mr-slide-stop" label="إيقاف الزحلقة" action={() => stopSlide(channel.id)} />,
        ...(["protect", "blacklist", "pull", "freeze"] as RuleKind[]).map(kind => listItem(kind, channel.id)),
        <Menu.MenuItem key="mc5mr-stop-all" id="mc5mr-stop-all" label="إيقاف كل الأكشنز والعمليات" action={() => clearAll()} />
    ]);
};

export default definePlugin({
    name: "VoiceLists",
    description: "Permission-checked voice rules, pull, protect, room lists, walks, and channel movement tools.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Utility", "Voice"],
    settingsAboutComponent: () => <p dir="rtl">الأوامر من كليك يمين على الشخص. القوائم وإيقاف الأكشنز من Voice Tools عند كليك يمين على الروم. التنفيذ يتطلب صلاحيات رتبتك.</p>,
    headerBarButton: { priority: -24, icon: CameraGuardIcon, render: () => <CameraGuardButton /> },
    contextMenus: { "user-context": userContext, "channel-context": channelContext },
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates?: VoiceState[]; } = {}) {
            if (!running || (!rules.size && !slides.size && !cameraGuardGuilds.size)) return;
            if (voiceStates && cameraGuardGuilds.size) {
                const byGuild = new Map<string, VoiceState[]>();
                for (const state of voiceStates) {
                    const guildId = state.channelId ? ChannelStore.getChannel(state.channelId)?.guild_id : undefined;
                    if (!guildId || !cameraGuardGuilds.has(guildId)) continue;
                    const list = byGuild.get(guildId) ?? [];
                    list.push(state);
                    byGuild.set(guildId, list);
                }
                for (const guildId of byGuild.keys()) enforceCameraGuard(guildId);
            }
            const users = new Set([...rules.values()].map(rule => rule.userId));
            if (!rules.size && !slides.size) return;
            if (voiceStates && !voiceStates.some(state => state.userId === UserStore.getCurrentUser()?.id || slides.has(state.channelId ?? "") || [...slideMembers.values()].some(members => members.has(state.userId)) || users.has(state.userId))) return;
            schedule();
        },
        CONNECTION_OPEN() { void loadPersistentRules(); },
        LOGOUT() { clearAll(false); storageOwner = undefined; }
    },
    start() { running = true; void loadPersistentRules(); },
    stop() {
        running = false;
        clearAll(false);
        storageOwner = undefined;
        if (pending) clearTimeout(pending);
        pending = undefined;
    }
});
