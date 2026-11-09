/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const MAX_ACCOUNTS = 30;
export const MAX_INPUT_BYTES = 64 * 1024;

export interface SavedAccount {
    id: string;
    username: string;
    displayName: string;
    verifiedAt: number;
}

export type Result<T> = { ok: true; value: T; notice?: string; } | { ok: false; error: string; retryAfter?: number; };

export function isToken(value: unknown): value is string {
    return typeof value === "string" && value.length >= 20 && value.length <= 2048
        && /^[A-Za-z0-9_.-]+$/.test(value)
        && (value.startsWith("mfa.") || value.split(".").length === 3);
}

export function parseTokens(input: string): string[] {
    const cleaned = input.trim().replace(/^```[^\r\n]*[\r\n]+|```$/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
    return [...new Set(cleaned.split(/[\s,]+/u).map(value => value.replace(/^["']|["']$/g, "")).filter(Boolean))];
}

export function isAccount(value: unknown): value is SavedAccount {
    if (typeof value !== "object" || value === null) return false;
    return "id" in value && typeof value.id === "string" && /^\d{17,20}$/.test(value.id)
        && "username" in value && typeof value.username === "string" && value.username.length > 0 && value.username.length <= 80
        && "displayName" in value && typeof value.displayName === "string" && value.displayName.length <= 100
        && "verifiedAt" in value && typeof value.verifiedAt === "number" && Number.isFinite(value.verifiedAt);
}

export function profileFromResponse(value: unknown): SavedAccount | null {
    if (typeof value !== "object" || value === null || ("bot" in value && value.bot === true)) return null;
    if (!("id" in value) || !("username" in value)) return null;
    const profile = {
        id: value.id,
        username: value.username,
        displayName: "global_name" in value && typeof value.global_name === "string" ? value.global_name : value.username,
        verifiedAt: Date.now()
    };
    return isAccount(profile) ? profile : null;
}
