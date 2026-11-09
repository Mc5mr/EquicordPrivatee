/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { relaunch } from "@utils/native";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "QuickRestart",
    description: "Reload the current Discord window or restart the client from plugin settings.",
    authors: [{ name: "reqon", id: 497562304498368513n }],
    settingsAboutComponent: () => <div>
        <p>Adapted by Mc5mr from reqon's QuickRestart. Restarting may interrupt your current call.</p>
        <Button onClick={() => location.reload()}>Reload window</Button>
        <Button onClick={relaunch}>Restart Discord</Button>
    </div>,
    toolboxActions: {
        "Reload window": () => location.reload(),
        "Restart Discord": relaunch
    }
});
