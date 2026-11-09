/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { findCssClassesLazy } from "@webpack";

const TextareaClasses = findCssClassesLazy("channelTextArea", "textArea");

function safeClass(key: string): string { try { return TextareaClasses[key] ?? key; } catch { return key; } }

const PROFILE_CLASS_FRAGMENTS = [
    "userProfile",
    "profileModal",
    "userPopout",
    "profileBody",
    "accountProfile",
    "userProfileModal",
    "userProfileOuter",
    "userProfileSidebar",
    "profilePanel",
    "userPanelOuter"
];

/** The channel text area that hosts the main chat bar (and our Aa button). */
export function getMainChatChannelRoot(): HTMLElement | null {
    const channelTextAreaClass = safeClass("channelTextArea");
    const textAreaClass = safeClass("textArea");

    const icon = document.querySelector(".bf-chatbar-icon");
    if (icon) {
        const root = icon.closest(`[class*="${channelTextAreaClass}"]`) as HTMLElement | null;
        if (root) return root;
    }

    // Fallback before the chat bar button mounts: pick the visible main input at the bottom of the window.
    let best: HTMLElement | null = null;
    let bestWidth = 0;

    for (const candidate of document.querySelectorAll<HTMLElement>(`[class*="${channelTextAreaClass}"]`)) {
        if (!isAllowedChatContainer(candidate)) continue;
        if (!candidate.querySelector(`[class*="${textAreaClass}"]`)) continue;

        const rect = candidate.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 20) continue;
        if (rect.top < window.innerHeight * 0.35) continue;

        if (rect.width > bestWidth) {
            bestWidth = rect.width;
            best = candidate;
        }
    }

    return best;
}

function isAllowedChatContainer(container: Element): boolean {
    for (const fragment of PROFILE_CLASS_FRAGMENTS) {
        if (container.closest(`[class*="${fragment}"]`)) return false;
    }
    return true;
}

/** True only for the main channel chat box, not profile / popout message fields. */
export function isMainChannelChat(textAreaWrapper: Element): boolean {
    if (!isAllowedChatContainer(textAreaWrapper)) return false;

    const channelTextAreaClass = safeClass("channelTextArea");
    const container = textAreaWrapper.closest(`[class*="${channelTextAreaClass}"]`);
    if (!container) return false;

    const mainRoot = getMainChatChannelRoot();
    return mainRoot != null && container === mainRoot;
}

export function getMainChatEditorRoot(): HTMLElement | null {
    const channelRoot = getMainChatChannelRoot();
    if (!channelRoot) return null;

    const textAreaClass = safeClass("textArea");
    const wrapper = channelRoot.querySelector(`[class*="${textAreaClass}"]`);
    if (wrapper?.firstElementChild instanceof HTMLElement) return wrapper.firstElementChild;
    return null;
}
