/*
 * ChatGrid — grid state store.
 *
 * A tiny observable holding the pane layout. Components subscribe via
 * useGridState() (see components.tsx); actions mutate then emit().
 *
 * The grid is one global workspace — not tied to any channel. While it is
 * active it occupies the chat area on every route; a channel selected from
 * outside the grid (sidebar, notification) loads into the focused pane
 * (see routeToFocusedPane + the CHANNEL_SELECT hook in index.tsx).
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { SelectedChannelStore } from "@webpack/common";

export interface GridState {
    /** whether the grid replaces the normal single chat */
    active: boolean;
    /** ordered pane channel ids; a null entry is an empty "pick a channel" pane */
    channels: (string | null)[];
    /** fraction width per pane (fr units), same length as channels */
    widths: number[];
    /** index of the pane that last had focus — channels selected outside the
     *  grid load here */
    focusedPane: number;
}

export const state: GridState = { active: false, channels: [], widths: [], focusedPane: 0 };

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) { listeners.add(fn); }
export function unsubscribe(fn: () => void) { listeners.delete(fn); }
function emit() { for (const fn of [...listeners]) fn(); }

/** keep widths the same length as channels (resets to equal on a count change) */
function normalizeWidths() {
    if (state.widths.length !== state.channels.length)
        state.widths = state.channels.map(() => 1);
}

/** keep focusedPane a valid index */
function clampFocus() {
    if (state.focusedPane < 0) state.focusedPane = 0;
    else if (state.focusedPane >= state.channels.length)
        state.focusedPane = Math.max(0, state.channels.length - 1);
}

export function openGrid(seed: string | null) {
    state.active = true;
    state.channels = seed ? [seed] : [];
    state.widths = [];
    state.focusedPane = 0;
    normalizeWidths();
    emit();
}

export function closeGrid() {
    state.active = false;
    state.channels = [];
    state.widths = [];
    state.focusedPane = 0;
    emit();
}

export function addPane() {
    if (state.channels.length >= 6) return;
    state.channels.push(null);
    state.widths.push(1);
    state.focusedPane = state.channels.length - 1;
    normalizeWidths();
    emit();
}

export function closePane(index: number) {
    state.channels.splice(index, 1);
    state.widths.splice(index, 1);
    if (index < state.focusedPane) state.focusedPane--;
    clampFocus();
    if (state.channels.length === 0) state.active = false;
    normalizeWidths();
    emit();
}

export function setPaneChannel(index: number, channelId: string) {
    if (index < 0 || index >= state.channels.length) return;
    if (state.channels[index] === channelId) return;
    state.channels[index] = channelId;
    emit();
}

/** mark a pane as focused — the next channel selected outside the grid
 *  loads here */
export function setFocusedPane(index: number) {
    if (index < 0 || index >= state.channels.length) return;
    if (state.focusedPane === index) return;
    state.focusedPane = index;
    emit();
}

/** route a channel selected outside the grid (sidebar click, notification)
 *  into the focused pane, instead of leaving the grid */
export function routeToFocusedPane(channelId: string) {
    if (!state.active || state.channels.length === 0) return;
    clampFocus();
    setPaneChannel(state.focusedPane, channelId);
}

/** committed after a divider drag — the DOM is already updated, so no emit */
export function setWidths(widths: number[]) {
    state.widths = widths;
}

/** Ctrl+Shift+G: open the grid if closed, then add an empty pane */
export function triggerShortcut() {
    if (!state.active || state.channels.length === 0)
        openGrid(SelectedChannelStore.getChannelId() ?? null);
    addPane();
}
