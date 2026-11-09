/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { openPrivateChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import { Alerts, Avatar, ChannelStore, closeModal, Constants, IconUtils, Modal, openModal, React, RelationshipStore, RestAPI, SearchableSelect, TextInput, UserStore, useStateFromStores } from "@webpack/common";

import { Panel, Status, ui } from "../NightcordUI.discordDesktop/ui";
import { runDmQueue } from "./queue";
import style from "./styles.css?managed";

const MODAL_KEY = "mc5mr-mass-dm";
const cl = classNameFactory("vc-mc5mr-mass-dm-");
let running = false;
let active: { owner: string; cancelled: boolean; } | undefined;
let waiting: { timer: ReturnType<typeof setTimeout>; resolve(): void; } | undefined;

const headerCl = classNameFactory("vc-mc5mr-header-");

function stopSending() {
    if (active) active.cancelled = true;
    if (waiting) { clearTimeout(waiting.timer); waiting.resolve(); waiting = undefined; }
}

function wait(ms: number) {
    return new Promise<void>(resolve => {
        const timer = setTimeout(() => { waiting = undefined; resolve(); }, ms);
        waiting = { timer, resolve };
    });
}

async function sendDm(id: string, content: string, task: { owner: string; cancelled: boolean; }) {
    let channelId = ChannelStore.getDMFromUserId(id);
    if (!channelId) {
        const opened = await Promise.resolve(openPrivateChannel(id, false));
        channelId = typeof opened === "string" ? opened : ChannelStore.getDMFromUserId(id);
    }
    if (task.cancelled || !running || UserStore.getCurrentUser()?.id !== task.owner) throw new Error("توقف الإرسال أو تغير الحساب.");
    if (!RelationshipStore.isFriend(id)) throw new Error("المستلم لم يعد ضمن أصدقائك.");
    if (!channelId) throw new Error("تعذر فتح الخاص؛ لم تُرسل الرسالة لهذا المستلم.");
    const response = await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: { content, nonce: crypto.randomUUID().replace(/-/g, "").slice(0, 24), enforce_nonce: true, tts: false, allowed_mentions: { parse: [], replied_user: false } }
    });
    if (!response.body?.id) throw new Error("لم يؤكد Discord إرسال الرسالة. توقفنا لتجنب إعادة إرسالها بالخطأ.");
}

function MassDmIcon({ className }: { className?: string; }) {
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 4h20v14H7l-5 4zm3 3v2h14V7zm0 5v2h10v-2z" /></svg>;
}

