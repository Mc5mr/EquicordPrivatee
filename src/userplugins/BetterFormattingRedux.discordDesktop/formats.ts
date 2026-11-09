/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

export type FormatAction =
    | { type: "wrap"; left: string; right: string; }
    | { type: "prefix"; text: string; }
    | { type: "linePrefix"; prefix: string; }
    | { type: "orderedList"; }
    | { type: "maskedLink"; }
    | { type: "bfr"; settingKey: string; };

/** Discord markdown from https://gist.github.com/matthewzring/9f7bbfd102003963f9be7dbcf7d40e51 */
export const FORMAT_ACTIONS: Record<string, FormatAction> = {
    // Text formatting
    bold: { type: "wrap", left: "**", right: "**" },
    italic: { type: "wrap", left: "*", right: "*" },
    boldItalic: { type: "wrap", left: "***", right: "***" },
    underline: { type: "wrap", left: "__", right: "__" },
    underlineItalic: { type: "wrap", left: "__*", right: "*__" },
    underlineBold: { type: "wrap", left: "__**", right: "**__" },
    underlineBoldItalic: { type: "wrap", left: "__***", right: "***__" },
    strikethrough: { type: "wrap", left: "~~", right: "~~" },
    spoiler: { type: "wrap", left: "||", right: "||" },
    code: { type: "wrap", left: "`", right: "`" },
    codeblock: { type: "wrap", left: "```", right: "```" },

    // Organizational
    header1: { type: "linePrefix", prefix: "# " },
    header2: { type: "linePrefix", prefix: "## " },
    header3: { type: "linePrefix", prefix: "### " },
    subtext: { type: "linePrefix", prefix: "-# " },
    maskedLink: { type: "maskedLink" },
    unorderedList: { type: "linePrefix", prefix: "- " },
    orderedList: { type: "orderedList" },

    // Block quotes
    blockquote: { type: "linePrefix", prefix: "> " },
    blockquoteMulti: { type: "prefix", text: ">>> " }
};
