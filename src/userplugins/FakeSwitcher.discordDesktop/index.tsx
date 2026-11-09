/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addGlobalContextMenuPatch, GlobalContextMenuPatchCallback, removeGlobalContextMenuPatch } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { fetchUserProfile } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Avatar, closeModal, ContextMenuApi, Menu, Modal, openModal, React, ReactDOM, showToast, TextInput, Toasts, UserStore, useStateFromStores } from "@webpack/common";

import { Appearance, apply, capture, reset } from "../LocalProfileCore.discordDesktop";
import { EmptyState, Panel, ui } from "../NightcordUI.discordDesktop/ui";
import style from "./styles.css?managed";

const settings = definePluginSettings({
    accounts: { type: OptionType.CUSTOM, description: "Profile IDs saved separately for each signed-in account.", default: {} as Record<string, string[]> },
    profiles: { type: OptionType.CUSTOM, description: "Saved public appearance snapshots, scoped to each account.", default: {} as Record<string, Record<string, Appearance>> },
    selected: { type: OptionType.CUSTOM, description: "Session-only local profile preview.", default: "" }
});
const KEYS: ("accounts" | "selected" | "profiles")[] = ["accounts", "selected", "profiles"];
const MODAL_KEY = "mc5mr-fake-switcher";
let running = false;
const managerListeners = new Set<() => void>();
let managerRevision = 0;
let management: { owner: string; before: Set<Element>; } | null = null;
function publishManager() { managerRevision++; managerListeners.forEach(listener => listener()); }
function subscribeManager(listener: () => void) { managerListeners.add(listener); return () => { managerListeners.delete(listener); }; }
function clearManager() { management = null; publishManager(); }
function removeProfile(owner: string, id: string) {
    if (!running || owner !== realUser()?.id) return;
    settings.store.accounts = { ...settings.store.accounts, [owner]: (settings.store.accounts[owner] ?? []).filter(value => value !== id) };
    const snapshots = { ...settings.store.profiles[owner] }; delete snapshots[id];
    settings.store.profiles = { ...settings.store.profiles, [owner]: snapshots };
    if (settings.store.selected === id) select("");
}
function requestManagement(action: (...args: unknown[]) => unknown, args: unknown[]) {
    const owner = realUser()?.id;
    if (!running || !owner) return action(...args);
    management = { owner, before: new Set(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')) };
    try { const result = action(...args); publishManager(); return result; }
    catch (error) { clearManager(); throw error; }
}
// Find the actual native row container, rather than inserting below its separator.
export function nativeAccountContainer(dialog: HTMLElement): HTMLElement | null {
    const explicit = dialog.querySelector<HTMLElement>('[class*="accountList"], [class*="userList"]');
    if (explicit) return explicit;
    const buttons = [...(dialog.querySelectorAll?.<HTMLButtonElement>("button") ?? [])];
    for (const button of buttons) {
        if (!/^(switch|log in)$/i.test((button.textContent ?? "").trim()) || button.closest(".vc-nc-fake-management-mount")) continue;
        for (let row = button.parentElement; row && row !== dialog; row = row.parentElement) {
            if (!row.querySelector('img, [class*="avatar_"]')) continue;
            const parent = row.parentElement;
            if (!parent || parent === dialog || parent.contains(buttons.find(value => /add an account/i.test(value.textContent ?? "")) ?? dialog)) break;
            return parent;
        }
    }
    // A single active native account has no Switch button.
    const active = [...(dialog.querySelectorAll?.<HTMLElement>("span, div") ?? [])].find(node => /^active account$/i.test((node.textContent ?? "").trim()));
    for (let row = active?.parentElement; row && row !== dialog; row = row.parentElement) {
        if (row.querySelector('img, [class*="avatar_"]') && row.parentElement && row.parentElement !== dialog) return row.parentElement;
    }
    return null;
}
// Presentation rows stay inside the original dialog and never enter auth stores.
// No account store entries, credentials or native removal callbacks are changed.
function ManagementLayer() {
    React.useSyncExternalStore(subscribeManager, () => managerRevision);
    const [target, setTarget] = React.useState<HTMLElement | null>(null);
    const session = management;
    React.useEffect(() => {
        setTarget(null);
        if (!session) return;
        let dialog: HTMLElement | undefined;
        let mount: HTMLElement | undefined;
        const inspect = () => {
            if (session !== management) return;
            if (session.owner !== realUser()?.id || (dialog && !dialog.isConnected)) { clearManager(); return; }
            if (dialog?.isConnected && mount?.isConnected) return;
            if (mount && !mount.isConnected) mount = undefined;
            dialog ??= [...document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')].find(node => !session.before.has(node));
            if (dialog) {
                const list = nativeAccountContainer(dialog);
                if (!mount && list) {
                    mount = document.createElement("div"); mount.className = "vc-nc-fake-management-mount";
                    list.appendChild(mount);
                }
                setTarget(mount ?? null);
            }
        };
        const observer = new MutationObserver(inspect);
        observer.observe(document.body, { childList: true, subtree: true });
        inspect();
        const timeout = setTimeout(() => { if (!dialog && session === management) clearManager(); }, 5000);
        return () => { observer.disconnect(); clearTimeout(timeout); mount?.remove(); };
    }, [session]);
    return target && session && session.owner === realUser()?.id ? ReactDOM.createPortal(<NativeLocalRows manage />, target) : null;
}
function realUser() { return UserStore.getCurrentUser(); }
const refreshes = new Set<string>();
async function refreshProfile(owner: string, id: string) {
    const key = `${owner}:${id}`;
    if (refreshes.has(key)) return;
    refreshes.add(key);
    try {
        await fetchUserProfile(id);
        const user = UserStore.getUser(id);
        if (!running || owner !== realUser()?.id || !(settings.store.accounts[owner] ?? []).includes(id) || !user?.username || user.username === id) return;
        const value = capture(user);
        if (value) settings.store.profiles = { ...settings.store.profiles, [owner]: { ...settings.store.profiles[owner], [id]: value } };
    } catch { /* Keep the saved appearance when the profile is unavailable. */ }
    finally { refreshes.delete(key); }
}

function select(id: string) {
    if (!running) return;
    const user = id ? UserStore.getUser(id) : undefined;
    const saved = settings.store.profiles[realUser()?.id ?? ""]?.[id];
    if (id && !user && !saved) return;
    let value;
    try { value = user ? capture(user) : saved ?? null; } catch { showToast("تعذر تحميل معاينة هذا الملف.", Toasts.Type.FAILURE); return; }
    if (id && !value) return;
    settings.store.selected = id;
    apply(value, "switcher");
}
function AccountLabel({ id, managed = false }: { id: string; managed?: boolean; }) {
    const { selected, profiles } = settings.use(KEYS);
    const owner = realUser()?.id;
    const user = useStateFromStores([UserStore], () => UserStore.getUser(id)); const saved = profiles[owner ?? ""]?.[id];
    const name = [user?.username, saved?.username, user?.globalName, saved?.globalName].find(value => value && value !== id) ?? "حساب محفوظ";
    const avatar = user?.username && user.username !== id ? user.getAvatarURL(undefined, 40, true) : saved?.avatarUrl;
    return <span className="vc-nc-account-label" title={id}><Avatar src={avatar} size={managed ? "SIZE_40" : "SIZE_32"} /><strong>{name}</strong>{selected === id && <span className="vc-nc-account-check" aria-label="Selected">✓</span>}</span>;
}
function logoutMenu(event: React.MouseEvent, owner: string, id: string) {
    ContextMenuApi.openContextMenu(event, () => <Menu.Menu navId="mc5mr-fake-account" onClose={ContextMenuApi.closeContextMenu}><Menu.MenuItem id="mc5mr-local-log-out" label="Log out" color="danger" action={() => removeProfile(owner, id)} /></Menu.Menu>);
}
function NativeLocalRows({ manage = false }: { manage?: boolean; } = {}) {
    const { accounts } = settings.use(KEYS);
    const owner = useStateFromStores([UserStore], () => realUser()?.id);
    if (!running || !owner) return null;
    const ids = (accounts[owner] ?? []).filter(id => id !== owner);
    if (!ids.length) return null;
    return <div className={manage ? "vc-nc-fake-managed-list" : "vc-nc-local-account-rows"}>
        {ids.map(id => manage ? <div className="vc-nc-fake-managed-row" key={id}><AccountLabel id={id} managed /><button type="button" className="vc-nc-fake-switch" onClick={() => select(id)}>Switch</button><button type="button" className="vc-nc-account-more" aria-label="Account options" onClick={event => logoutMenu(event, owner, id)}>⋯</button></div> : <button type="button" className="vc-nc-local-account-row" key={id} aria-pressed={settings.store.selected === id} onClick={() => select(id)}><AccountLabel id={id} /></button>)}
    </div>;
}
const accountMenuPatch: GlobalContextMenuPatchCallback = (_navId, children) => {
    // Native Menu items, not MultiAccountStore or auth records, get local rows.
    function inject(nodes: React.ReactNode[]): boolean {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (!React.isValidElement<{ id?: string; label?: React.ReactNode; children?: React.ReactNode; action?: (...args: unknown[]) => unknown; }>(node)) continue;
            const id = (node.props.id ?? "").replace(/[-_]/g, "").toLowerCase();
            if (id === "manageaccounts" || id === "manageaccount" || node.props.label === "Manage Accounts") {
                const original = node.props.action;
                if (original && !(original as { mc5mrManagement?: boolean; }).mc5mrManagement) {
                    const wrapped = (...args: unknown[]) => requestManagement(original, args);
                    Object.assign(wrapped, { mc5mrManagement: true }); nodes[i] = React.cloneElement(node, { action: wrapped });
                }
                if (nodes.some(entry => React.isValidElement<{ id?: string; }>(entry) && entry.props.id === "mc5mr-native-local-profiles")) return true;
                const owner = realUser();
                if (!owner) return false;
                const saved = (settings.store.accounts[owner.id] ?? []).filter(value => value !== owner.id);
                const rows = saved.map(value => {
                    const user = UserStore.getUser(value);
                    const snapshot = settings.store.profiles[owner.id]?.[value];
                    return user || snapshot ? <Menu.MenuItem key={value} id={`mc5mr-switch-${value}`} label={<AccountLabel id={value} />} action={() => select(value)} /> : null;
                });
                if (rows.some(Boolean)) nodes.splice(i, 0, <Menu.MenuGroup id="mc5mr-native-local-profiles" key="mc5mr-native-local-profiles">{rows}</Menu.MenuGroup>);
                return true;
            }
            const nested = React.Children.toArray(node.props.children);
            if (inject(nested)) {
                nodes[i] = React.cloneElement(node, { children: nested });
                return true;
            }
        }
        return false;
    }
    inject(children);
};

function Switcher() {
    const { accounts, selected, profiles } = settings.use(KEYS);
    const [query, setQuery] = React.useState("");
    const owner = useStateFromStores([UserStore], () => realUser()?.id);
    const users = useStateFromStores([UserStore], () => (owner ? accounts[owner] ?? [] : []).map(id => {
        const user = UserStore.getUser(id); const saved = profiles[owner ?? ""]?.[id];
        return user ?? (saved ? { id, globalName: saved.globalName, username: saved.username, getAvatarURL: () => saved.avatarUrl } : null);
    }).filter(user => !!user));
    const visible = users.filter(user => `${user.globalName ?? ""} ${user.username} ${user.id}`.toLowerCase().includes(query.trim().toLowerCase()));
    return <Panel><p className={ui("muted")}>معاينة الاسم والصورة عندك. أضف شخصًا بكليك يمين ثم Add to Switcher (Fake).</p><div className={ui("toolbar")}><Button variant="secondary" disabled={!selected} onClick={() => select("")}>استعادة حسابي</Button><span className={ui("count")}>{users.length} ملفًا محفوظًا</span></div><TextInput value={query} onChange={setQuery} placeholder="ابحث عن ملف" aria-label="البحث في السويتشر" />{visible.length ? <div className={ui("scroll")}>{visible.map(user => <div className={ui("row")} key={user.id}><Avatar src={user.getAvatarURL()} size="SIZE_40" /><div className={ui("identity")}><strong>{user.globalName || user.username}</strong><span>{user.id}</span></div><div className={ui("actions")}><Button size="small" disabled={selected === user.id} onClick={() => select(user.id)}>{selected === user.id ? "المعاينة الحالية" : "معاينة"}</Button><Button size="small" variant="dangerSecondary" onClick={() => {
        if (owner) removeProfile(owner, user.id);
    }}>إزالة</Button></div></div>)}</div> : <EmptyState title={query ? "لا توجد نتائج" : "لا توجد ملفات محفوظة"} detail="أضف شخصًا من قائمة الكليك يمين." />}</Panel>;
}

function open() { openModal(props => <Modal {...props} size="lg" title="Fake Switcher · محلي" actions={[{ text: "إغلاق", variant: "secondary", onClick: props.onClose }]}><Switcher /></Modal>, { modalKey: MODAL_KEY }); }

export default definePlugin({
    name: "FakeSwitcher",
    description: "Switch your local account name and avatar preview while retaining your real account ID.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    settings,
    managedStyle: style,
    tags: ["Appearance", "Utility"],
    dependencies: ["NightcordUI", "LocalProfileCore", "ServerListAPI"],
    patches: [{
        find: 'id:"manage-accounts"',
        replacement: {
            match: /(id:"manage-accounts".{0,250}?\]\}\)\)),(\i)(?=\})/,
            replace: "$1,$self.appendAccountMenu($2),$2"
        }
    }],
    appendAccountMenu(children: (React.ReactElement | null)[]) { if (running) accountMenuPatch("account", children); },
    settingsAboutComponent: () => <p dir="rtl">أضف الشخص من Add to Switcher (Fake)، ثم افتح Switch Accounts أو Manage Accounts الأصليتين. زر Switch يغيّر العرض المحلي، و⋯ ثم Log out يحذف الملف الوهمي المحفوظ.</p>,
    contextMenus: { "user-context"(children, { user }: { user: User; }) {
        const owner = realUser()?.id;
        if (!owner || !user) return;
        if (user.id === owner) return;
        children.push(<Menu.MenuItem id="mc5mr-fake-switcher-add" label="Add to Switcher (Fake)" action={() => {
            const value = capture(user);
            if (value) settings.store.profiles = { ...settings.store.profiles, [owner]: { ...settings.store.profiles[owner], [user.id]: value } };
            const saved = settings.store.accounts;
            settings.store.accounts = { ...saved, [owner]: [...new Set([...(saved[owner] ?? []), user.id])] };
            if (!value?.username || value.username === user.id) void refreshProfile(owner, user.id);
            showToast("أُضيف إلى قائمة الملفات المحلية في Switch Accounts.", Toasts.Type.SUCCESS);
        }} />);
    } },
    start() { running = true; clearManager(); addServerListElement(ServerListRenderPosition.Above, ManagementLayer); settings.store.selected = ""; reset("switcher"); addGlobalContextMenuPatch(accountMenuPatch); const owner = realUser()?.id; if (owner) for (const id of settings.store.accounts[owner] ?? []) if (!settings.store.profiles[owner]?.[id]?.username || settings.store.profiles[owner][id].username === id) void refreshProfile(owner, id); },
    flux: { CONNECTION_OPEN() { clearManager(); select(""); }, LOGOUT() { clearManager(); settings.store.selected = ""; reset("switcher"); closeModal(MODAL_KEY); } },
    stop() { running = false; clearManager(); removeServerListElement(ServerListRenderPosition.Above, ManagementLayer); removeGlobalContextMenuPatch(accountMenuPatch); settings.store.selected = ""; reset("switcher"); closeModal(MODAL_KEY); }
});
