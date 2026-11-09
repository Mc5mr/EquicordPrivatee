/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { HeadphonesIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { useTimer } from "@utils/react";
import definePlugin, { PluginNative } from "@utils/types";
import { React, SettingsRouter } from "@webpack/common";

import { Panel, Status, ui } from "../NightcordUI.discordDesktop/ui";
import style from "./styles.css?managed";

type Info = Awaited<ReturnType<typeof import("./native").inspect>>;
const Native = () => VencordNative.pluginHelpers.StereoInstaller as PluginNative<typeof import("./native")>;
const key = "mc5mr_stereo_installer";

function Installer() {
    const [root, setRoot] = React.useState("");
    const [info, setInfo] = React.useState<Info | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("");
    const [error, setError] = React.useState(false);
    const [clients, setClients] = React.useState<Awaited<ReturnType<typeof import("./native").clients>>>([]);
    const mounted = React.useRef(true);
    const pending = info?.task?.status === "pending";
    const elapsed = useTimer({ interval: 2000, deps: [root, pending] });
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    async function run(job: () => Promise<string | void>) {
        if (busy) return;
        setBusy(true); setError(false);
        try { const message = await job(); if (mounted.current && message) setStatus(message); }
        catch (failure) { if (mounted.current) { setError(true); setStatus((failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "")); } }
        finally { if (mounted.current) setBusy(false); }
    }
    async function load(path: string) {
        if (mounted.current) { setRoot(path); setInfo(null); setStatus(""); }
        const value = await Native().inspect(path);
        if (mounted.current) { setRoot(value.root); setInfo(value); }
    }
    React.useEffect(() => {
        void run(async () => {
            const installed = await Native().clients();
            if (!mounted.current) return;
            setClients(installed);
            if (installed.length) await load(await Native().detect());
        });
    }, []);
    React.useEffect(() => {
        if (!pending) return;
        let cancelled = false;
        void Native().inspect(root).then(value => { if (!cancelled) { setInfo(value); setError(false); setStatus(""); } }, failure => {
            if (!cancelled) { setError(true); setStatus(failure instanceof Error ? failure.message : String(failure)); }
        });
        return () => { cancelled = true; };
    }, [root, pending, elapsed]);
    return <Panel className="vc-mc5mr-stereo" dir="ltr">
        <h3>StereoInstaller</h3>
        <Status>ينشئ نسخة ستيريو مستقلة داخل مجلد Discord المختار باسم app-1.0.2## مع ملفات التشغيل كاملة. يحافظ على نوع Discord وملفاته الأصلية. زر Patch يفتح نافذة أوامر ثم يشغّل النسخة الجديدة. استخدم اختصار Stereo Discord لفتحها لاحقًا.</Status>
        <label className={ui("field")}><span>Discord client</span><select disabled={busy || !clients.length} value={root} onChange={event => { const path = event.currentTarget.value; void run(() => load(path)); }}><option value="">Choose Stable / PTB / Canary</option>{clients.map(client => <option key={client.root} value={client.root}>{client.name} · {client.version}{client.patched ? " · Installed" : client.nativePatchSupported ? " · Ready to patch" : client.compatible ? " · Ready to copy" : " · Import matching stereo ZIP"}</option>)}</select></label>
        <div className={ui("actions")}><Button variant="secondary" onClick={() => void run(() => Native().sourceCode())}>Source code</Button><span className={ui("muted")}>الإصدارات المدعومة تُعدّل من ملفات Discord المختار مباشرة. استيراد ZIP خيار للإصدارات الأخرى.</span></div>
        <div className="vc-mc5mr-stereo-path">{root || "اختر مجلد Discord الأساسي"}</div>
        <div className={ui("actions")}>
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => load(await Native().detect()))}>Auto-detect</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { const path = await Native().browse(); if (path) await load(path); })}>Browse</Button>
            <Button variant="positive" disabled={busy || pending || !info || !!info.standalone.installed} onClick={() => void run(async () => { try { await Native().queue(root, "install"); } finally { await load(root); } })}>{pending ? "Working…" : "Patch Discord voice"}</Button>
            <Button variant="dangerPrimary" disabled={busy || pending || !(info?.standalone.installed || (info?.backupAvailable && info.patched))} onClick={() => void run(async () => { try { await Native().queue(root, "restore"); } finally { await load(root); } })}>Revert to original</Button>
            <Button variant="secondary" disabled={busy || pending || !info} onClick={() => void run(async () => { const message = await Native().importArchive(root); await load(root); return message; })}>Import stereo ZIP</Button>
            <Button variant="secondary" disabled={busy || pending || !info?.standalone.installed} onClick={() => void run(async () => { try { await Native().launch(root); } finally { await load(root); } })}>Open stereo Discord</Button>
            <Button variant="secondary" disabled={busy || !root} onClick={() => void run(() => load(root))}>Refresh</Button>
        </div>
        {info && <><Status error={false}>{info.standalone.installed ? `نسخة الستيريو جاهزة: ${info.standalone.installed.version}. افتحها بواسطة Open stereo Discord.` : info.standalone.archive ? "حزمة ZIP جاهزة لإنشاء نسخة ستيريو مستقلة." : info.nativePatchSupported ? "جاهز لتعديل وحدة الصوت الحالية في نسخة مستقلة، مع الاحتفاظ بملفات الصوت المتوافقة. لا تحتاج ZIP." : info.compatible || info.patched ? "جاهز لنسخ ملفات Discord إلى مجلد مستقل وتركيب الستيريو." : "اضغط Patch لاكتشاف ZIP داخل مجلد Discord، أو اختر Import stereo ZIP لحزمة كاملة من نفس نوع Discord. ملف Canary المرفق يدعم Canary فقط."}</Status><dl className="vc-mc5mr-stereo-info"><dt>Client</dt><dd>{info.version}</dd><dt>Platform</dt><dd>Windows x64</dd><dt>Voice module</dt><dd>{info.file}</dd><dt>Module SHA-256</dt><dd><code>{info.hash}</code></dd><dt>Stereo folder</dt><dd>{info.standalone.installed?.version ?? "Created when Patch completes"}</dd><dt>Stereo ZIP</dt><dd>{info.standalone.archive?.version ?? "Auto-detect in selected Discord folder"}</dd><dt>Backup</dt><dd>{info.backupAvailable ? "Available for this version" : "No saved original for this version"}</dd></dl>{info.task && <Status error={info.task.status === "failed"}>{info.task.message}</Status>}</>}
        {busy && <Status>جارٍ التحقق…</Status>}<Status error={error}>{status}</Status>
    </Panel>;
}
export default definePlugin({
    name: "StereoInstaller",
    description: "Creates a separate Windows stereo Discord app folder with a direct launcher and restore.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    required: true,
    dependencies: ["NightcordUI", "Settings"],
    tags: ["Voice", "Utility"],
    managedStyle: style,
    settingsAboutComponent: () => <div dir="rtl"><p>البلوقن مفعّل دائمًا. صفحة التثبيت مستقلة داخل إعدادات Equicord.</p><Button onClick={() => SettingsRouter.openUserSettings(`${key}_panel`)}>فتح StereoInstaller</Button></div>,
    start() { if (!SettingsPlugin.customEntries.some(entry => entry.key === key)) SettingsPlugin.customEntries.push({ key, title: "StereoInstaller", Component: Installer, Icon: HeadphonesIcon }); },
    stop() { const index = SettingsPlugin.customEntries.findIndex(entry => entry.key === key); if (index !== -1) SettingsPlugin.customEntries.splice(index, 1); }
});
