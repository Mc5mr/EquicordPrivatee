/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Message } from "@vencord/discord-types";
import { Modal, openModal, Parser, useEffect, useState } from "@webpack/common";

import { TranslateIcon } from "./TranslateIcon";
import { cl, TranslationValue } from "./utils";

const TranslationSetters = new Set<{ messageId: string; handleTranslation(v: TranslationValue): void; }>();

export function handleTranslate(messageId: string, data: TranslationValue) {
    let applied = false;
    for (const setter of TranslationSetters) {
        if (setter.messageId !== messageId) continue;
        setter.handleTranslation(data);
        applied = true;
    }
    if (!applied) openModal(props => <Modal {...props} title="Translation" size="sm">{Parser.parse(data.text)}</Modal>);
}

function Dismiss({ onDismiss }: { onDismiss: () => void; }) {
    return (
        <button
            onClick={onDismiss}
            className={cl("dismiss")}
        >
            Dismiss
        </button>
    );
}

export function TranslationAccessory({ message }: { message: Message; }) {
    const [translation, setTranslation] = useState<TranslationValue>();

    useEffect(() => {
        // Ignore MessageLinkEmbeds messages
        if ("vencordEmbeddedBy" in message && message.vencordEmbeddedBy) return;

        const setter = { messageId: message.id, handleTranslation: setTranslation };
        TranslationSetters.add(setter);
        return () => void TranslationSetters.delete(setter);
    }, [message.id]);

    if (!translation) return null;

    return (
        <span className={cl("accessory")}>
            <TranslateIcon width={16} height={16} className={cl("accessory-icon")} />
            {Parser.parse(translation.text)}
            <br />
            (translated from {translation.sourceLanguage} - <Dismiss onDismiss={() => setTranslation(undefined)} />)
        </span>
    );
}
