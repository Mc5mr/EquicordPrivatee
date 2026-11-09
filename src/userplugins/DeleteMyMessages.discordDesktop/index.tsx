/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateId, sendBotMessage } from "@api/Commands";
import { updateMessage } from "@api/MessageUpdater";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, closeModal, ConfirmModal, Constants, FluxDispatcher, MessageStore, openModal, RestAPI, SnowflakeUtils, UserStore } from "@webpack/common";

interface HistoryMessage { id: string; channel_id: string; author: { id: string; }; type: number; }
interface Job {
    channelId: string;
    owner: string;
    reportId: string;
    ids: Set<string>;
    deleted: number;
    missing: number;
    scanned: boolean;
    cancelled: boolean;
    confirming: boolean;
    timer?: ReturnType<typeof setTimeout>;
    resume?: () => void;
}

const MODAL_KEY = "mc5mr-delete-my-messages";
const MESSAGE_TYPES = new Set([0, 6, 19, 20, 23, 44, 46]);
let enabled = false;
let current: Job | undefined;

function active(job: Job) {
    return enabled && current === job && !job.cancelled && UserStore.getCurrentUser()?.id === job.owner;
}

function check(job: Job) {
    if (!active(job)) throw new Error("Deletion stopped.");
    const channel = ChannelStore.getChannel(job.channelId);
    if (!channel || channel.guild_id || (channel.type !== 1 && channel.type !== 3)) throw new Error("Conversation unavailable.");
    return channel;
}

function report(job: Job, content: string) {
    if (UserStore.getCurrentUser()?.id !== job.owner) return;
    if (MessageStore.getMessage(job.channelId, job.reportId)) updateMessage(job.channelId, job.reportId, { content });
    else sendBotMessage(job.channelId, { id: job.reportId, content });
}

function cancel() {
    if (!current) return;
    current.cancelled = true;
    report(current, "جارٍ إيقاف العملية. الطلب الجاري قد يكتمل؛ لن تبدأ طلبات جديدة.");
    current.resume?.();
    if (current.confirming) closeModal(MODAL_KEY);
}

async function pause(job: Job, milliseconds: number) {
    check(job);
    await new Promise<void>(resolve => {
        const finish = () => {
            clearTimeout(job.timer);
            job.timer = undefined;
            job.resume = undefined;
            resolve();
        };
        job.resume = finish;
        job.timer = setTimeout(finish, milliseconds);
    });
    check(job);
}

function status(error: unknown) {
    return error && typeof error === "object" && "status" in error ? error.status : undefined;
}

async function request<T>(job: Job, send: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        check(job);
        try {
            const result = await send();
            if (result && typeof result === "object" && (("ok" in result && result.ok === false) || ("status" in result && typeof result.status === "number" && result.status >= 400))) throw result;
            return result;
        }
        catch (error) {
            if (status(error) !== 429 || attempt >= 5) throw error;
            const body = error && typeof error === "object" && "body" in error ? error.body : undefined;
            const seconds = body && typeof body === "object" && "retry_after" in body ? body.retry_after : undefined;
            if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || seconds > 3600) throw error;
            report(job, `انتظار حد Discord. عُثر على ${job.ids.size} رسالة، وحُذف ${job.deleted}. للإيقاف: /delete-cancel`);
            await pause(job, Math.max(1500, Math.ceil(seconds * 1000)));
        }
    }
}

function isMessage(value: unknown): value is HistoryMessage {
    return !!value && typeof value === "object" && "id" in value && typeof value.id === "string" && /^\d{17,20}$/.test(value.id)
        && "channel_id" in value && typeof value.channel_id === "string"
        && "author" in value && !!value.author && typeof value.author === "object" && "id" in value.author && typeof value.author.id === "string"
        && "type" in value && typeof value.type === "number";
}

async function collect(job: Job, before: string) {
    for (;;) {
        const response = await request(job, () => RestAPI.get({ url: Constants.Endpoints.MESSAGES(job.channelId), query: { limit: 100, before }, retries: 0 }));
        check(job);
        const page: unknown = response.body;
        if (!Array.isArray(page) || page.length > 100 || !page.every(isMessage)) throw new Error("Unexpected history response.");
        if (!page.length) break;
        let next = before;
        for (const message of page) {
            if (message.channel_id !== job.channelId || BigInt(message.id) >= BigInt(before)) throw new Error("Unexpected history boundary.");
            if (BigInt(message.id) < BigInt(next)) next = message.id;
            if (message.author.id === job.owner && MESSAGE_TYPES.has(message.type)) job.ids.add(message.id);
        }
        before = next;
        report(job, `جارٍ جمع رسائلك: ${job.ids.size} رسالة. لم يبدأ الحذف. للإيقاف: /delete-cancel`);
        if (page.length < 100) break;
        await pause(job, 1200);
    }
    job.scanned = true;
}

