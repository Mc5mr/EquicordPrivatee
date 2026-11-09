/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

export type ToolbarButtonKey =
    | "bold" | "italic" | "boldItalic" | "underline" | "underlineItalic" | "underlineBold" | "underlineBoldItalic"
    | "strikethrough" | "spoiler" | "code" | "codeblock"
    | "header1" | "header2" | "header3" | "subtext" | "maskedLink" | "unorderedList" | "orderedList"
    | "blockquote" | "blockquoteMulti"
    | "superscript" | "smallcaps" | "fullwidth" | "upsidedown" | "varied" | "leet" | "thicc"
    | "firstcaps" | "uppercase" | "lowercase";

export interface ToolbarButtonDef {
    type: "native-format" | "bfr-format" | "line-format" | "special-format";
    name: string;
    displayName: string;
    icon: string;
}

export const BUTTON_ORDER: `${ToolbarButtonKey}Button`[] = [
    // Discord markdown (gist)
    "boldButton", "italicButton", "boldItalicButton", "underlineButton", "underlineItalicButton",
    "underlineBoldButton", "underlineBoldItalicButton", "strikethroughButton",
    "spoilerButton", "codeButton", "codeblockButton",
    "header1Button", "header2Button", "header3Button", "subtextButton",
    "blockquoteButton", "blockquoteMultiButton", "unorderedListButton", "orderedListButton",
    "maskedLinkButton", "superscriptButton", "smallcapsButton", "fullwidthButton", "upsidedownButton", "variedButton", "leetButton", "thiccButton", "firstcapsButton", "uppercaseButton", "lowercaseButton"
];

export const CUSTOM_WRAPPER_KEYS = [
    "superscriptWrapper", "smallcapsWrapper", "fullwidthWrapper", "upsidedownWrapper",
    "variedWrapper", "leetWrapper", "thiccWrapper", "firstcapsWrapper", "uppercaseWrapper", "lowercaseWrapper"
] as const;

export default {
    bold: { type: "native-format", name: "Bold", displayName: " Bold ", icon: "<strong>B</strong>" },
    italic: { type: "native-format", name: "Italic", displayName: " Italic ", icon: "<em>I</em>" },
    boldItalic: { type: "native-format", name: "Bold Italic", displayName: " B+I ", icon: "<strong><em>BI</em></strong>" },
    underline: { type: "native-format", name: "Underline", displayName: " Underline ", icon: "<u>U</u>" },
    underlineItalic: { type: "native-format", name: "Underline Italic", displayName: " U+I ", icon: "<u><em>UI</em></u>" },
    underlineBold: { type: "native-format", name: "Underline Bold", displayName: " U+B ", icon: "<u><strong>UB</strong></u>" },
    underlineBoldItalic: { type: "native-format", name: "Underline Bold Italic", displayName: " U+BI ", icon: "<u><strong><em>UBI</em></strong></u>" },
    strikethrough: { type: "native-format", name: "Strikethrough", displayName: " Strike ", icon: "<s>S</s>" },
    spoiler: { type: "native-format", name: "Spoiler", displayName: "Spoiler", icon: "▦" },
    code: { type: "native-format", name: "Code", displayName: " Code ", icon: "<code>`</code>" },
    codeblock: { type: "native-format", name: "Codeblock", displayName: " Block ", icon: "<code>```</code>" },
    header1: { type: "line-format", name: "Header (large)", displayName: " H1 ", icon: "H1" },
    header2: { type: "line-format", name: "Header (medium)", displayName: " H2 ", icon: "H2" },
    header3: { type: "line-format", name: "Header (small)", displayName: " H3 ", icon: "H3" },
    subtext: { type: "line-format", name: "Subtext", displayName: " Sub ", icon: "-#" },
    blockquote: { type: "line-format", name: "Block Quote", displayName: " Quote ", icon: "&gt;" },
    blockquoteMulti: { type: "line-format", name: "Multi-line Quote", displayName: " &gt;&gt;&gt; ", icon: "&gt;&gt;&gt;" },
    unorderedList: { type: "line-format", name: "Bullet List", displayName: " • ", icon: "•" },
    orderedList: { type: "line-format", name: "Numbered List", displayName: " 1. ", icon: "1." },
    maskedLink: { type: "special-format", name: "Masked Link", displayName: " Link ", icon: "🔗" },
    superscript: { type: "bfr-format", name: "Superscript", displayName: "ˢᵘᵖᵉʳˢᶜʳᶦᵖᵗ", icon: "ˣ" },
    smallcaps: { type: "bfr-format", name: "Smallcaps", displayName: "SᴍᴀʟʟCᴀᴘs", icon: "ᴬ" },
    fullwidth: { type: "bfr-format", name: "Fullwidth", displayName: "Ｆｕｌｌｗｉｄｔｈ", icon: "Ａ" },
    upsidedown: { type: "bfr-format", name: "Upsidedown", displayName: "uʍopǝpᴉsd∩", icon: "↻" },
    varied: { type: "bfr-format", name: "Varied", displayName: "VaRiEd CaPs", icon: "Aa" },
    leet: { type: "bfr-format", name: "Leet", displayName: "1337", icon: "1337" },
    thicc: { type: "bfr-format", name: "Extra Thicc", displayName: "乇乂下尺卂 下卄工匚匚", icon: "卩" },
    firstcaps: { type: "bfr-format", name: "First Caps", displayName: "First Caps", icon: "Aa" },
    uppercase: { type: "bfr-format", name: "Uppercase", displayName: "UPPERCASE", icon: "AA" },
    lowercase: { type: "bfr-format", name: "Lowercase", displayName: "lowercase", icon: "aa" }
} satisfies Record<ToolbarButtonKey, ToolbarButtonDef>;
