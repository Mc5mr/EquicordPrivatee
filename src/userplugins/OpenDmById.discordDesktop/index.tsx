/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import { CopyIdIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import { openPrivateChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import type { RenderModalProps } from "@vencord/discord-types";
import { closeModal, Modal, openModal, TextInput, useState } from "@webpack/common";

import { Panel, Status } from "../NightcordUI.discordDesktop/ui";

const MODAL_KEY = "mc5mr-open-dm-by-id";
const cl = classNameFactory("vc-mc5mr-open-dm-");

const headerCl = classNameFactory("vc-mc5mr-header-");

function OpenDmModal(props: RenderModalProps) {
    const [userId, setUserId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function open() {
        if (busy || !/^\d{17,20}$/.test(userId.trim())) return;
        setBusy(true);
        try { await openPrivateChannel(userId.trim()); props.onClose(); }
        catch { setError("Could not open this DM. Check the user ID."); }
        finally { setBusy(false); }
    }
    return <Modal {...props} size="md" title="Open Direct Message" actions={[{ text: "Open DM", variant: "primary", disabled: busy || !/^\d{17,20}$/.test(userId.trim()), onClick: () => void open() }, { text: "Cancel", variant: "secondary", onClick: props.onClose }]}>
        <Panel className={cl("form")}><h3>آيدي المستخدم</h3><p>أدخل الآيدي لفتح المحادثة.</p><TextInput value={userId} onChange={value => { setUserId(value); setError(""); }} placeholder="123456789012345678" disabled={busy} aria-label="User ID" /><Status error>{error}</Status></Panel>
    </Modal>;
}

function openDialog() { openModal(props => <OpenDmModal {...props} />, { modalKey: MODAL_KEY }); }

export default definePlugin({
    name: "OpenDmById",
    description: "Open a DM by a public Discord user ID using your current signed-in session.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Friends"],
    dependencies: ["NightcordUI"],
    headerBarButton: { priority: -10, icon: CopyIdIcon, render: () => <HeaderBarButton className={headerCl("button")} icon={CopyIdIcon} tooltip="فتح الخاص بالأيدي" onClick={openDialog} /> },
    settingsAboutComponent: () => <Panel><p>افتح الخاص من خلال آيدي المستخدم.</p><Button onClick={openDialog}>فتح الخاص بالأيدي</Button></Panel>,
    stop() { closeModal(MODAL_KEY); }
});
