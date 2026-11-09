/*
 * ChatGrid — UI components.
 *
 * ChatGridRoot is what the patched ConnectedChannel renders. It decides:
 *   - a grid pane (has providedChannel)  -> the normal chat
 *   - the host while the grid is active  -> the Grid
 *   - otherwise                          -> the normal chat
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import ErrorBoundary from "@components/ErrorBoundary";
import { openUserProfile } from "@utils/discord";
import { findComponentByCodeLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, useEffect, useState } from "@webpack/common";

import { popOut } from "./popout";
import * as store from "./store";

/* ------------------------------------------------------------------ state -- */

function useGridState() {
    const [, setTick] = useState(0);
    useEffect(() => {
        const onChange = () => setTick(t => t + 1);
        store.subscribe(onChange);
        return () => store.unsubscribe(onChange);
    }, []);
    return store.state;
}

/* ---------------------------------------------------------------- helpers -- */

function channelName(channel: any): string {
    if (!channel) return "Unknown channel";
    if (channel.name) return channel.name;
    const recipients: any[] = channel.rawRecipients ?? [];
    return recipients.map(u => u.global_name || u.username || "?").join(", ") || "Direct Message";
}

function buildCols(widths: number[]): string {
    const cols: string[] = [];
    widths.forEach((w, i) => { cols.push(w + "fr"); if (i < widths.length - 1) cols.push("6px"); });
    return cols.join(" ");
}

/** Open Discord's own Ctrl+K quick switcher. Picking a result there dispatches
 *  CHANNEL_SELECT, which the grid's hook (see index.tsx) routes into the
 *  focused pane — so the channel lands in whichever pane asked for it. No
 *  custom routing needed: mark the target pane focused, then open this. */
export function openQuickSwitcher() {
    FluxDispatcher.dispatch({ type: "QUICKSWITCHER_SHOW", query: "", queryMode: null });
}

/* ------------------------------------------------------------------ title -- */

/* Discord's connected PrivateChannel — one DM-list row. Given { channel } it
 * renders the exact card from the DM sidebar: avatar with decoration + status,
 * the friend's display name, nameplate and activity. It reads its own data
 * from the stores, so the card stays live. */
const PrivateChannel = findComponentByCodeLazy<{ channel: any; selected?: boolean; }>(
    "getRecipientId()", "getAnyStreamForUser", "isMultiUserDM()",
);

/* channel.type values shown as a DM card; any other type gets a name label. */
const CHANNEL_DM = 1;
const CHANNEL_GROUP_DM = 3;

/** The header's channel identity. A DM or group DM shows Discord's own DM-list
 *  card (avatar + decoration + status, display name, activity); any other
 *  channel type falls back to a plain name label.
 *
 *  Left-clicking a 1-on-1 DM card opens the recipient's profile (the same modal
 *  as the row's "Open Profile" menu item). The click is caught in the capture
 *  phase so the card's own navigation never runs. */
function PaneTitle({ channelId }: { channelId: string; }) {
    const channel = ChannelStore.getChannel(channelId);
    if (channel && (channel.type === CHANNEL_DM || channel.type === CHANNEL_GROUP_DM)) {
        const recipientId: string | undefined =
            channel.type === CHANNEL_DM ? channel.getRecipientId() : undefined;
        return (
            <div
                className="vcg-head-card"
                onClickCapture={recipientId ? e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openUserProfile(recipientId).catch(() => { /* unfetchable user */ });
                } : undefined}
            >
                <ErrorBoundary noop>
                    <PrivateChannel channel={channel} selected={false} />
                </ErrorBoundary>
            </div>
        );
    }
    const name = channelName(channel);
    return <span className="vcg-head-namelabel" title={name}>{name}</span>;
}

/* ------------------------------------------------------------------ icons -- */

/* Discord-style icons (24 viewBox): crisp vector glyphs over raw text. */

function CloseIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6 6.7 5.3a1 1 0 0 0-1.4 1.4l5.3 5.3-5.3 5.3a1 1 0 1 0 1.4 1.4l5.3-5.3 5.3 5.3Z"
            />
        </svg>
    );
}

function PopOutIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
            />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg className="vcg-empty-icon" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.75" fill="none" stroke="currentColor" strokeWidth="2.1" />
            <path d="M15.7 15.7 21 21" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
    );
}

/* ------------------------------------------------------------ empty pane -- */

/** Body of a pane with no channel yet — one big target that opens the Ctrl+K
 *  quick switcher; the channel picked there routes back here via the
 *  CHANNEL_SELECT hook. Ctrl+Shift+G opens the switcher once when it adds a
 *  pane (see index.tsx); it deliberately does NOT reopen just because an
 *  empty pane has focus — otherwise closing an unwanted empty pane focuses
 *  the next one and respawns the switcher on every click. */
function EmptyPane({ index }: { index: number; }) {
    return (
        <button
            className="vcg-empty"
            onClick={() => { store.setFocusedPane(index); openQuickSwitcher(); }}
        >
            <SearchIcon />
            <div className="vcg-empty-title">Pick a channel</div>
            <div className="vcg-empty-hint">
                Press <kbd className="vcg-kbd">Ctrl</kbd> <kbd className="vcg-kbd">K</kbd> or click here
            </div>
        </button>
    );
}

/* ---------------------------------------------------------------- header -- */

