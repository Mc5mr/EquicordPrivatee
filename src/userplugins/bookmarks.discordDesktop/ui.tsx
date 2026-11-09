/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button, ButtonProps } from "@components/Button";
import { Tooltip, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { IconComponent, LockIcon } from "./icons";

export const cl = classNameFactory("vc-bm-");

/** A button with an icon in front of its label */
export function IconButton({ icon: Icon, children, ...props }: ButtonProps & { icon: IconComponent; }) {
    return (
        <Button size="small" {...props}>
            <Icon className={cl("btn-icon")} height={16} width={16} />
            {children}
        </Button>
    );
}

/** An icon-only button with its name on hover. Clicks on it do not reach the row it sits on. */
export function RoundButton({ icon: Icon, label, danger, onClick }: { icon: IconComponent; label: string; danger?: boolean; onClick(): void; }) {
    return (
        <Tooltip text={label}>
            {(props: any) => (
                <button
                    {...props}
                    type="button"
                    aria-label={label}
                    className={cl("round", danger ? "round-danger" : "")}
                    onClick={event => {
                        event.stopPropagation();
                        onClick();
                    }}
                >
                    <Icon height={18} width={18} />
                </button>
            )}
        </Tooltip>
    );
}

/**
 * The card at the top of a plugin's settings: what it does, in one line.
 *
 * The steps are there for whoever wants them - one click opens them - and out of the way for
 * everybody who already knows. The page leads with the settings, not a manual.
 */
export function About({ icon: Icon, title, steps, note = "Only you see this. Nothing is sent to Discord." }: {
    icon: IconComponent;
    title: string;
    steps: ReactNode[];
    /** kept for the plugins that still pass it; the menu choice lives on Additional Settings now */
    menus?: boolean;
    /** the line under the steps, or false where there is nothing to say */
    note?: string | false;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className={cl("about", open ? "about-open" : "")}>
            <button type="button" className={cl("about-head")} aria-expanded={open} onClick={() => setOpen(o => !o)}>
                <div className={cl("tile")}>
                    <Icon height={20} width={20} />
                </div>
                <div className={cl("about-title")}>{title}</div>
                <span className={cl("about-more")}>
                    How it works
                    <svg aria-hidden viewBox="0 0 24 24" height={16} width={16} className={cl("about-chevron")}>
                        <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                </span>
            </button>
            {open && (
                <div className={cl("about-body")}>
                    <ol className={cl("steps")}>
                        {steps.map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                    {note && (
                        <div className={cl("private")}>
                            <LockIcon height={14} width={14} />
                            <span>{note}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** A list that shows its first few and a way to the rest, so a page never grows without end */
export function Rows({ children, first = 6 }: { children: ReactNode[]; first?: number; }) {
    const [all, setAll] = useState(false);
    const list = children.filter(Boolean);
    const extra = list.length - first;

    return (
        <div className={cl("rows")}>
            {all || extra <= 1 ? list : list.slice(0, first)}
            {extra > 1 && (
                <button type="button" className={cl("show-all")} onClick={() => setAll(a => !a)}>
                    {all ? "Show less" : `Show all ${list.length}`}
                </button>
            )}
        </div>
    );
}

/** A titled block with its actions on the right */
export function Panel({ title, count, actions, children }: { title?: string; count?: number; actions?: ReactNode; children?: ReactNode; }) {
    return (
        <div className={cl("panel")}>
            {(title || actions) && (
                <div className={cl("panel-head")}>
                    <div className={cl("panel-title")}>
                        {title}
                        {count != null && <span className={cl("pill")}>{count}</span>}
                    </div>
                    {actions && <div className={cl("actions")}>{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

/** One entry in a list: a picture, a name, a quieter line under it, and what can be done */
export function Row({ image, icon: Icon, round = true, name, detail, children, onClick, title }: {
    image?: string | null;
    icon?: IconComponent;
    round?: boolean;
    name: ReactNode;
    detail?: ReactNode;
    children?: ReactNode;
    /** the row itself opens something - the person, the chat */
    onClick?(): void;
    title?: string;
}) {
    return (
        <div
            className={cl("row", onClick ? "row-click" : "")}
            title={title}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick && (event => event.key === "Enter" && onClick())}
        >
            {image
                ? <img className={cl("avatar", round ? "avatar-round" : "avatar-square")} src={image} alt="" />
                : (
                    <div className={cl("avatar", "avatar-blank", round ? "avatar-round" : "avatar-square")}>
                        {Icon ? <Icon height={16} width={16} /> : String(name).slice(0, 1).toUpperCase()}
                    </div>
                )}
            <div className={cl("row-text")}>
                <div className={cl("row-name")}>{name}</div>
                {detail && <div className={cl("row-detail")}>{detail}</div>}
            </div>
            {children && <div className={cl("actions")}>{children}</div>}
        </div>
    );
}

/** What a list says when there is nothing in it */
export function Empty({ icon: Icon, title, text }: { icon: IconComponent; title: string; text: string; }) {
    return (
        <div className={cl("empty")}>
            <Icon height={22} width={22} />
            <div className={cl("empty-title")}>{title}</div>
            <div className={cl("empty-text")}>{text}</div>
        </div>
    );
}

/** A small tick, drawn here so this file needs nothing from the plugin's own icons */
function Tick() {
    return (
        <svg aria-hidden viewBox="0 0 24 24" height={14} width={14}>
            <path fill="currentColor" d="M9 16.17L4.17 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
    );
}

/**
 * Where a plugin's right-click entries appear, as one row of toggles.
 *
 * Instead of a switch per menu, each with a sentence saying the same thing about a different
 * place. The switches it stands for are still the settings underneath, only not drawn.
 */
export function menuChips(store: () => any, title: string, detail: string, items: { key: string; label: string; }[]) {
    return function MenuChips() {
        const settings = store();
        const values = settings.use(items.map(item => item.key));

        return (
            <div className={cl("menus")}>
                <div className={cl("menus-title")}>{title}</div>
                <div className={cl("menus-detail")}>{detail}</div>
                <div className={cl("menu-chips")} role="group" aria-label={title}>
                    {items.map(({ key, label }) => {
                        const on = values[key] !== false;

                        return (
                            <button
                                key={key}
                                type="button"
                                className={cl("menu-chip", on ? "menu-chip-on" : "")}
                                aria-pressed={on}
                                onClick={() => void (settings.store[key] = !on)}
                            >
                                {on && <Tick />}
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };
}

const HOVER_CHOICES = [["always", "Always"], ["ctrl", "Holding Ctrl"], ["never", "Never"]] as const;

/**
 * When a plugin's hover button shows, as its own choice.
 *
 * Only drawn without Additional Settings: with it, Hover buttons there decides for every
 * plugin at once, and a second answer here would only contradict it.
 */
export function hoverChoice(store: () => any, detail: string) {
    return function HoverChoice() {
        const settings = store();
        const { button } = settings.use(["button"]);
        if ((window as any).vcHoverMode !== undefined) return null;

        const current = button ?? "ctrl";
        return (
            <div className={cl("menus")}>
                <div className={cl("menus-title")}>Hover button</div>
                <div className={cl("menus-detail")}>{detail}</div>
                <div className={cl("menu-chips")} role="radiogroup" aria-label="Hover button">
                    {HOVER_CHOICES.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={current === value}
                            className={cl("menu-chip", current === value ? "menu-chip-on" : "")}
                            onClick={() => void (settings.store.button = value)}
                        >
                            {current === value && <Tick />}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    };
}

/** One choice out of a few, drawn as the same chips as the menu ones: "Show" -> Whole call / Your time / Both */
export function choiceChips(store: () => any, key: string, title: string, detail: string, options: readonly (readonly [string, string])[]) {
    return function ChoiceChips() {
        const settings = store();
        const current = settings.use([key])[key] ?? options[0][0];

        return (
            <div className={cl("menus")}>
                <div className={cl("menus-title")}>{title}</div>
                <div className={cl("menus-detail")}>{detail}</div>
                <div className={cl("menu-chips")} role="radiogroup" aria-label={title}>
                    {options.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={current === value}
                            className={cl("menu-chip", current === value ? "menu-chip-on" : "")}
                            onClick={() => void (settings.store[key] = value)}
                        >
                            {current === value && <Tick />}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    };
}
