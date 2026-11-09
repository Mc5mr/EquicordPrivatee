/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    // Toolbar buttons — Discord markdown
    boldButton: { type: OptionType.BOOLEAN, description: "Show Bold button", default: true },
    italicButton: { type: OptionType.BOOLEAN, description: "Show Italic button", default: true },
    boldItalicButton: { type: OptionType.BOOLEAN, description: "Show Bold Italic button", default: true },
    underlineButton: { type: OptionType.BOOLEAN, description: "Show Underline button", default: true },
    underlineItalicButton: { type: OptionType.BOOLEAN, description: "Show Underline Italic button", default: true },
    underlineBoldButton: { type: OptionType.BOOLEAN, description: "Show Underline Bold button", default: true },
    underlineBoldItalicButton: { type: OptionType.BOOLEAN, description: "Show Underline Bold Italic button", default: true },
    strikethroughButton: { type: OptionType.BOOLEAN, description: "Show Strikethrough button", default: true },
    spoilerButton: { type: OptionType.BOOLEAN, description: "Show Spoiler button", default: true },
    codeButton: { type: OptionType.BOOLEAN, description: "Show Code button", default: true },
    codeblockButton: { type: OptionType.BOOLEAN, description: "Show Codeblock button", default: true },
    header1Button: { type: OptionType.BOOLEAN, description: "Show Header (H1) button", default: true },
    header2Button: { type: OptionType.BOOLEAN, description: "Show Header (H2) button", default: true },
    header3Button: { type: OptionType.BOOLEAN, description: "Show Header (H3) button", default: true },
    subtextButton: { type: OptionType.BOOLEAN, description: "Show Subtext button", default: true },
    blockquoteButton: { type: OptionType.BOOLEAN, description: "Show Block Quote button", default: true },
    blockquoteMultiButton: { type: OptionType.BOOLEAN, description: "Show Multi-line Quote button", default: true },
    unorderedListButton: { type: OptionType.BOOLEAN, description: "Show Bullet List button", default: true },
    orderedListButton: { type: OptionType.BOOLEAN, description: "Show Numbered List button", default: true },
    maskedLinkButton: { type: OptionType.BOOLEAN, description: "Show Masked Link button", default: true },
    // BFR extras
    superscriptButton: { type: OptionType.BOOLEAN, description: "Show Superscript button", default: true },
    smallcapsButton: { type: OptionType.BOOLEAN, description: "Show Smallcaps button", default: true },
    fullwidthButton: { type: OptionType.BOOLEAN, description: "Show Full Width button", default: true },
    upsidedownButton: { type: OptionType.BOOLEAN, description: "Show Upsidedown button", default: true },
    variedButton: { type: OptionType.BOOLEAN, description: "Show Varied Caps button", default: true },
    leetButton: { type: OptionType.BOOLEAN, description: "Show Leet button", default: false },
    thiccButton: { type: OptionType.BOOLEAN, description: "Show Extra Thicc button", default: false },
    firstcapsButton: { type: OptionType.BOOLEAN, description: "Show First Caps button", default: false },
    uppercaseButton: { type: OptionType.BOOLEAN, description: "Show Uppercase button", default: false },
    lowercaseButton: { type: OptionType.BOOLEAN, description: "Show Lowercase button", default: false },

    // Active formats on send
    superscriptFormat: { type: OptionType.BOOLEAN, description: "Enable Superscript format", default: true },
    smallcapsFormat: { type: OptionType.BOOLEAN, description: "Enable Smallcaps format", default: true },
    fullwidthFormat: { type: OptionType.BOOLEAN, description: "Enable Full Width format", default: true },
    upsidedownFormat: { type: OptionType.BOOLEAN, description: "Enable Upsidedown format", default: true },
    variedFormat: { type: OptionType.BOOLEAN, description: "Enable Varied Caps format", default: true },
    leetFormat: { type: OptionType.BOOLEAN, description: "Enable Leet format", default: false },
    thiccFormat: { type: OptionType.BOOLEAN, description: "Enable Extra Thicc format", default: false },
    firstcapsFormat: { type: OptionType.BOOLEAN, description: "Enable First Caps format", default: false },
    uppercaseFormat: { type: OptionType.BOOLEAN, description: "Enable Uppercase format", default: false },
    lowercaseFormat: { type: OptionType.BOOLEAN, description: "Enable Lowercase format", default: false },

    // Wrappers
    superscriptWrapper: { type: OptionType.STRING, description: "Superscript wrapper", default: "^^" },
    smallcapsWrapper: { type: OptionType.STRING, description: "Smallcaps wrapper", default: "%%" },
    fullwidthWrapper: { type: OptionType.STRING, description: "Full Width wrapper", default: "##" },
    upsidedownWrapper: { type: OptionType.STRING, description: "Upsidedown wrapper", default: "&&" },
    variedWrapper: { type: OptionType.STRING, description: "Varied Caps wrapper", default: "==" },
    leetWrapper: { type: OptionType.STRING, description: "Leet wrapper", default: "++" },
    thiccWrapper: { type: OptionType.STRING, description: "Extra Thicc wrapper", default: "$$" },
    firstcapsWrapper: { type: OptionType.STRING, description: "First Caps wrapper", default: "--" },
    uppercaseWrapper: { type: OptionType.STRING, description: "Uppercase wrapper", default: ">>" },
    lowercaseWrapper: { type: OptionType.STRING, description: "Lowercase wrapper", default: "<<" },

    // Formatting options
    fullWidthMap: {
        type: OptionType.SELECT,
        description: "Fullwidth style",
        options: [
            { label: "T H I S (spaced caps)", value: "spaced", default: true },
            { label: "Ｔｈｉｓ (unicode fullwidth)", value: "unicode" }
        ]
    },
    reorderUpsidedown: { type: OptionType.BOOLEAN, description: "Reorder upsidedown text to read correctly", default: true },
    startCaps: { type: OptionType.BOOLEAN, description: "Start varied caps with a capital letter", default: true },

    // Functional options
    hoverOpen: {
        type: OptionType.SELECT,
        description: "Open toolbar on",
        options: [
            { label: "Chat bar button", value: "chatButton", default: true },
            { label: "Hover", value: "hover" },
            { label: "Click arrow", value: "click" }
        ]
    },
    chainFormats: {
        type: OptionType.SELECT,
        description: "Format chaining priority",
        options: [
            { label: "Outer first", value: "outer", default: true },
            { label: "Inner first", value: "inner" }
        ]
    },
    closeOnSend: { type: OptionType.BOOLEAN, description: "Close toolbar when a message is sent", default: true },

    // Style options
    useIcons: {
        type: OptionType.SELECT,
        description: "Toolbar button style",
        options: [
            { label: "Icons", value: "icons", default: true },
            { label: "Text labels", value: "text" }
        ]
    },
    rightSide: {
        type: OptionType.SELECT,
        description: "Toolbar location",
        options: [
            { label: "Right", value: "right", default: true },
            { label: "Left", value: "left" }
        ]
    },
    toolbarOpacity: {
        type: OptionType.SLIDER,
        description: "Toolbar opacity",
        markers: [0, 0.25, 0.5, 0.75, 1],
        default: 1,
        stickToMarkers: false
    },
    fontSize: {
        type: OptionType.SLIDER,
        description: "Toolbar font size (%)",
        markers: [50, 65, 75, 85, 100],
        default: 85,
        stickToMarkers: false
    }
});

export type FormatSettings = Omit<typeof settings.store, "chainFormats" | "fullWidthMap"> & {
    chainFormats: boolean;
    fullWidthMap: boolean;
};

export function getFormatSettings(): FormatSettings {
    const s = settings.store;
    return {
        ...s,
        chainFormats: s.chainFormats === "outer",
        fullWidthMap: s.fullWidthMap === "unicode"
    };
}
