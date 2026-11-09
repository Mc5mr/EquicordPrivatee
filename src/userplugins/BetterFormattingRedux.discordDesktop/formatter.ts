/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { FormatSettings } from "./settings";
import { CUSTOM_WRAPPER_KEYS } from "./toolbar";

const REPLACE_LIST = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}";
const SMALL_CAPS_LIST = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ{|}";
const SUPERSCRIPT_LIST = " !\"#$%&'⁽⁾*⁺,⁻./⁰¹²³⁴⁵⁶⁷⁸⁹:;<⁼>?@ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾQᴿˢᵀᵁνᵂˣʸᶻ[\\]^_`ᵃᵇᶜᵈᵉᶠᵍʰᶦʲᵏˡᵐⁿᵒᵖᑫʳˢᵗᵘᵛʷˣʸᶻ{|}";
const UPSIDE_DOWN_LIST = " ¡\"#$%℘,)(*+'-˙/0Ɩ↊Ɛ߈ϛ9ㄥ86:;>=<¿@∀ᗺƆᗡƎℲꓨHIՐꓘꓶWNOԀꝹꓤSꓕꓵΛMX⅄Z]\\[^‾,ɐqɔpǝɟᵷɥᴉɾʞꞁɯuodbɹsʇnʌʍxʎz}|{";
const FULLWIDTH_LIST = "　！＂＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝";
const LEET_LIST = " !\"#$%&'()*+,-./0123456789:;<=>?@48CD3FG#IJK1MN0PQЯ57UVWXY2[\\]^_`48cd3fg#ijk1mn0pqЯ57uvwxy2{|}";
const THICC_LIST = "　!\"#$%&'()*+,-./0123456789:;<=>?@卂乃匚刀乇下厶卄工丁长乚从ん口尸㔿尺丂丅凵リ山乂丫乙[\\]^_`卂乃匚刀乇下厶卄工丁长乚从ん口尸㔿尺丂丅凵リ山乂丫乙{|}";

function escapeRegex(s: string) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function doFormat(text: string, wrapper: string, offset: number, settings: FormatSettings, depth = 0): string {
    if (!wrapper || depth >= 16 || offset < 0) return text;
    if (text.substring(offset, offset + wrapper.length) !== wrapper) return text;

    let returnText = text;
    const len = text.length;
    const begin = text.indexOf(wrapper, offset);
    if (text[begin - 1] === "\\") return text;

    let end = text.indexOf(wrapper, begin + wrapper.length);
    if (end === -1) return text;
    end += wrapper.length - 1;

    if (settings.chainFormats) {
        for (const key of CUSTOM_WRAPPER_KEYS) {
            const innerWrapper = settings[key];
            const newText = doFormat(returnText, innerWrapper, begin + wrapper.length, settings, depth + 1);
            if (returnText !== newText) {
                returnText = newText;
                end -= innerWrapper.length * 2;
            }
        }
    }

    returnText = returnText.replace(
        new RegExp(`([^]{${begin}})${escapeRegex(wrapper)}([^]*)${escapeRegex(wrapper)}([^]{${len - end - 1}})`),
        (_match, before, middle, after) => {
            let letterNum = 0;
            middle = middle.replace(/./g, (letter: string) => {
                const index = REPLACE_LIST.indexOf(letter);
                letterNum += 1;

                if (wrapper === settings.fullwidthWrapper) {
                    if (settings.fullWidthMap) return index !== -1 ? FULLWIDTH_LIST[index] : letter;
                    return index !== -1 ? (letterNum === middle.length ? letter.toUpperCase() : letter.toUpperCase() + " ") : letter;
                }
                if (wrapper === settings.superscriptWrapper) return index !== -1 ? SUPERSCRIPT_LIST[index] : letter;
                if (wrapper === settings.smallcapsWrapper) return index !== -1 ? SMALL_CAPS_LIST[index] : letter;
                if (wrapper === settings.upsidedownWrapper) return index !== -1 ? UPSIDE_DOWN_LIST[index] : letter;
                if (wrapper === settings.leetWrapper) return index !== -1 ? LEET_LIST[index] : letter;
                if (wrapper === settings.thiccWrapper) return index !== -1 ? THICC_LIST[index] : letter;
                if (wrapper === settings.variedWrapper) {
                    const compare = settings.startCaps ? 1 : 0;
                    if (letter.toLowerCase() === letter.toUpperCase()) letterNum -= 1;
                    return index !== -1 ? (letterNum % 2 === compare ? letter.toUpperCase() : letter.toLowerCase()) : letter;
                }
                if (wrapper === settings.firstcapsWrapper) {
                    if (letterNum === 1 || middle[letterNum - 2] === " ") return letter.toUpperCase();
                }
                if (wrapper === settings.uppercaseWrapper) return letter.toUpperCase();
                if (wrapper === settings.lowercaseWrapper) return letter.toLowerCase();
                return letter;
            });

            if (wrapper === settings.upsidedownWrapper && settings.reorderUpsidedown) {
                return before + middle.split("").reverse().join("") + after;
            }
            return before + middle + after;
        }
    );

    return returnText;
}

export function formatMessage(string: string, settings: FormatSettings): string {
    let text = string;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === "`") {
            const next = text.indexOf("`", i + 1);
            if (next !== -1) i = next;
        } else if (text[i] === "@") {
            const match = /@.*#[0-9]*/.exec(text.substring(i));
            if (match?.index === 0) i += match[0].length - 1;
        } else {
            for (const key of CUSTOM_WRAPPER_KEYS) {
                const formatKey = key.replace("Wrapper", "Format") as keyof FormatSettings;
                if (!settings[formatKey]) continue;

                const wrapper = settings[key];
                if (!wrapper) continue;
                const newText = doFormat(text, wrapper, i, settings);
                if (text !== newText) {
                    text = newText;
                    i -= wrapper.length * 2;
                }
            }
        }
    }

    return text;
}
