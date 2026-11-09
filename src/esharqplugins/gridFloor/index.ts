/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { disableStyle, enableStyle } from "@api/Styles";
import definePlugin from "@utils/types";

import style from "./style.css?managed";

export default definePlugin({
    name: "GridFloor",
    description: "Scrolling retro grid floor along the bottom of the window.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Appearance", "Fun"],
    start: () => enableStyle(style),
    stop: () => disableStyle(style),
});
