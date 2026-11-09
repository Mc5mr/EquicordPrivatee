/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { FolderIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import definePlugin from "@utils/types";

import { closeImporter, openImporter } from "./ui";

const headerCl = classNameFactory("vc-mc5mr-header-");

function ImporterButton() {
    return <HeaderBarButton className={headerCl("button")} icon={FolderIcon} tooltip="Token Importer" onClick={openImporter} aria-label="Open Token Importer" />;
}

export default definePlugin({
    name: "TokenImporter",
    description: "Import your own account tokens, save them encrypted locally, and click an account to sign in.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Organisation"],
    dependencies: ["HeaderBarAPI", "NightcordUI"],
    headerBarButton: {
        icon: FolderIcon,
        render: () => <ErrorBoundary noop><ImporterButton /></ErrorBoundary>,
        priority: 1200
    },
    settingsAboutComponent: () => <div className="vc-ti-about">
        <p>Open the folder icon in the top bar to manage your own accounts.</p>
        <Button onClick={openImporter}>Open Token Importer</Button>
    </div>,
    stop: closeImporter
});
