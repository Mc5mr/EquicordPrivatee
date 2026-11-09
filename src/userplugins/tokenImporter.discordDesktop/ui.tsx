/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { CopyIdIcon, DeleteIcon, FolderIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { classes } from "@utils/misc";
import type { PluginNative } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import type { RenderModalProps } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { Alerts, Avatar, closeModal, IconUtils, Modal, openModal, TextArea, TextInput, useEffect, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";
import { isToken, MAX_ACCOUNTS, MAX_INPUT_BYTES, parseTokens, type SavedAccount } from "./shared";

const MODAL_KEY = "mc5mr-token-importer";
const Native = VencordNative.pluginHelpers.TokenImporter as PluginNative<typeof import("./native")>;
const AuthActions = findByPropsLazy("loginToken") as { loginToken(token: string): Promise<unknown> | void; };
const TokenStore = findByPropsLazy("getToken") as { getToken(): string | undefined; };

function ImporterModal(props: RenderModalProps) {
    const [tab, setTab] = useState<"saved" | "paste">("saved");
    const [accounts, setAccounts] = useState<SavedAccount[]>([]);
    const [query, setQuery] = useState("");
    const [input, setInput] = useState("");
    const [showTokens, setShowTokens] = useState(false);
    const [busy, setBusy] = useState("");
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState("");
    const [pendingLoginId, setPendingLoginId] = useState("");
    const alive = useRef(true);
    const activeId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const candidates = parseTokens(input);
    const needle = query.trim().toLowerCase();
    const filtered = accounts.filter(account => [account.username, account.displayName, account.id].some(value => value.toLowerCase().includes(needle)));

    useEffect(() => {
        alive.current = true;
        Native.listAccounts().then(result => {
            if (!alive.current) return;
            if (result.ok) {
                setAccounts(result.value);
                setNotice(result.notice ?? "");
            }
            else setNotice(result.error);
        }).catch(() => {
            if (alive.current) setNotice("Close Discord completely and reopen it after building the plugin.");
        }).finally(() => {
            if (alive.current) setLoading(false);
        });
        return () => { alive.current = false; };
    }, []);

    useEffect(() => {
        if (!pendingLoginId) return;
        if (activeId === pendingLoginId) {
            setInput("");
            props.onClose();
            return;
        }
        const timeout = window.setTimeout(() => {
            setPendingLoginId("");
            setBusy("");
            setNotice("Discord has not completed sign-in. Complete any account verification using Discord's normal login, then try again.");
        }, 20_000);
        return () => window.clearTimeout(timeout);
    }, [activeId, pendingLoginId]);

    async function importFile() {
        try {
            const file = await chooseFile(".txt,text/plain");
            if (!file || !alive.current) return;
            if (file.size > MAX_INPUT_BYTES) return setNotice("Choose a text file smaller than 64 KB.");
            const text = await file.text();
            if (!alive.current) return;
            setInput(text);
            setNotice("");
        } catch {
            if (alive.current) setNotice("Could not read this text file.");
        }
    }

    async function verifyAndAdd() {
        if (busy || !candidates.length) return;
        if (candidates.length > MAX_ACCOUNTS) return setNotice(`Import no more than ${MAX_ACCOUNTS} personal accounts at once.`);
        setNotice("");
        const pending = [...candidates];
        const remaining: string[] = [];
        const failures: string[] = [];
        let added = 0;
        try {
            for (let index = 0; index < pending.length && alive.current; index++) {
                setBusy(`Verifying ${index + 1} of ${pending.length}…`);
                if (!isToken(pending[index])) {
                    remaining.push(pending[index]);
                    failures.push(`Entry ${index + 1}: Paste a complete token without labels or other text.`);
                    continue;
                }
                const result = await Native.addAccount(pending[index]);
                if (!alive.current) return;
                if (result.ok) {
                    added++;
                    setAccounts(current => [...current.filter(account => account.id !== result.value.id), result.value]);
                } else {
                    remaining.push(pending[index]);
                    failures.push(`Line ${index + 1}: ${result.error}`);
                    if (result.retryAfter) {
                        remaining.push(...pending.slice(index + 1));
                        failures.push(`Wait ${result.retryAfter} seconds before retrying.`);
                        break;
                    }
                }
            }
            if (!alive.current) return;
            setInput(remaining.join("\n"));
            setNotice([`${added} account${added === 1 ? "" : "s"} added or updated.`, ...failures.slice(0, 3)].join(" "));
            if (added && !remaining.length) setTab("saved");
        } catch {
            if (alive.current) setNotice(`${added} accounts were saved before the connection to the plugin was interrupted. Reopen the importer to refresh the saved list, then retry.`);
        } finally {
            if (alive.current) setBusy("");
        }
    }

    async function signIn(account: SavedAccount) {
        if (busy || activeId === account.id) return;
        setBusy(`Signing in as ${account.username}…`);
        setNotice("");
        let started = false;
        try {
            if (typeof AuthActions.loginToken !== "function") return setNotice("Discord's sign-in function changed. The plugin needs an update; your current session was not changed.");
            const result = await Native.prepareLogin(account.id);
            if (!alive.current) return;
            if (!result.ok) return setNotice(result.error);
            setPendingLoginId(account.id);
            await AuthActions.loginToken(result.value.token);
            started = true;
        } catch {
            if (alive.current) {
                setPendingLoginId("");
                setNotice("Could not sign in. Try adding a fresh token, or use Discord's normal login.");
            }
        } finally {
            if (alive.current && !started) setBusy("");
        }
    }

    async function directLogin() {
        if (busy || candidates.length !== 1) return;
        const token = candidates[0];
        setBusy("Signing in…");
        setNotice("");
        let started = false;
        try {
            const result = await Native.verifyForLogin(token);
            if (!alive.current) return;
            if (!result.ok) return setNotice(result.error);
            if (typeof AuthActions.loginToken !== "function") return setNotice("Discord's login function changed. Use normal sign-in.");
            setPendingLoginId(result.value.id);
            await AuthActions.loginToken(token);
            started = true;
        } catch {
            if (alive.current) {
                setPendingLoginId("");
                setNotice("Could not sign in. Complete any account verification using Discord's normal login.");
            }
        } finally { if (alive.current && !started) setBusy(""); }
    }

    async function removeAccount(account: SavedAccount) {
        if (busy) return;
        const confirmed = await Alerts.confirm({
            title: "Remove saved account?",
            body: `Remove ${account.username} from Token Importer? This does not delete the Discord account or sign it out.`,
            confirmText: "Remove",
            cancelText: "Cancel"
        });
        if (!confirmed || !alive.current) return;
        setBusy("Removing account…");
        try {
            const result = await Native.removeAccount(account.id);
            if (!alive.current) return;
            if (result.ok) { setAccounts(result.value); setNotice("Account removed."); }
            else setNotice(result.error);
        } catch {
            if (alive.current) setNotice("Could not remove this account. Try again.");
        } finally {
            if (alive.current) setBusy("");
        }
    }

    async function downloadTokens() {
        const confirmed = await Alerts.confirm({
            title: "Export sign-in tokens?",
            body: "This text file will contain your saved tokens without encryption. Anyone with the file could sign in to these accounts. Keep it private.",
            confirmText: "Download .txt",
            cancelText: "Cancel"
        });
        if (!confirmed || !alive.current) return;
        setBusy("Preparing download…");
        try {
            const result = await Native.exportTokens();
            if (!alive.current) return;
            if (!result.ok) return setNotice(result.error);
            saveFile(new File([result.value], "TokenImporter-accounts.txt", { type: "text/plain;charset=utf-8" }));
            setNotice("Download prepared. Keep the file private.");
        } catch {
            if (alive.current) setNotice("Could not prepare the download.");
        } finally {
            if (alive.current) setBusy("");
        }
    }

    function copyMyToken() {
        const token = TokenStore.getToken();
        if (!token) return setNotice("No token is available for the current signed-in account.");
        copyToClipboard(token);
        setNotice("Your current account token was copied locally.");
    }

    async function copyAccount(account: SavedAccount) {
        if (busy) return;
        setBusy("Copying saved token…");
        try {
            const result = await Native.prepareLogin(account.id);
            if (!alive.current) return;
            if (!result.ok) return setNotice(result.error);
            copyToClipboard(result.value.token);
            setNotice(`Token for ${account.username} copied locally.`);
        } catch { if (alive.current) setNotice("Could not copy this saved token."); }
        finally { if (alive.current) setBusy(""); }
    }

    return <Modal {...props} size="lg" title={<span className="vc-ti-title"><FolderIcon width={18} height={18} />Token Importer</span>}>
        <Panel className="vc-ti-shell" dir="ltr">
            <div className="vc-ti-tabs" role="tablist" aria-label="Token Importer tabs">
                <Button variant="none" className={classes("vc-ti-tab", tab === "saved" && "vc-ti-tab-active")} role="tab" id="vc-ti-saved-tab" aria-controls="vc-ti-saved-panel" aria-selected={tab === "saved"} onClick={() => setTab("saved")}>Saved accounts <span className="vc-ti-badge">{accounts.length}</span></Button>
                <Button variant="none" className={classes("vc-ti-tab", tab === "paste" && "vc-ti-tab-active")} role="tab" id="vc-ti-paste-tab" aria-controls="vc-ti-paste-panel" aria-selected={tab === "paste"} onClick={() => setTab("paste")}>Paste tokens</Button>
            </div>

            {tab === "saved" ? <section id="vc-ti-saved-panel" role="tabpanel" aria-labelledby="vc-ti-saved-tab">
                <div className="vc-ti-toolbar">
                    <TextInput className="vc-ti-search" value={query} onChange={setQuery} placeholder="Search accounts…" aria-label="Search saved accounts" />
                    <div className="vc-ti-toolbar-actions">
                        <Button size="small" variant="secondary" onClick={() => setTab("paste")} disabled={Boolean(busy)}><FolderIcon width={14} height={14} /> Add account</Button>
                        <Button size="small" variant="secondary" onClick={copyMyToken} disabled={Boolean(busy)}>My Token</Button>
                        <Button size="small" variant="secondary" disabled={!accounts.length || Boolean(busy) || loading} onClick={downloadTokens}>Download .txt</Button>
                    </div>
                </div>
                <div className="vc-ti-accounts" aria-busy={loading || Boolean(busy)}>
                    {loading ? <p className="vc-ti-empty">Loading saved accounts…</p> : filtered.length ? filtered.map(account => <div className="vc-ti-account" key={account.id}>
                        <Button variant="none" className="vc-ti-account-main" disabled={Boolean(busy) || account.id === activeId} onClick={() => signIn(account)} aria-label={`Sign in as ${account.username}`}>
                            {UserStore.getUser(account.id) ? <Avatar src={IconUtils.getUserAvatarURL(UserStore.getUser(account.id), false, 32)} size="SIZE_32" aria-hidden /> : <span className="vc-ti-avatar" aria-hidden="true">{(account.displayName || account.username).slice(0, 1).toUpperCase()}</span>}
                            <span className="vc-ti-identity"><strong>{account.displayName || account.username}</strong><span className="vc-ti-masked-token">••••••••••••••••••••••••</span></span>
                        </Button>
                        <Button size="small" disabled={Boolean(busy) || account.id === activeId} onClick={() => signIn(account)}>{account.id === activeId ? "Current" : "Switch"}</Button>
                        <Button variant="secondary" size="iconOnly" disabled={Boolean(busy)} onClick={() => void copyAccount(account)} aria-label={`Copy token for ${account.username}`} title="Copy saved token"><CopyIdIcon width={16} height={16} /></Button>
                        <Button variant="dangerSecondary" size="iconOnly" className="vc-ti-remove" disabled={Boolean(busy)} onClick={() => removeAccount(account)} aria-label={`Remove ${account.username}`} title="Remove saved account"><DeleteIcon width={16} height={16} /></Button>
                    </div>) : <p className="vc-ti-empty">{accounts.length ? "No accounts match your search." : "No accounts — add your own tokens via the tab above."}</p>}
                </div>
                <p className="vc-ti-hint">{accounts.length} saved · Click an account to sign in.</p>
            </section> : <section id="vc-ti-paste-panel" role="tabpanel" aria-labelledby="vc-ti-paste-tab">
                <TextArea className={classes("vc-ti-input", !showTokens && "vc-ti-input-masked")} value={input} onChange={setInput} rows={6} maxLength={MAX_INPUT_BYTES} disabled={Boolean(busy)} autoComplete="off" spellCheck={false} placeholder="Paste your own Discord tokens here… (one per line)" aria-label="Your Discord account tokens" />
                <div className="vc-ti-import-actions">
                    <span className="vc-ti-count">{candidates.length} token{candidates.length === 1 ? "" : "s"} entered</span>
                    <Button variant="none" size="small" onClick={() => setShowTokens(value => !value)} disabled={Boolean(busy)}>{showTokens ? "Hide tokens" : "Show tokens"}</Button>
                    <Button variant="secondary" size="small" onClick={importFile} disabled={Boolean(busy)}>File .txt</Button>
                    <Button variant="secondary" size="small" onClick={directLogin} disabled={candidates.length !== 1 || Boolean(busy)}>Login without saving</Button>
                    <Button size="small" onClick={verifyAndAdd} disabled={!candidates.length || candidates.length > MAX_ACCOUNTS || Boolean(busy) || loading}>Verify &amp; Add</Button>
                </div>
                <p className="vc-ti-hint">Only import accounts you own. Tokens are verified with Discord and saved encrypted for this Discord installation.</p>
            </section>}

            {busy ? <p className="vc-ti-status" role="status">{busy}</p> : null}
            {notice ? <p className="vc-ti-notice" role="status">{notice}</p> : null}
        </Panel>
    </Modal>;
}

const SafeImporterModal = ErrorBoundary.wrap(ImporterModal);

export function openImporter() {
    openModal(props => <SafeImporterModal {...props} />, { modalKey: MODAL_KEY });
}

export function closeImporter() {
    closeModal(MODAL_KEY);
}
