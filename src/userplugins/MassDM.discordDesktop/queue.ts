/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface DmQueueRequest { recipients: string[]; content: string; delayMs: number; }
export interface DmQueuePort {
    cancelled(): boolean;
    isFriend(id: string): boolean;
    send(id: string, content: string): Promise<void>;
    wait(ms: number): Promise<void>;
    progress(id: string, sent: number): void;
}

export async function runDmQueue(request: DmQueueRequest, port: DmQueuePort) {
    if (!request.content.trim() || request.content.length > 2000) throw new Error("اكتب رسالة من 1 إلى 2000 حرف.");
    if (!Number.isFinite(request.delayMs) || request.delayMs < 1500 || request.delayMs > 3_600_000) throw new Error("الفاصل من 1.5 ثانية إلى ساعة.");
    const recipients = [...new Set(request.recipients)];
    if (!recipients.length) throw new Error("حدد المستلمين أولًا.");
    let sent = 0;
    for (const id of recipients) {
        if (port.cancelled()) break;
        if (!port.isFriend(id)) throw new Error("توقف الإرسال لأن أحد المستلمين لم يعد ضمن أصدقائك.");
        await port.send(id, request.content);
        sent++;
        port.progress(id, sent);
        if (sent < recipients.length && !port.cancelled()) await port.wait(request.delayMs);
    }
    return sent;
}