function Composer() {
    const userId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const friends = useStateFromStores([RelationshipStore, UserStore], () => RelationshipStore.getFriendIDs().map(id => ({ id, label: UserStore.getUser(id)?.globalName || UserStore.getUser(id)?.username || id })));
    const [content, setContent] = React.useState("");
    const [seconds, setSeconds] = React.useState("5");
    const [excluded, setExcluded] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("");
    const [sentIds, setSentIds] = React.useState<string[]>([]);
    const [progress, setProgress] = React.useState({ sent: 0, total: 0 });
    const mounted = React.useRef(true);
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopSending(); }; }, []);
    const selected = friends.filter(friend => !excluded.includes(friend.id) && !sentIds.includes(friend.id)).map(friend => friend.id);
    const delayMs = Number(seconds) * 1000;
    const valid = content.trim().length > 0 && content.length <= 2000 && Number.isFinite(delayMs) && delayMs >= 1500 && delayMs <= 3_600_000;

    async function review() {
        if (!userId || !valid || !selected.length || active || busy) return;
        const owner = userId;
        const pending = selected.filter(id => !sentIds.includes(id) && RelationshipStore.isFriend(id));
        if (!pending.length) return setStatus("كل المستلمين المحددين أرسلت لهم بالفعل في هذه اللوحة.");
        const message = content;
        setBusy(true);
        let confirmed = false;
        try { confirmed = await Alerts.confirm({ title: "مراجعة إرسال Mass DM", body: <div dir="rtl"><p>المستلمون: {pending.length}. الفاصل: {delayMs / 1000} ثانية.</p><p>{pending.map(id => UserStore.getUser(id)?.username || id).join("، ")}</p><pre style={{ whiteSpace: "pre-wrap" }}>{message}</pre><p>سيرسل مرة واحدة لكل مستلم تختاره. لا يرسل لأعضاء سيرفر أو لأشخاص خارج أصدقائك. استخدمه للرسائل التي يتوقعها المستلمون.</p></div>, confirmText: "إرسال الرسالة للمحددين", cancelText: "إلغاء" }); }
        catch { if (mounted.current) { setBusy(false); setStatus("تعذر فتح مراجعة الإرسال. حاول مرة أخرى."); } return; }
        if (!confirmed || !mounted.current || UserStore.getCurrentUser()?.id !== owner || !running) { if (mounted.current) setBusy(false); return; }
        const task = { owner, cancelled: false };
        active = task;
        setProgress({ sent: 0, total: pending.length });
        try {
            const count = await runDmQueue({ recipients: pending, content: message, delayMs }, {
                cancelled: () => task.cancelled || !running || UserStore.getCurrentUser()?.id !== owner,
                isFriend: id => RelationshipStore.isFriend(id),
                send: (id, text) => sendDm(id, text, task),
                wait,
                progress: (id, sent) => { if (mounted.current) { setSentIds(current => [...current, id]); setProgress({ sent, total: pending.length }); setStatus(`أُرسلت ${sent} / ${pending.length}`); } }
            });
            if (mounted.current) setStatus(`${task.cancelled ? "توقف" : "انتهى"} الإرسال: ${count} / ${pending.length}.`);
        } catch (error) {
            if (mounted.current) setStatus(`${error instanceof Error ? error.message : "رفض Discord طلبًا أو قيّد الإرسال."} توقفت الدفعة؛ لم تُجدول إعادة محاولة تلقائية.`);
        } finally {
            if (active === task) active = undefined;
            if (mounted.current) setBusy(false);
        }
    }

    return <Panel className={cl("composer")} dir="ltr">
        <div className={cl("top")}><strong>Message to send to friends</strong><SearchableSelect className={cl("exclude")} options={friends.map(friend => ({ label: friend.label, value: friend.id }))} renderOptionPrefix={option => { const user = UserStore.getUser(String(option.value)); return <Avatar src={user ? IconUtils.getUserAvatarURL(user, false, 32) : IconUtils.getDefaultAvatarURL(String(option.value))} size="SIZE_24" />; }} value={excluded} multi closeOnSelect={false} isDisabled={busy} placeholder="Exclude friends..." onChange={(value: unknown) => { if (Array.isArray(value)) setExcluded(value.filter((id): id is string => typeof id === "string")); }} /></div>
        <textarea className={cl("message")} value={content} onChange={event => setContent(event.target.value)} maxLength={2000} rows={8} disabled={busy} placeholder="Write your message here..." aria-label="Message to send" />
        <span className={ui("count")}>{content.length} / 2000 characters · {sentIds.length} sent this session</span>
        <div className={cl("summary")}><span>Will be sent to <strong>{selected.length} friends</strong></span><label className={cl("delay")}>Delay (seconds)<TextInput value={seconds} onChange={setSeconds} disabled={busy} aria-label="Delay in seconds" /></label></div>
        <div className={cl("actions")}><Button variant="positive" disabled={busy || !valid || !selected.length} onClick={() => void review()}>▶ Start</Button><Button variant="secondary" onClick={() => { stopSending(); if (!busy) closeModal(MODAL_KEY); }}>{busy ? "Stop" : "Cancel"}</Button></div>
        {!!progress.total && <div role="progressbar" aria-label="إرسال الرسائل" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.sent}><div style={{ width: `${progress.sent / progress.total * 100}%` }} /></div>}
        <Status>{status}</Status>
    </Panel>;
}

function openComposer() { openModal(props => <Modal {...props} size="xl" title="Mass DM"><Composer /></Modal>, { modalKey: MODAL_KEY }); }

export default definePlugin({
    name: "MassDM",
    description: "Review a one-time message to selected friends with a configurable delay and cancellable sequential sending.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Chat", "Friends"],
    dependencies: ["NightcordUI"],
    managedStyle: style,
    headerBarButton: { priority: -20, icon: MassDmIcon, render: () => <HeaderBarButton className={headerCl("button")} icon={MassDmIcon} tooltip="Mass DM" onClick={openComposer} /> },
    settingsAboutComponent: () => <Button onClick={openComposer}>فتح Mass DM</Button>,
    start() { running = true; },
    stop() { running = false; stopSending(); closeModal(MODAL_KEY); },
    flux: { LOGOUT() { stopSending(); closeModal(MODAL_KEY); } }
});
