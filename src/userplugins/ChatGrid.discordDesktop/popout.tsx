/*
 * ChatGrid — pop a pane out into a floating, always-on-top OS window.
 *
 * Reuses Discord's own popout-window system — the machinery behind the voice
 * popout. `open(key, render, features)` opens a real OS-level window and mounts
 * render(key) into its document; PopoutWindow re-establishes the theme / layer
 * / modal context a chat needs in that separate document. The chat itself is a
 * ConnectedChannel given a `providedChannel` — the very component a grid pane
 * renders, so a popped-out chat stays as live as one in the grid.
 *
 * Always-on-top is fixed on (defaultAlwaysOnTop) so the window floats over
 * other applications — the whole point of popping a pane out.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { findByPropsLazy, findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { ChannelStore } from "@webpack/common";

/* Discord's popout-window pieces. Lazy finders — these resolve on first use
 * (a pop-out click), not at plugin-init when their modules aren't loaded yet.
 *
 * PopoutActions — the popout-window action creators the voice popout dispatches
 * through (open / close / setAlwaysOnTop / ...). */
const PopoutActions = findByPropsLazy("openChannelCallPopout", "setAlwaysOnTop", "open", "close");

/* PopoutWindowStore — used only to confirm a window actually opened. */
const PopoutWindowStore = findStoreLazy("PopoutWindowStore");

/* PopoutWindow — Discord's own title bar plus the full context stack (theme,
 * layers, modals) a chat needs inside a separate document. */
const PopoutWindow = findComponentByCodeLazy("Missing guestWindow reference");

/* window keys of every float this plugin has opened — closed on plugin stop() */
const openKeys = new Set<string>();
let seq = 0;

function channelName(channel: any): string {
    if (!channel) return "Discord";
    if (channel.name) return channel.name;
    const recipients: any[] = channel.rawRecipients ?? [];
    return recipients.map(u => u.global_name || u.username || "?").join(", ") || "Direct Message";
}

/* ------------------------------------------------------------- contents -- */

/** The contents of one floating window: a full native Discord chat for
 *  `channelId`, wrapped in PopoutWindow so it carries Discord's theme / layer /
 *  modal context inside its own document. */
function PopoutChat({ windowKey, channelId, ConnectedChannel }: {
    windowKey: string; channelId: string; ConnectedChannel: any;
}) {
    const channel = ChannelStore.getChannel(channelId);
    return (
        <PopoutWindow
            windowKey={windowKey}
            channelId={channelId}
            title={channelName(channel)}
            withTitleBar={true}
        >
            {channel ? <ConnectedChannel providedChannel={channel} /> : null}
        </PopoutWindow>
    );
}

/* ------------------------------------------------------------------ api -- */

/** Pop `channelId` out into a new floating, always-on-top OS window. Each call
 *  opens an independent window — several can be open at once. Returns whether
 *  the window opened (window.open is refused without a user gesture). */
export function popOut(channelId: string, ConnectedChannel: any): boolean {
    // The key MUST start with "DISCORD_": Discord's main process only turns a
    // window.open("/popout") into an internal frameless, always-on-top window
    // when the frame name carries that prefix — otherwise it hands the URL to
    // the external browser. The rest is unique per pop so every click gets its
    // own window (Discord's openOrFocusWindow only re-focuses on a key clash).
    const key = "DISCORD_VCG_POPOUT_" + Date.now() + "_" + (++seq);
    PopoutActions.open(
        key,
        (windowKey: string) => (
            <PopoutChat windowKey={windowKey} channelId={channelId} ConnectedChannel={ConnectedChannel} />
        ),
        { defaultWidth: 560, defaultHeight: 720, defaultAlwaysOnTop: true },
    );
    if (!PopoutWindowStore.getWindowOpen(key)) return false;
    openKeys.add(key);
    return true;
}

/** Close every floating window this plugin opened — called from plugin stop().
 *  Closing an already-closed window is a harmless no-op. */
export function closeAllPopouts() {
    for (const key of openKeys) PopoutActions.close(key);
    openKeys.clear();
}
