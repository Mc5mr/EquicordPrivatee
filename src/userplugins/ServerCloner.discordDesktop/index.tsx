/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import definePlugin from "@utils/types";
import type { Guild } from "@vencord/discord-types";
import { closeModal, ConfirmModal, GuildStore, Menu, Modal, openModal, PermissionsBits, PermissionStore, React, Select, UserStore, useStateFromStores } from "@webpack/common";

import { EmptyState, Panel, ui } from "../NightcordUI.discordDesktop/ui";
import { CloneOptions, cloneStructure } from "./clone";

const MODAL_KEY = "mc5mr-server-cloner";
const CONFIRM_KEY = "mc5mr-server-cloner-confirm";
let running = false;
let task: { cancelled: boolean; } | undefined;

const guildContext: NavContextMenuPatchCallback = (children, { guild }: { guild: Guild; }) => {
    if (!guild) return;
    children.push(<Menu.MenuItem key="mc5mr-cloner" id="mc5mr-cloner" label="Server Cloner" action={() => openCloner(guild.id)} />);
};

const OPTIONS: { key: keyof CloneOptions; label: string; }[] = [
    { key: "settings", label: "Server settings" }, { key: "icon", label: "Icon" },
    { key: "roles", label: "Roles" }, { key: "clearRoles", label: "Delete existing roles" },
    { key: "channels", label: "Channels" }, { key: "clearChannels", label: "Delete existing channels" },
    { key: "permissions", label: "Permissions" }, { key: "emojis", label: "Emojis" }
];

