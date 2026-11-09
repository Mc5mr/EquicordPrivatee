/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Constants, RestAPI, UserStore } from "@webpack/common";

const busy = new Set<string>();
let running = false;
let generation = 0;
// Supported by Discord's HTTP client; the published types omit this option.
const checked = <T extends object>(request: T) => ({ ...request, rejectWithError: true });

export function describeFailure(error: unknown) {
    const value = error as { body?: { message?: string; code?: number; }; status?: number; message?: string; };
    return [value?.body?.message ?? value?.message ?? String(error), value?.status ? `HTTP ${value.status}` : "", value?.body?.code ? `Discord ${value.body.code}` : ""].filter(Boolean).join(" · ");
}

async function originalMessage(message: Message) {
    let initialError: unknown;
    try {
        const response = await RestAPI.get(checked({ url: Constants.Endpoints.MESSAGE(message.channel_id, message.id) }));
        if (response.body?.id === message.id) return response.body;
        initialError = new Error("لم يُرجع مسار الرسالة المفردة بياناتها.");
    } catch (error) { initialError = error; }
    // Some user clients cannot use the single-message route. Verify ownership
    // again from the server's surrounding-message list, not from a local preview.
    const response = await RestAPI.get(checked({ url: Constants.Endpoints.MESSAGES(message.channel_id), query: { around: message.id, limit: 1 } }));
    const original = Array.isArray(response.body) ? response.body.find(item => item.id === message.id) : undefined;
    if (!original) throw new Error(`تعذر العثور على الرسالة الأصلية: ${describeFailure(initialError)}`);
    return original;
}

export async function replaceMessage(message: Message, content: string, removeReplacement: boolean, allowed = () => true) {
    const owner = UserStore.getCurrentUser()?.id;
    if (!running || !owner || message.author.id !== owner) throw new Error("هذه الميزة لرسائلك أنت فقط.");
    if (message.attachments?.length || message.stickerItems?.length || message.poll) throw new Error("الاستبدال يدعم الرسائل النصية فقط؛ لن نحذف مرفقات أو استطلاعًا.");
    if (!content.trim() || content.length > 2000) throw new Error("النص من 1 إلى 2000 حرف.");
    const key = `${message.channel_id}:${message.id}`;
    if (busy.has(key)) throw new Error("هذه الرسالة قيد المعالجة.");
    const epoch = generation;
    const assertCurrent = () => {
        if (!running || !allowed() || epoch !== generation || UserStore.getCurrentUser()?.id !== owner) throw new Error("توقف البلوقن أو تغير الحساب؛ أُلغي باقي الخطوات.");
    };
    busy.add(key);
    let replacementId: string | undefined;
    let removedReplacement = false;
    try {
        const original = await originalMessage(message);
        if (original.author?.id !== owner || original.id !== message.id) throw new Error("تعذر تأكيد ملكية الرسالة الأصلية.");
        if (original.attachments?.length || original.sticker_items?.length || original.poll) throw new Error("تحتوي الرسالة على مرفقات أو استطلاع؛ لن تُحذف.");
        assertCurrent();
        const reference = message.messageReference;
        const response = await RestAPI.post(checked({
            url: Constants.Endpoints.MESSAGES(message.channel_id),
            body: {
                content,
                nonce: message.id,
                flags: 4096,
                tts: false,
                allowed_mentions: { parse: [], replied_user: false },
                ...(reference ? { message_reference: { message_id: reference.message_id, channel_id: reference.channel_id, guild_id: reference.guild_id, fail_if_not_exists: false } } : {})
            }
        }));
        if (typeof response.body?.id !== "string" || response.body.id === message.id || response.body?.author?.id !== owner) throw new Error("لم نحصل على رسالة بديلة مؤكدة؛ لم نحذف الأصل.");
        replacementId = response.body.id;
        assertCurrent();
        if (removeReplacement) {
            await RestAPI.del(checked({ url: Constants.Endpoints.MESSAGE(message.channel_id, replacementId) }));
            removedReplacement = true;
            assertCurrent();
        }
        await RestAPI.del(checked({ url: Constants.Endpoints.MESSAGE(message.channel_id, message.id) }));
        return replacementId;
    } catch (error) {
        if (replacementId) throw new Error(`${removedReplacement ? "حُذفت الرسالة المؤقتة." : "أُرسلت الرسالة البديلة."} لم تكتمل إزالة الأصل. راجع الشات قبل المحاولة مجددًا. ${describeFailure(error)}`);
        throw new Error(describeFailure(error));
    } finally { busy.delete(key); }
}

export default definePlugin({
    name: "SilentMessageCore",
    description: "Shared ownership-checked message replacement for Silent Edit and Silent Delete.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "Aurick", id: 1348025017233047634n }],
    hidden: true,
    start() { running = true; generation++; },
    stop() { running = false; generation++; },
    flux: { LOGOUT() { generation++; } }
});
