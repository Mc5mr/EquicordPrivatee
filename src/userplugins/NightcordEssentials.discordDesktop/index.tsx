/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { PluginCard } from "@components/settings/tabs/plugins/PluginCard";
import definePlugin from "@utils/types";
import { closeModal, Modal, openModal, React, TextInput } from "@webpack/common";

import Plugins from "~plugins";

import { Panel, Status } from "../NightcordUI.discordDesktop/ui";
import style from "./styles.css?managed";

const MODAL_KEY = "mc5mr-essentials";
const CATALOG = ["PinDMs", "ChannelTabs", "BetterFolders", "BetterUploadButton", "ImageZoom", "QuickReply", "ReadAllNotificationsButton", "VoiceDownload", "MemberCount", "PermissionsViewer"];
function Catalog() {
    useSettings();
    const [query, setQuery] = React.useState("");
    const [restart, setRestart] = React.useState(false);
    return <Panel><p>إضافات مختارة موجودة في Equicord. فعّل ما تحتاجه؛ يحتفظ كل بلوقن بإعداداته ومؤلفيه الأصليين.</p><TextInput value={query} onChange={setQuery} placeholder="Search useful plugins…" aria-label="Search useful plugins" />{restart && <Status>أعد تشغيل Discord لتطبيق تغييرات البلوقنات التي تحتاج إعادة تشغيل.</Status>}<div className="vc-nc-essentials-grid">{CATALOG.map(name => Plugins[name]).filter(plugin => plugin && `${plugin.name} ${plugin.description}`.toLowerCase().includes(query.toLowerCase())).map(plugin => <PluginCard key={plugin.name} plugin={plugin} onRestartNeeded={() => setRestart(true)} />)}</div></Panel>;
}
function open() { openModal(props => <Modal {...props} title="Useful Equicord Plugins" size="xl"><Catalog /></Modal>, { modalKey: MODAL_KEY }); }
export default definePlugin({
    name: "NightcordEssentials",
    description: "Choose ten useful existing Equicord plugins using their native settings and controls.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }], tags: ["Utility"],
    dependencies: ["NightcordUI"], managedStyle: style,
    settingsAboutComponent: () => <Button onClick={open}>Useful plugins</Button>,
    stop() { closeModal(MODAL_KEY); }
});