async function confirm(job: Job) {
    const channel = check(job);
    const conversation = channel.name || (channel.recipients ?? []).map(id => {
        const user = UserStore.getUser(id);
        return user?.globalName || user?.username || id;
    }).join("، ") || job.channelId;
    job.confirming = true;
    try {
        return await new Promise<boolean>(resolve => openModal(props => <ConfirmModal
            {...props}
            title={`حذف رسائلي من ${conversation}`}
            confirmText={`حذف ${job.ids.size} رسالة نهائيًا`}
            cancelText="إلغاء"
            onConfirm={() => { resolve(true); props.onClose(); }}
            onCancel={props.onClose}
        ><Paragraph dir="rtl">المحادثة المقصودة: {conversation}. عُثر على {job.ids.size} رسالة تخص حسابك فيها. سيحذف الأمر هذه الرسائل نهائيًا، ولا يمكن استرجاعها. رسائل الآخرين والرسائل الجديدة بعد بدء الأمر لا تدخل في العملية.</Paragraph></ConfirmModal>, {
            modalKey: MODAL_KEY,
            onCloseCallback: () => resolve(false)
        }));
    } finally { job.confirming = false; }
}

async function remove(job: Job) {
    for (const id of job.ids) {
        check(job);
        try {
            await request(job, () => RestAPI.del({ url: Constants.Endpoints.MESSAGE(job.channelId, id), retries: 0 }));
            job.deleted++;
        } catch (error) {
            if (status(error) !== 404 || !error || typeof error !== "object" || !("body" in error) || !error.body || typeof error.body !== "object" || !("code" in error.body) || error.body.code !== 10008) throw error;
            job.missing++;
        }
        if (UserStore.getCurrentUser()?.id === job.owner) await FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: job.channelId, id });
        report(job, `حُذف ${job.deleted} من ${job.ids.size} رسالة. غير موجودة مسبقًا: ${job.missing}. للإيقاف: /delete-cancel`);
        if (job.deleted + job.missing < job.ids.size) await pause(job, 1500);
    }
}

async function run(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const owner = UserStore.getCurrentUser()?.id;
    if (!enabled || !owner) return;
    if (!channel || channel.guild_id || (channel.type !== 1 && channel.type !== 3)) {
        sendBotMessage(channelId, { content: "أمر /delete يعمل في الخاص والقروبات فقط." });
        return;
    }
    if (current) { sendBotMessage(channelId, { content: "توجد عملية حذف قيد التشغيل. أوقفها من محادثتها بواسطة /delete-cancel أولًا." }); return; }
    const before = SnowflakeUtils.fromTimestamp(Date.now() + 1);
    const job: Job = { channelId, owner, reportId: generateId(), ids: new Set(), deleted: 0, missing: 0, scanned: false, cancelled: false, confirming: false };
    current = job;
    try {
        report(job, "جارٍ جمع رسائلك القديمة. لن يبدأ الحذف إلا بعد موافقتك. للإيقاف: /delete-cancel");
        await collect(job, before);
        check(job);
        if (!job.ids.size) { report(job, "لا توجد رسائل تخص حسابك قابلة للحذف في هذه المحادثة."); return; }
        if (!await confirm(job)) job.cancelled = true;
        check(job);
        await remove(job);
        report(job, `اكتملت العملية. مجموع رسائلك: ${job.ids.size}. حُذف بنجاح: ${job.deleted}. غير موجودة مسبقًا: ${job.missing}. المتبقي: 0.`);
    } catch {
        const reason = !active(job) ? "أُوقفت العملية." : "توقفت العملية بعد رفض أو تعذر طلب Discord. يمكنك إعادة /delete لمحاولة حذف الباقي.";
        report(job, job.scanned
            ? `${reason} مجموع رسائلك: ${job.ids.size}. حُذف بنجاح: ${job.deleted}. غير موجودة مسبقًا: ${job.missing}. المتبقي: ${job.ids.size - job.deleted - job.missing}.`
            : `${reason} عُثر على ${job.ids.size} رسالة قبل اكتمال الجمع. لم يبدأ الحذف.`);
    } finally {
        job.resume?.();
        job.ids.clear();
        if (current === job) current = undefined;
    }
}

export default definePlugin({
    name: "DeleteMyMessages",
    description: "Delete your own messages in the current DM or group chat with a confirmed count and local progress.",
    authors: [Devs.Mc5mr],
    tags: ["Chat", "Utility"],
    enabledByDefault: true,
    commands: [
        {
            name: "delete",
            description: "احذف جميع رسائلك القديمة في الخاص أو القروب بعد مراجعة عددها.",
            predicate: ({ channel }) => !channel.guild_id && (channel.type === 1 || channel.type === 3),
            execute: (_args, ctx) => run(ctx.channel.id)
        },
        {
            name: "delete-cancel",
            description: "أوقف عملية جمع أو حذف رسائلك في هذه المحادثة.",
            predicate: ({ channel }) => !channel.guild_id && (channel.type === 1 || channel.type === 3),
            execute(_args, ctx) {
                if (current?.channelId === ctx.channel.id) cancel();
                else sendBotMessage(ctx.channel.id, { content: "لا توجد عملية حذف قيد التشغيل في هذه المحادثة." });
            }
        }
    ],
    start() { enabled = true; },
    stop() { enabled = false; cancel(); },
    flux: { LOGOUT: cancel }
});
