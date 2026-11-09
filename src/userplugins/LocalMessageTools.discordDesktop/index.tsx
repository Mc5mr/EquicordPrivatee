/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Alerts, FluxDispatcher, Menu, MessageStore, TextArea, UserStore,useState } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";

interface Override { channelId: string; content: string; hidden: boolean; }
const overrides = new Map<string, Override>();

function rerender(channelId: string, id: string) {
    const message = MessageStore.getMessage(channelId, id);
    if (message) FluxDispatcher.wait(() => FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", message }));
}

function restore(id: string) {
    const value = overrides.get(id);
    overrides.delete(id);
    if (value) rerender(value.channelId, id);
}

function restoreAll() { for (const id of [...overrides.keys()]) restore(id); }

function Editor({ message }: { message: Message; }) {
    const [text, setText] = useState(overrides.get(message.id)?.content ?? message.content);
    const [applied, setApplied] = useState(false);
    return <Panel><p>التغيير يظهر عندك فقط. الرسالة الأصلية تبقى كما هي عند الطرف الآخر وفي Discord.</p>
        <TextArea value={text} onChange={setText} maxLength={4000} />
        <Button onClick={() => {
            if (message.author.id !== UserStore.getCurrentUser()?.id) return;
            overrides.set(message.id, { channelId: message.channel_id, content: text, hidden: false });
            rerender(message.channel_id, message.id);
            setApplied(true);
        }}>تطبيق محلي</Button>{applied && <p>تم تطبيق النسخة المحلية.</p>}
    </Panel>;
}

const messageContext: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!message) return;
    children.push(<Menu.MenuItem key="mc5mr-local-message" id="mc5mr-local-message" label="Local Message Tools · محلي فقط">
        <Menu.MenuItem id="mc5mr-local-hide" label="إخفاء المحتوى عندي فقط" action={() => {
            overrides.set(message.id, { channelId: message.channel_id, content: "[محتوى مخفي محليًا]", hidden: true });
            rerender(message.channel_id, message.id);
        }} />
        <Menu.MenuItem id="mc5mr-local-edit" label="تعديل نسختي المحلية" disabled={message.author.id !== UserStore.getCurrentUser()?.id} action={() => Alerts.show({ title: "Local Edit", body: <Editor message={message} /> })} />
        <Menu.MenuItem id="mc5mr-local-restore" label="استعادة العرض الأصلي" disabled={!overrides.has(message.id)} action={() => restore(message.id)} />
    </Menu.MenuItem>);
};

export default definePlugin({
    name: "LocalMessageTools",
    description: "Local content redaction and local editing of your own messages. Never changes remote messages.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    dependencies: ["NightcordUI"],
    tags: ["Utility", "Chat"],
    patches: [{
        find: '.CUSTOM_GIFT?""',
        replacement: { match: /\i\.memo\(function\((\i)\)\{(?=let \i,\i)/, replace: "$&$1.message=$self.transformMessage($1?.message);" }
    }],
    transformMessage(message: Message | undefined) {
        if (!message) return message;
        const value = overrides.get(message.id);
        if (!value) return message;
        const edited = message.set("content", value.content);
        return value.hidden ? edited.set("attachments", []).set("embeds", []).set("stickerItems", []) : edited;
    },
    settingsAboutComponent: () => <Panel><p>هذه وظائف محلية. لا تُنفذ Silent Delete أو Silent Edit عند الآخرين. تختفي التعديلات بعد إعادة التشغيل.</p><Button onClick={restoreAll}>استعادة جميع الرسائل</Button></Panel>,
    contextMenus: { message: messageContext },
    flux: { LOGOUT() { overrides.clear(); } },
    stop: restoreAll
});
