/*
 * CustomLoadingLogo - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { React } from "@webpack/common";
import { ComponentType } from "react";

import managedStyle from "./style.css?managed";

const DEFAULT_LOGO = "";
const MARK = "vc-custom-loading-logo";

const settings = definePluginSettings({
    logoUrl: {
        type: OptionType.STRING,
        description: "Custom loading logo image URL (PNG or WebP recommended)",
        default: DEFAULT_LOGO
    }
});

function getLogoUrl() {
    const url = settings.store.logoUrl.trim();
    if (!url) return "";
    try { const parsed = new URL(url); return parsed.protocol === "https:" || (parsed.protocol === "data:" && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(url)) ? url : ""; } catch { return ""; }
}

interface SpinnerProps {
    className?: string;
    onLoadedData?: () => void;
    [key: string]: unknown;
}

/** Cached per original component - a fresh wrapper each render would remount the logo every time. */
const wrappers = new WeakMap<ComponentType<any>, ComponentType<any>>();

export default definePlugin({
    name: "CustomLoadingLogo",
    description: "Show your chosen image on Discord's connecting screen. Leave the URL empty to use the native logo.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "Xaenny", id: 0n }],
    settings,
    managedStyle,
    startAt: StartAt.Init,

    patches: [
        {
            // Discord used to build the loading <video> inline on the connecting screen. It now
            // renders a component of its own that picks mov/mp4/webm sources per theme, so the old
            // match (createElement("video", ...)) no longer exists anywhere. Swap the component
            // instead of the element: every prop is left exactly as Discord passed it.
            find: '"app-spinner"',
            replacement: {
                match: /(return\(0,\i\.jsx\)\()(\i\.\i)(,\{ref:)/,
                replace: "$1$self.loadingLogoComponent($2)$3"
            },
            noWarn: true
        }
    ],

    /**
     * Wraps Discord's spinner component. Returns the original untouched when no custom logo is set,
     * so turning the plugin's URL off leaves the loading screen exactly as Discord ships it.
     */
    loadingLogoComponent(Original: ComponentType<any>) {
        let wrapper = wrappers.get(Original);
        if (wrapper) return wrapper;

        // forwardRef because the parent passes ref={this.setVideoRef} and a bare function component
        // would drop it - it only null-checks the ref before playing the connect sound, but losing
        // it silently would be a regression.
        wrapper = React.forwardRef<HTMLImageElement, SpinnerProps>((props, ref) => {
            const url = getLogoUrl();
            if (!url) return React.createElement(Original, { ...props, ref });

            // onLoadedData is Discord's "the logo is ready" callback, which unhides the loading
            // screen. <img> has no such event, so onLoad stands in - and onError calls it too,
            // because a URL that 404s must not leave the screen waiting forever.
            return React.createElement("img", {
                ref,
                src: url,
                className: `${props.className ?? ""} ${MARK}`.trim(),
                alt: "",
                draggable: false,
                "data-testid": "app-spinner",
                onLoad: props.onLoadedData,
                onError: props.onLoadedData
            });
        });

        wrappers.set(Original, wrapper);
        return wrapper;
    },

    stop() {}
});
