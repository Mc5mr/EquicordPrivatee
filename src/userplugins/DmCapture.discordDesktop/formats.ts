/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ExportMessage {
    id: string; content: string; timestamp: string;
    author: { id: string; username: string; global_name?: string; };
    attachments?: { filename: string; url: string; content_type?: string; }[];
    embeds?: { title?: string; description?: string; url?: string; }[];
    reactions?: { count: number; emoji: { name?: string; id?: string; }; }[];
}
export type Format = "html" | "txt" | "md" | "json" | "csv";
export interface ExportOptions { media: boolean; embeds: boolean; reactions: boolean; }
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const safeUrl = (url: string) => { try { return new URL(url).protocol === "https:"; } catch { return false; } };
const csv = (text: string) => `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
export function serialize(messages: ExportMessage[], name: string, format: Format, options: ExportOptions): string {
    const filtered = messages.map(message => {
        const { attachments, embeds, reactions, ...base } = message;
        return { ...base, ...(options.media ? { attachments } : {}), ...(options.embeds ? { embeds } : {}), ...(options.reactions ? { reactions } : {}) };
    });
    if (format === "json") return JSON.stringify(filtered, null, 2);
    const extra = (message: ExportMessage) => [
        ...(options.media ? (message.attachments ?? []).map(item => `${item.filename}: ${item.url}`) : []),
        ...(options.embeds ? (message.embeds ?? []).map(item => [item.title, item.description, item.url].filter(Boolean).join(" · ")) : []),
        ...(options.reactions ? (message.reactions ?? []).map(item => `${item.emoji.name ?? item.emoji.id ?? "Emoji"} × ${item.count}`) : [])
    ].join("\n");
    if (format === "csv") return "\uFEFF" + ["id,timestamp,author_id,author,content,details", ...messages.map(message => [message.id, message.timestamp, message.author.id, message.author.global_name ?? message.author.username, message.content ?? "", extra(message)].map(csv).join(","))].join("\r\n");
    if (format === "txt" || format === "md") return messages.map(message => {
        const title = `[${message.timestamp}] ${message.author.global_name ?? message.author.username}`;
        const body = [message.content || "", extra(message)].filter(Boolean).join("\n");
        // Render content as literal text in Markdown rather than executable HTML.
        return format === "md" ? `### ${escapeHtml(title)}\n\n${body.split("\n").map(line => `    ${line}`).join("\n")}\n` : `${title}: ${body}`;
    }).join("\n\n");
    const rows = messages.map(message => {
        const media = options.media ? (message.attachments ?? []).filter(item => safeUrl(item.url)).map(item => {
            const url = escapeHtml(item.url);
            const link = `<a href="${url}" rel="noreferrer">${escapeHtml(item.filename)}</a>`;
            // Only Discord attachment hosts are loaded automatically.
            const host = new URL(item.url).hostname;
            if (!["cdn.discordapp.com", "media.discordapp.net"].includes(host)) return `<p>${link}</p>`;
            const type = item.content_type ?? "";
            return `<p>${link}</p>` + (type.startsWith("image/") ? `<img loading="lazy" src="${url}" alt="${escapeHtml(item.filename)}">` : type.startsWith("video/") ? `<video controls preload="none" src="${url}"></video>` : type.startsWith("audio/") ? `<audio controls preload="none" src="${url}"></audio>` : "");
        }).join("") : "";
        const embeds = options.embeds ? (message.embeds ?? []).map(item => `<blockquote>${escapeHtml([item.title, item.description].filter(Boolean).join("\n"))}${item.url && safeUrl(item.url) ? `<p><a rel="noreferrer" href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a></p>` : ""}</blockquote>`).join("") : "";
        const reactions = options.reactions ? (message.reactions ?? []).map(item => `<span>${escapeHtml(item.emoji.name ?? item.emoji.id ?? "Emoji")} × ${Number(item.count) || 0}</span>`).join(" · ") : "";
        return `<article><header><strong>${escapeHtml(message.author.global_name ?? message.author.username)}</strong> <time>${escapeHtml(message.timestamp)}</time></header><pre>${escapeHtml(message.content || "")}</pre>${media}${embeds}<footer>${reactions}</footer></article>`;
    }).join("\n");
    return `<!doctype html><html lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>${escapeHtml(name)}</title><style>body{font:16px system-ui;margin:32px auto;padding:0 20px;max-width:960px;background:#18191c;color:#eee}article{padding:16px;border-bottom:1px solid #555;break-inside:avoid}time,footer{font-size:12px;color:#aaa}pre,blockquote{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#7dcfff}img,video{max-width:100%;max-height:480px}audio{max-width:100%}@media print{body{background:white;color:black}a{color:#333}}</style><h1>${escapeHtml(name)}</h1><p>${messages.length} messages</p>${rows}</html>`;
}
