/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { CodecInfo } from "@vencord/discord-types";

interface Decoder { name: string; params?: Record<string, string>; }

export function prepareCapabilities(codecs: CodecInfo[], context: string, receiving = true): CodecInfo[] {
    return context === "stream" && receiving ? codecs.filter(codec => codec.name !== "H265") : codecs;
}

export function prepareDecoders<T extends { videoDecoders?: Decoder[]; }>(options: T, context: string, receiving = true): T {
    if (context !== "stream" || !receiving || !options.videoDecoders) return options;
    return {
        ...options,
        videoDecoders: options.videoDecoders.filter(decoder => decoder.name !== "H265").map(decoder => ({
            ...decoder,
            params: {
                ...decoder.params,
                "fallback-after-errors": "3",
                "fallback-on-consecutive-errors": "1",
                ...(decoder.name === "H264" ? { "hardware-h264": "0" } : {}),
                ...(decoder.name === "AV1X" || decoder.name === "AV1" ? { "hardware-av1-decode": "0" } : {})
            }
        }))
    };
}

export default definePlugin({
    name: "StreamPlaybackFix",
    description: "Avoid failing H265 reception and use software H264 decoding with fallback for screen shares.",
    authors: [Devs.Mc5mr],
    tags: ["Utility", "Voice"],
    enabledByDefault: true,
    required: true,
    hidden: true,
    patches: [{
        find: "lastOverrideCodecDenylist.length",
        replacement: {
            match: /(?<=this.videoSupported\?)\i\(\i,\i,\i\)(?=\.map\()/,
            replace: "$self.prepareCapabilities($&,this.context,this.streamUserId!==this.userId)"
        }
    }, {
        find: '"hardware-h264"',
        replacement: {
            match: /return(\{videoEncoder:\i,videoDecoders:\i,audioEncoder:\i,audioDecoders:\i\})/,
            replace: "return $self.prepareDecoders($1,this.context,this.streamUserId!==this.userId)"
        }
    }],
    prepareDecoders,
    prepareCapabilities
});