function Cloner({ initialSource }: { initialSource: string; }) {
    const guilds = useStateFromStores([GuildStore, PermissionStore], () => Object.values(GuildStore.getGuilds()).sort((a, b) => a.name.localeCompare(b.name)));
    const [sourceId, setSourceId] = React.useState(initialSource);
    const [targetId, setTargetId] = React.useState("");
    const [options, setOptions] = React.useState<CloneOptions>({ roles: true, clearRoles: false, channels: true, clearChannels: false, permissions: true, settings: false, icon: false, emojis: false });
    const [working, setWorking] = React.useState(false);
    const [logs, setLogs] = React.useState<string[]>([]);
    const mounted = React.useRef(true);
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (task) task.cancelled = true; closeModal(CONFIRM_KEY); }; }, []);
    const sources = guilds.map(guild => ({ label: guild.name, value: guild.id }));
    const targets = guilds.filter(guild => guild.id !== sourceId && PermissionStore.can(PermissionsBits.ADMINISTRATOR, guild)).map(guild => ({ label: guild.name, value: guild.id }));
    const target = GuildStore.getGuild(targetId);
    const valid = target && sourceId !== targetId && targets.some(option => option.value === targetId) && (!options.permissions || options.roles) && (options.roles || options.channels || options.icon || options.emojis || options.settings);

    async function startClone() {
        if (!valid || task || working || !running) return;
        const owner = UserStore.getCurrentUser()?.id;
        const selected = { ...options };
        setWorking(true);
        const active = { cancelled: false };
        task = active;
        setLogs([]);
        try {
            const confirmed = await new Promise<boolean>(resolve => openModal(props => <ConfirmModal {...props} title="مراجعة نسخ السيرفر" confirmText="بدء النسخ إلى الهدف" cancelText="إلغاء" onConfirm={() => { resolve(true); props.onClose(); }} onCancel={props.onClose}>
                <div dir="rtl"><p>{GuildStore.getGuild(sourceId)?.name} → {target?.name}</p><p>{OPTIONS.filter(option => selected[option.key]).map(option => option.label).join("، ")}</p><p>هذه عملية فعلية على السيرفر الهدف. {selected.clearChannels ? "حذف القنوات يحذف رسائلها ولا يمكن التراجع عنه." : "ستبقى القنوات الموجودة."} {selected.clearRoles ? "ستُحذف الرولات القابلة للإدارة، مع استثناء رولاتك ورولات التكامل." : "ستبقى الرولات الموجودة؛ النسخ مرة أخرى قد ينشئ نسخًا مكررة."}</p><p>لن تُنسخ العضويات أو الرسائل أو رسائل البوت. رولات التكامل التي لا يوجد لها مقابل تُنسخ كرولات عادية.</p>{selected.permissions && <p>نقل صلاحيات @everyone يغيّر أيضًا صلاحيات القنوات القديمة في الهدف. عند فشل النسخ أو إيقافه تبقى التغييرات المكتملة وقد تبقى القنوات الجديدة مخفية مؤقتًا؛ راجع السجل.</p>}</div>
            </ConfirmModal>, { modalKey: CONFIRM_KEY, onCloseCallback: () => resolve(false) }));
            if (!confirmed || active.cancelled || !mounted.current || owner !== UserStore.getCurrentUser()?.id || !running) return;
            setLogs(["جارٍ فحص السيرفر المصدر والهدف والصلاحيات قبل النسخ…"]);
            await cloneStructure(sourceId, targetId, selected, { cancelled: () => active.cancelled || !running, log: text => { if (mounted.current) setLogs(current => [...current.slice(-199), text]); } });
        } catch (error) { if (mounted.current) setLogs(current => [...current, error instanceof Error ? error.message : "رفض Discord طلبًا أو قيّد النسخ؛ توقفت العملية."]); }
        finally { if (task === active) task = undefined; if (mounted.current) setWorking(false); }
    }

    return <Panel dir="ltr"><div className={ui("grid")}><div className={ui("field")}><span>Source server</span><Select options={sources} isSelected={value => value === sourceId} select={setSourceId} serialize={value => value} isDisabled={working} placeholder="Choose a source server" /></div><div className={ui("field")}><span>Target server · ADMIN required</span><Select options={targets} isSelected={value => value === targetId} select={setTargetId} serialize={value => value} isDisabled={working} placeholder="Choose a target server" /></div></div><h3>Cloning options</h3><div className={ui("grid")}>{OPTIONS.map(option => <FormSwitch key={option.key} title={option.label} value={options[option.key]} onChange={value => setOptions(current => ({ ...current, [option.key]: value }))} disabled={working} hideBorder />)}</div><p className={ui("muted")} dir="rtl">ينسخ الرولات والصلاحيات والقنوات المتاحة لك. الحذف متوقف افتراضيًا؛ راجع الخيارات والهدف قبل التشغيل.</p><div className={ui("actions")}><Button disabled={!valid || working || !!task} onClick={() => void startClone()}>{working ? "Cloning…" : "Start cloning"}</Button><Button variant="dangerSecondary" disabled={!working} onClick={() => { if (task) task.cancelled = true; }}>Stop</Button></div>{logs.length ? <div className={ui("scroll")} role="log">{logs.map((text, index) => <p className={ui("log-entry")} key={`${index}:${text}`}>{text}</p>)}</div> : <EmptyState title="No operations yet" detail="Choose source, target, and cloning options." />}</Panel>;
}

function openCloner(sourceId = "") { openModal(props => <Modal {...props} title="Server Cloner" size="xl"><Cloner initialSource={sourceId} /></Modal>, { modalKey: MODAL_KEY }); }

export default definePlugin({
    name: "ServerCloner",
    description: "Copy accessible roles, permissions and channels to a selected server you administer.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Utility", "Servers"],
    dependencies: ["NightcordUI"],
    contextMenus: { "guild-context": guildContext },
    settingsAboutComponent: () => <Button onClick={() => openCloner()}>Open Server Cloner</Button>,
    start() { running = true; },
    stop() { running = false; if (task) task.cancelled = true; closeModal(CONFIRM_KEY); closeModal(MODAL_KEY); },
    flux: { LOGOUT() { if (task) task.cancelled = true; closeModal(CONFIRM_KEY); closeModal(MODAL_KEY); } }
});
