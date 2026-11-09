/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sleep } from "@utils/misc";
import { ChannelStore, Constants, GuildMemberStore, GuildStore, IconUtils, PermissionsBits, PermissionStore, RestAPI, UserStore } from "@webpack/common";

export interface CloneOptions { roles: boolean; clearRoles: boolean; channels: boolean; clearChannels: boolean; permissions: boolean; settings: boolean; icon: boolean; emojis: boolean; }
export interface ApiRole { id: string; name: string; position: number; managed: boolean; permissions: string; color: number; hoist: boolean; mentionable: boolean; tags?: { bot_id?: string; }; }
export interface Overwrite { id: string; type: number; allow: string; deny: string; }
interface ApiChannel { id: string; name: string; type: number; position: number; parent_id?: string | null; permission_overwrites?: Overwrite[]; topic?: string | null; nsfw?: boolean; bitrate?: number; user_limit?: number; rate_limit_per_user?: number; rtc_region?: string | null; video_quality_mode?: number; available_tags?: { name: string; moderated: boolean; emoji_name?: string | null; }[]; default_auto_archive_duration?: number; default_thread_rate_limit_per_user?: number; default_forum_layout?: number; default_sort_order?: number | null; }
interface ApiEmoji { id: string; name: string; animated: boolean; roles: string[]; }
export interface CloneProgress { log(text: string): void; cancelled(): boolean; }
const supportedChannels = new Set([0, 2, 4, 5, 13, 15, 16]);

export function mapOverwrites(overwrites: Overwrite[], roleMap: Map<string, string>, validMembers: Set<string>): Overwrite[] {
    return overwrites.map(overwrite => {
        const id = overwrite.type === 0 ? roleMap.get(overwrite.id) : validMembers.has(overwrite.id) ? overwrite.id : undefined;
        if (!id) throw new Error("توجد صلاحية قناة لا يمكن نقل صاحبها؛ أوقفنا إنشاءها لتجنب تغيير خصوصيتها.");
        return { id, type: overwrite.type, allow: String(overwrite.allow), deny: String(overwrite.deny) };
    });
}

export function rolesToDelete(roles: ApiRole[], guildId: string, memberRoles: string[], isOwner: boolean) {
    const highest = isOwner ? Infinity : Math.max(0, ...roles.filter(role => memberRoles.includes(role.id)).map(role => role.position));
    return roles.filter(role => role.id !== guildId && !role.managed && !memberRoles.includes(role.id) && role.position < highest);
}

async function asset(url: string, maxBytes: number) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["cdn.discordapp.com", "media.discordapp.net"].includes(parsed.hostname)) throw new Error("رابط الصورة ليس من CDN الخاص بـ Discord.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("تعذر قراءة صورة Discord.");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > maxBytes) throw new Error("الصورة كبيرة أو غير مدعومة.");
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر تحويل الصورة."));
        reader.onerror = () => reject(new Error("تعذر تحويل الصورة."));
        reader.readAsDataURL(blob);
    });
}

