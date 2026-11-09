/*
 * SavedTexts - Vencord userplugin
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * SPDX-License-Identifier: MIT
 *
 * See LICENSE in this directory for redistribution terms.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import "./style.css";

import { ChatBarButton } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { IconComponent } from "@utils/types";
import { closeModal, Menu, Modal, openModal } from "@webpack/common";

import { settings } from "./settings";
import { TextPicker } from "./TextPicker";

const MODAL_KEY = "mc5mr-saved-texts";
export const SavedTextsIcon: IconComponent = ({ height = 20, width = 20, className }) => <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2 5 5h-5V4zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>;

function openTexts(channelId: string, initialText?: string) {
    closeModal(MODAL_KEY);
    openModal(props => <ErrorBoundary><Modal {...props} size="lg" title="النصوص المحفوظة"><TextPicker channelId={channelId} initialText={initialText} onClose={props.onClose} /></Modal></ErrorBoundary>, { modalKey: MODAL_KEY });
}

const messageMenu: NavContextMenuPatchCallback = (children, { message, channel }) => {
    const content = message?.content?.trim();
    if (!content || !channel?.id) return;
    const group = findGroupChildrenByChildId("copy-text", children) ?? children;
    group.push(<Menu.MenuItem key="mc5mr-save-text" id="mc5mr-save-text" label="حفظ النص" icon={SavedTextsIcon} action={() => openTexts(channel.id, content)} />);
};

export default definePlugin({
    name: "SavedTexts",
    description: "Save text cards locally for your account and insert them into your current chat.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }, { name: "Xaenny", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    settings,
    renderChatBarButton: props => props.isMainChat && !props.disabled ? <ChatBarButton tooltip="النصوص المحفوظة" onClick={() => openTexts(props.channel.id)}><SavedTextsIcon /></ChatBarButton> : null,
    chatBarButtonIcon: SavedTextsIcon,
    contextMenus: { message: messageMenu },
    flux: { LOGOUT() { closeModal(MODAL_KEY); }, CONNECTION_OPEN() { closeModal(MODAL_KEY); } },
    stop() { closeModal(MODAL_KEY); }
});