function PaneHeader({ id, index, ConnectedChannel }: {
    id: string | null; index: number; ConnectedChannel: any;
}) {
    return (
        <div className="vcg-head">
            {id
                ? <PaneTitle channelId={id} />
                : <span className="vcg-head-namelabel vcg-head-newlabel">New pane</span>}
            {id && (
                <button
                    className="vcg-head-btn"
                    title="Pop out into a floating window"
                    aria-label="Pop out pane"
                    onClick={() => { if (popOut(id, ConnectedChannel)) store.closePane(index); }}
                ><PopOutIcon /></button>
            )}
            <button
                className="vcg-head-btn vcg-head-close"
                title="Close pane"
                aria-label="Close pane"
                onClick={() => store.closePane(index)}
            ><CloseIcon /></button>
        </div>
    );
}

/* -------------------------------------------------------------- divider --- */

/** Drag updates gridTemplateColumns on the DOM directly (no React re-render,
 *  so the live chats don't re-render); the fractions commit on mouseup. */
let endDrag: (() => void) | undefined;
export function cancelGridDrag() { endDrag?.(); endDrag = undefined; }

function Divider({ index }: { index: number; }) {
    function onMouseDown(ev: any) {
        ev.preventDefault();
        cancelGridDrag();
        const gridEl = (ev.currentTarget as HTMLElement).closest(".vcg-grid") as HTMLElement | null;
        if (!gridEl) return;

        const widths = store.state.widths.slice();
        const n = widths.length;
        if (index + 1 >= n) return;

        const sumFr = widths.reduce((a, b) => a + b, 0) || 1;
        const flexPx = gridEl.getBoundingClientRect().width - (n - 1) * 6;
        const pxPerFr = flexPx / sumFr;
        if (pxPerFr <= 0) return;
        const oldCursor = document.body.style.cursor;
        const oldSelect = document.body.style.userSelect;
        const startX = ev.clientX;
        const w0 = widths[index], w1 = widths[index + 1];
        const pairSum = w0 + w1;
        const minFr = Math.max(0.05, Math.min(220 / pxPerFr, pairSum * 0.45));
        let latest = widths;

        function onMove(e: MouseEvent) {
            const dFr = (e.clientX - startX) / pxPerFr;
            let a = w0 + dFr, b = w1 - dFr;
            if (a < minFr) { a = minFr; b = pairSum - a; }
            if (b < minFr) { b = minFr; a = pairSum - b; }
            const nw = widths.slice();
            nw[index] = a; nw[index + 1] = b;
            latest = nw;
            gridEl!.style.gridTemplateColumns = buildCols(nw);
        }
        function onUp() {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = oldCursor;
            document.body.style.userSelect = oldSelect;
            endDrag = undefined;
            store.setWidths(latest);
        }
        endDrag = onUp;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    return (
        <div className="vcg-divider" onMouseDown={onMouseDown}>
            <div className="vcg-divider-line" />
        </div>
    );
}

/* ------------------------------------------------------------------ grid -- */

function Cell({ id, index, isFocused, ConnectedChannel }: {
    id: string | null; index: number; isFocused: boolean; ConnectedChannel: any;
}) {
    // Focus-follows-mousedown only — no focus listener. A chat's composer
    // autofocuses when it mounts; a focus handler here would catch that and
    // steal focusedPane from a just-added empty pane, so the channel picked
    // next would land in the seeded pane instead of the new one.
    const focus = () => store.setFocusedPane(index);
    const channel = id ? ChannelStore.getChannel(id) : undefined;
    return (
        <div
            className={isFocused ? "vcg-cell vcg-cell-focused" : "vcg-cell"}
            onMouseDownCapture={focus}
        >
            <PaneHeader id={id} index={index} ConnectedChannel={ConnectedChannel} />
            {channel && ConnectedChannel
                ? <ConnectedChannel providedChannel={channel} />
                : <EmptyPane index={index} />}
        </div>
    );
}

function Grid({ ConnectedChannel }: { ConnectedChannel: any; }) {
    const { channels, widths } = store.state;
    const n = channels.length;
    useEffect(() => () => cancelGridDrag(), [n]);
    const seen: Record<string, number> = {};
    const children: any[] = [];

    channels.forEach((id, i) => {
        let key: string;
        if (id) { const oc = seen[id] ?? 0; seen[id] = oc + 1; key = "p_" + id + "_" + oc; }
        else key = "empty_" + i;
        children.push(<Cell key={key} id={id} index={i} isFocused={i === store.state.focusedPane} ConnectedChannel={ConnectedChannel} />);
        if (i < n - 1) children.push(<Divider key={"d" + i} index={i} />);
    });

    return (
        <div className="vcg-grid" style={{ gridTemplateColumns: buildCols(widths) }}>
            {children}
        </div>
    );
}

/* ------------------------------------------------------------------ root -- */

export function ChatGridRoot({ RealChat, ConnectedChannel, rxProps, chatProps }: {
    RealChat: any; ConnectedChannel: any; rxProps: any; chatProps: any;
}) {
    const st = useGridState();

    // a grid pane: the cell passed providedChannel -> render the normal chat
    if (rxProps?.providedChannel) return <RealChat {...chatProps} />;

    // the host: render the grid whenever it is active. A channel selected
    // from outside the grid loads into the focused pane (see index.tsx) —
    // the grid stays put instead of being navigated away from.
    if (ConnectedChannel && st.active && st.channels.length > 0) {
        return (
            <ErrorBoundary>
                <Grid ConnectedChannel={ConnectedChannel} />
            </ErrorBoundary>
        );
    }
    return <RealChat {...chatProps} />;
}
