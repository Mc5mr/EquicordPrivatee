/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { getMainChatEditorRoot } from "./chatScope";
import { FormatAction } from "./formats";

interface SlateEditor {
    selection: {
        anchor: { path: unknown; offset: number; };
        focus: { path: unknown; offset: number; };
    };
    apply(op: { type: string; text?: string; path?: unknown; offset?: number; }): void;
}

interface SlateHost {
    focus(): void;
    ref: { current: { getSlateEditor(): SlateEditor; } | null; };
}

function getFiberKey(node: Element): string | undefined {
    return Object.keys(node).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
}

function findSlateHost(start: Element | null): SlateHost | null {
    let el: Element | null = start;
    while (el) {
        const key = getFiberKey(el);
        if (key) {
            let fiber = (el as unknown as Record<string, unknown>)[key] as { return?: unknown; stateNode?: SlateHost; } | undefined;
            while (fiber) {
                const host = fiber.stateNode;
                if (host?.ref?.current?.getSlateEditor) return host;
                fiber = fiber.return as typeof fiber;
            }
        }
        el = el.parentElement;
    }
    return null;
}

function getTextArea(editorRoot?: HTMLElement | null): HTMLElement | null {
    return editorRoot ?? getMainChatEditorRoot();
}

function focusEditor(editorRoot?: HTMLElement | null) {
    const host = findSlateHost(getTextArea(editorRoot));
    host?.focus();
}

function insertText(text: string, editorRoot?: HTMLElement | null) {
    focusEditor(editorRoot);
    if (document.execCommand("insertText", false, text)) return;

    const textArea = getTextArea(editorRoot);
    const host = findSlateHost(textArea);
    const slate = host?.ref?.current?.getSlateEditor();
    if (!slate?.selection) return;

    const { anchor } = slate.selection;
    slate.apply({ type: "insert_text", text, path: anchor.path, offset: anchor.offset });
    host?.focus();
}

function getSelectedText(): string {
    return window.getSelection()?.toString() ?? "";
}

function wrapSelection(leftWrapper: string, rightWrapper = leftWrapper, editorRoot?: HTMLElement | null) {
    if (leftWrapper.startsWith("```")) leftWrapper += "\n";
    if (rightWrapper.startsWith("```")) rightWrapper = "\n" + rightWrapper;

    const textArea = getTextArea(editorRoot);
    if (!textArea) return;

    const host = findSlateHost(textArea);
    const slate = host?.ref?.current?.getSlateEditor();
    if (!slate?.selection) return;

    let offset: number;
    if (slate.selection.anchor.offset <= slate.selection.focus.offset) {
        offset = slate.selection.focus.offset + leftWrapper.length;
        slate.apply({ type: "insert_text", text: leftWrapper, path: slate.selection.anchor.path, offset: slate.selection.anchor.offset });
        slate.apply({ type: "insert_text", text: rightWrapper, path: slate.selection.focus.path, offset: slate.selection.focus.offset });
    } else {
        offset = slate.selection.anchor.offset + leftWrapper.length;
        slate.apply({ type: "insert_text", text: rightWrapper, path: slate.selection.anchor.path, offset: slate.selection.anchor.offset });
        slate.apply({ type: "insert_text", text: leftWrapper, path: slate.selection.focus.path, offset: slate.selection.focus.offset });
    }

    slate.selection = {
        anchor: { path: slate.selection.anchor.path, offset },
        focus: { path: slate.selection.focus.path, offset }
    };
    slate.apply({ type: "insert_text", text: "", path: slate.selection.anchor.path, offset });
    host?.focus();
}

function insertAtSelectionStart(text: string, editorRoot?: HTMLElement | null) {
    const textArea = getTextArea(editorRoot);
    const host = findSlateHost(textArea);
    const slate = host?.ref?.current?.getSlateEditor();
    if (!slate?.selection) return;

    const anchorFirst = slate.selection.anchor.offset <= slate.selection.focus.offset;
    const path = anchorFirst ? slate.selection.anchor.path : slate.selection.focus.path;
    const offset = anchorFirst ? slate.selection.anchor.offset : slate.selection.focus.offset;

    slate.apply({ type: "insert_text", text, path, offset });
    host?.focus();
}

function prefixAtCursor(prefix: string, editorRoot?: HTMLElement | null) {
    insertAtSelectionStart(prefix, editorRoot);
}

function prefixSelectedLines(prefix: string, editorRoot?: HTMLElement | null) {
    const selected = getSelectedText();
    if (!selected) {
        prefixAtCursor(prefix, editorRoot);
        return;
    }
    insertText(selected.split("\n").map(line => prefix + line).join("\n"), editorRoot);
}

function prefixOrderedList(editorRoot?: HTMLElement | null) {
    const selected = getSelectedText();
    if (!selected) {
        prefixAtCursor("1. ", editorRoot);
        return;
    }
    insertText(
        selected.split("\n").map((line, i) => `${i + 1}. ${line}`).join("\n"),
        editorRoot
    );
}

function applyMaskedLink(editorRoot?: HTMLElement | null) {
    const label = getSelectedText() || "link text";
    const url = prompt("Enter URL for masked link:", "https://");
    if (!url) return;
    insertText(`[${label}](${url})`, editorRoot);
}

export function applyFormat(action: FormatAction, bfrWrapper?: string, editorRoot?: HTMLElement | null) {
    switch (action.type) {
        case "wrap":
            wrapSelection(action.left, action.right, editorRoot);
            break;
        case "prefix":
            prefixAtCursor(action.text, editorRoot);
            break;
        case "linePrefix":
            prefixSelectedLines(action.prefix, editorRoot);
            break;
        case "orderedList":
            prefixOrderedList(editorRoot);
            break;
        case "maskedLink":
            applyMaskedLink(editorRoot);
            break;
        case "bfr":
            if (bfrWrapper) wrapSelection(bfrWrapper, bfrWrapper, editorRoot);
            break;
    }
}
