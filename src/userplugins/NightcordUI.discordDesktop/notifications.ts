/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore } from "@webpack/common";

export function getOpenChannelId() { return SelectedChannelStore.getCurrentlySelectedChannelId() ?? SelectedChannelStore.getChannelId(); }

const listeners = new Set<() => void>();
let height = 0;
export function getMentionHeight() { return height; }
export function setMentionHeight(value: number) {
    if (value === height) return;
    height = value; listeners.forEach(listener => listener());
}
export function subscribeMentionDock(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