export async function cloneStructure(sourceId: string, targetId: string, options: CloneOptions, progress: CloneProgress) {
    const owner = UserStore.getCurrentUser()?.id;
    const source = GuildStore.getGuild(sourceId);
    const target = GuildStore.getGuild(targetId);
    if (!owner || !source || !target || sourceId === targetId) throw new Error("اختر سيرفر مصدر وسيرفر هدف مختلفين.");
    if (options.permissions && !options.roles) throw new Error("فعّل الرولات حتى تُنقل الصلاحيات إلى الرولات الصحيحة.");
    const check = () => {
        if (progress.cancelled() || UserStore.getCurrentUser()?.id !== owner) throw new Error("أُوقفت العملية؛ التغييرات المكتملة تبقى في الهدف.");
        if (!PermissionStore.can(PermissionsBits.ADMINISTRATOR, target)) throw new Error("تحتاج Administrator في السيرفر الهدف.");
    };
    check();
    const endpoints = Constants.Endpoints;
    for (const key of ["GUILD", "GUILD_ROLES", "GUILD_ROLE", "GUILD_CHANNELS", "CHANNEL", "GUILD_EMOJIS", "GUILD_MEMBER"]) if (typeof endpoints[key] !== "function") throw new Error(`مسار ${key} غير متاح في نسخة Discord؛ لم تبدأ التغييرات.`);
    async function post<T>(url: string, body: Record<string, unknown>) {
        check();
        const response = await RestAPI.post({ url, body });
        await sleep(1000);
        return response.body as T;
    }
    async function patch(url: string, body: Record<string, unknown> | Record<string, unknown>[]) { check(); await RestAPI.patch({ url, body }); await sleep(1000); }
    async function remove(url: string) { check(); await RestAPI.del({ url }); await sleep(1000); }
    const sourceRoles = (await RestAPI.get({ url: endpoints.GUILD_ROLES(sourceId) })).body as ApiRole[];
    const targetRoles = (await RestAPI.get({ url: endpoints.GUILD_ROLES(targetId) })).body as ApiRole[];
    const sourceChannels = options.channels ? (await RestAPI.get({ url: endpoints.GUILD_CHANNELS(sourceId) })).body as ApiChannel[] : [];
    if (!Array.isArray(sourceRoles) || !Array.isArray(targetRoles) || !Array.isArray(sourceChannels)) throw new Error("تعذر قراءة بنية السيرفرين.");
    const channels = sourceChannels.filter(channel => {
        const cached = ChannelStore.getChannel(channel.id);
        const allowed = supportedChannels.has(channel.type) && cached && PermissionStore.can(PermissionsBits.VIEW_CHANNEL, cached);
        if (!allowed) progress.log(`لم تُنسخ قناة غير متاحة أو غير مدعومة: ${channel.id}`);
        return allowed;
    });
    const channelIds = new Set(channels.map(channel => channel.id));
    if (channels.some(channel => channel.parent_id && !channelIds.has(channel.parent_id))) throw new Error("توجد قناة بقسم أب غير متاح للنسخ؛ لم تبدأ التغييرات.");
    const roleMap = new Map<string, string>([[sourceId, targetId]]);
    for (const role of sourceRoles.filter(role => role.managed)) {
        const matching = role.tags?.bot_id ? targetRoles.find(other => other.managed && other.tags?.bot_id === role.tags?.bot_id) : undefined;
        if (matching) roleMap.set(role.id, matching.id);
    }
    const validMembers = new Set<string>();
    const plannedRoleIds = new Set([...roleMap.keys(), ...(options.roles ? sourceRoles.map(role => role.id) : [])]);
    if (options.permissions && options.channels) {
        const members = new Set<string>();
        for (const channel of channels) for (const overwrite of channel.permission_overwrites ?? []) {
            if (overwrite.type === 0 && !plannedRoleIds.has(overwrite.id)) throw new Error("تحتاج قناة إلى رول Integration غير موجود في الهدف؛ لم تبدأ التغييرات.");
            if (overwrite.type === 1) members.add(overwrite.id);
        }
        for (const id of members) {
            check();
            const member = await RestAPI.get({ url: endpoints.GUILD_MEMBER(targetId, id) });
            if (member.body?.user?.id !== id) throw new Error("توجد صلاحية خاصة بعضو غير موجود في الهدف؛ لم تبدأ التغييرات.");
            validMembers.add(id);
            await sleep(1000);
        }
    }
    progress.log("اكتمل فحص الرولات والصلاحيات. ستتغير بنية السيرفر الهدف فقط.");
    if (options.roles) {
        const member = GuildMemberStore.getMember(targetId, owner);
        if (options.clearRoles) for (const role of rolesToDelete(targetRoles, targetId, member?.roles ?? [], target.ownerId === owner)) {
            await remove(endpoints.GUILD_ROLE(targetId, role.id)); progress.log(`حُذف رول هدف: ${role.name}`);
        }
        const createdRoles: { id: string; position: number; }[] = [];
        for (const role of sourceRoles.filter(role => role.id !== sourceId && !roleMap.has(role.id)).sort((a, b) => a.position - b.position)) {
            const created = await post<ApiRole>(endpoints.GUILD_ROLES(targetId), { name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: options.permissions ? String(role.permissions) : "0" });
            if (!created.id) throw new Error("لم يُرجع Discord أيدي الرول المنشأ.");
            roleMap.set(role.id, created.id);
            createdRoles.push({ id: created.id, position: createdRoles.length + 1 });
            progress.log(`${role.managed ? "نُسخ رول التكامل كرول عادي" : "نُسخ رول"}: ${role.name}`);
        }
        if (createdRoles.length) await patch(endpoints.GUILD_ROLES(targetId), createdRoles);
    }
    const channelMap = new Map<string, string>();
    const finalOverwrites = new Map<string, Overwrite[]>();
    if (options.channels) {
        if (options.clearChannels) {
            const targetChannels = (await RestAPI.get({ url: endpoints.GUILD_CHANNELS(targetId) })).body as ApiChannel[];
            if (!Array.isArray(targetChannels)) throw new Error("تعذر قراءة قنوات الهدف قبل الحذف.");
            for (const channel of targetChannels.sort((a, b) => Number(a.type === 4) - Number(b.type === 4))) { await remove(endpoints.CHANNEL(channel.id)); progress.log(`حُذفت قناة هدف: ${channel.name}`); }
        }
        const ordered = [...channels.filter(channel => channel.type === 4), ...channels.filter(channel => channel.type !== 4)].sort((a, b) => Number(b.type === 4) - Number(a.type === 4) || a.position - b.position);
        for (const channel of ordered) {
            if (channel.parent_id && !channelMap.has(channel.parent_id)) throw new Error("تعذر نقل القسم الأب لهذه القناة؛ لم ننشئها خارج قسمها.");
            const body: Record<string, unknown> = { name: channel.name, type: channel.type, position: channel.position, parent_id: channel.parent_id ? channelMap.get(channel.parent_id) : null };
            for (const key of ["topic", "nsfw", "user_limit", "rate_limit_per_user", "rtc_region", "video_quality_mode", "default_auto_archive_duration", "default_thread_rate_limit_per_user", "default_forum_layout", "default_sort_order"] as const) if (channel[key] !== undefined) body[key] = channel[key];
            if (channel.bitrate !== undefined) body.bitrate = Math.min(channel.bitrate, channel.type === 13 ? 64000 : target.features.has("VIP_REGIONS") ? 384000 : [96000, 128000, 256000, 384000][target.premiumTier] ?? 96000);
            if (channel.available_tags) body.available_tags = channel.available_tags.map(tag => ({ name: tag.name, moderated: tag.moderated, emoji_name: tag.emoji_name ?? null }));
            const overwrites = options.permissions ? mapOverwrites(channel.permission_overwrites ?? [], roleMap, validMembers) : [];
            if (options.permissions) {
                const everyone = overwrites.find(overwrite => overwrite.id === targetId && overwrite.type === 0);
                body.permission_overwrites = [...overwrites.filter(overwrite => overwrite.id !== targetId).map(overwrite => ({ ...overwrite, allow: String(BigInt(overwrite.allow) & ~PermissionsBits.VIEW_CHANNEL), deny: String(BigInt(overwrite.deny) | PermissionsBits.VIEW_CHANNEL) })), { id: targetId, type: 0, allow: String(BigInt(everyone?.allow ?? "0") & ~PermissionsBits.VIEW_CHANNEL), deny: String(BigInt(everyone?.deny ?? "0") | PermissionsBits.VIEW_CHANNEL) }];
            }
            const created = await post<ApiChannel>(endpoints.GUILD_CHANNELS(targetId), body);
            if (!created.id) throw new Error("لم يُرجع Discord أيدي القناة المنشأة.");
            channelMap.set(channel.id, created.id);
            if (options.permissions) finalOverwrites.set(created.id, overwrites);
            progress.log(`نُسخت قناة: ${channel.name}`);
        }
    }
    if (options.emojis) {
        const emojis = (await RestAPI.get({ url: endpoints.GUILD_EMOJIS(sourceId) })).body as ApiEmoji[];
        if (!Array.isArray(emojis)) throw new Error("تعذر قراءة الإيموجيات.");
        for (const emoji of emojis) {
            check();
            const roles = emoji.roles.map(id => roleMap.get(id));
            if (roles.some(id => !id)) throw new Error("لا يمكن نقل قيد رول لإيموجي؛ أوقفنا نسخه.");
            const image = await asset(IconUtils.getEmojiURL({ id: emoji.id, animated: emoji.animated, size: 128 }), 256 * 1024);
            await post(endpoints.GUILD_EMOJIS(targetId), { name: emoji.name, image, roles }); progress.log(`نُسخ إيموجي: ${emoji.name}`);
        }
    }
    if (options.icon && source.icon) {
        const url = IconUtils.getGuildIconURL({ id: sourceId, icon: source.icon, size: 512 });
        if (!url) throw new Error("تعذر قراءة أيقونة المصدر.");
        const icon = await asset(url, 2 * 1024 * 1024);
        await patch(endpoints.GUILD(targetId), { icon }); progress.log("نُسخت أيقونة السيرفر.");
    }
    if (options.settings) {
        const body: Record<string, unknown> = { name: source.name, description: source.description, verification_level: source.verificationLevel, default_message_notifications: source.defaultMessageNotifications, explicit_content_filter: source.explicitContentFilter, afk_timeout: source.afkTimeout };
        if (source.afkChannelId && channelMap.has(source.afkChannelId)) body.afk_channel_id = channelMap.get(source.afkChannelId);
        if (source.systemChannelId && channelMap.has(source.systemChannelId)) body.system_channel_id = channelMap.get(source.systemChannelId);
        await patch(endpoints.GUILD(targetId), body); progress.log("نُسخت إعدادات السيرفر الأساسية.");
    }
    if (options.permissions) {
        const everyone = sourceRoles.find(role => role.id === sourceId);
        if (everyone) { await patch(endpoints.GUILD_ROLE(targetId, targetId), { permissions: String(everyone.permissions) }); progress.log("نُقلت صلاحيات @everyone بعد إنشاء القنوات وصلاحياتها."); }
        for (const [id, permission_overwrites] of finalOverwrites) await patch(endpoints.CHANNEL(id), { permission_overwrites });
    }
    check();
    progress.log(`اكتمل النسخ إلى ${target.name}. نُسخ ${roleMap.size - 1} ربط رول و${channelMap.size} قناة. رولات التكامل الجديدة عادية، ولم تُنسخ عضويات أو رسائل.`);
}
