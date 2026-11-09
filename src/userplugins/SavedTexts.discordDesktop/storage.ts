/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import * as DataStore from "@api/DataStore";
import { UserStore } from "@webpack/common";

export interface SavedText { id: string; name: string; text: string; createdAt: number; pasteCount?: number; }
export const MAX_ENTRIES = 200;
export function makeDefaultName(text: string) { const oneLine = text.replace(/\s+/g, " ").trim(); return oneLine.length <= 40 ? oneLine || "Saved text" : oneLine.slice(0, 37) + "..."; }
export function getPasteCount(item: SavedText) { return Math.max(0, Math.floor(item.pasteCount ?? 0)); }
function key(owner: string) { return `mc5mr-saved-texts:${owner}`; }
function validate(items: unknown): SavedText[] {
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.text === "string" && item.text.length <= 20000).slice(0, MAX_ENTRIES);
}
function assertOwner(owner: string) { if (!owner || owner !== UserStore.getCurrentUser()?.id) throw new Error("Account changed. Reopen SavedTexts."); }
export async function getSavedTexts(owner: string): Promise<SavedText[]> { assertOwner(owner); const rows = validate(await DataStore.get(key(owner))); assertOwner(owner); return rows; }
export async function mutateSavedTexts(owner: string, change: (items: SavedText[]) => SavedText[]) {
    assertOwner(owner);
    await DataStore.update(key(owner), stored => { assertOwner(owner); return change(validate(stored)).slice(0, MAX_ENTRIES); });
    assertOwner(owner);
}
export async function addSavedText(owner: string, name: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 20000) throw new Error("اكتب نصًا من 1 إلى 20000 حرف.");
    const entry: SavedText = { id: crypto.randomUUID(), name: name.trim().slice(0, 100) || makeDefaultName(trimmed), text: trimmed, createdAt: Date.now(), pasteCount: 0 };
    await mutateSavedTexts(owner, items => { if (items.length >= MAX_ENTRIES) throw new Error("وصلت لحد 200 نص محفوظ."); return [entry, ...items]; });
    return entry;
}
export async function updateSavedText(owner: string, id: string, name: string, text: string) {
    if (!text.trim() || text.length > 20000) throw new Error("اكتب نصًا من 1 إلى 20000 حرف.");
    await mutateSavedTexts(owner, items => items.map(item => item.id === id ? { ...item, name: name.trim().slice(0, 100) || makeDefaultName(text), text: text.trim() } : item));
}
export async function removeSavedText(owner: string, id: string) { await mutateSavedTexts(owner, items => items.filter(item => item.id !== id)); }
export async function incrementPasteCount(owner: string, id: string) { await mutateSavedTexts(owner, items => items.map(item => item.id === id ? { ...item, pasteCount: getPasteCount(item) + 1 } : item)); }
