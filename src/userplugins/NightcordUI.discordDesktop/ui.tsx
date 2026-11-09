/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React } from "@webpack/common";
import type { ReactNode } from "react";

export const ui = classNameFactory("vc-nc-");

export function Panel({ children, className = "", dir = "rtl" }: { children: ReactNode; className?: string; dir?: "rtl" | "ltr"; }) {
    return <div className={`${ui("panel")} ${className}`} dir={dir}>{children}</div>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string; }) {
    return <div className={ui("empty")}><strong>{title}</strong>{detail && <p>{detail}</p>}</div>;
}

export function Status({ children, error = false }: { children: ReactNode; error?: boolean; }) {
    return children ? <div className={ui("status", { error })} role={error ? "alert" : "status"}>{children}</div> : null;
}

