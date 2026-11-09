/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button, LinkButton } from "@components/Button";
import { HeadphonesIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import definePlugin, { PluginNative } from "@utils/types";
import { React, Select, SettingsRouter, showToast, Toasts } from "@webpack/common";

import { Panel, Status } from "../NightcordUI.discordDesktop/ui";
import type { InstallerState } from "./native";
import style from "./styles.css?managed";

const Native = VencordNative.pluginHelpers.ProdHallowStereo as PluginNative<typeof import("./native")>;
const key = "mc5mr_stereo_installer";
const settings = definePluginSettings({}).withPrivateSettings<{ clientId?: string; }>();
const KEYS: "clientId"[] = ["clientId"];

async function openHub() {
    try {
        const result = await Native.launch();
        if (!result.success) showToast(result.message, Toasts.Type.FAILURE);
    } catch {
        showToast("تعذر فتح Stereo Hub. أعد تشغيل Discord وحاول مرة ثانية.", Toasts.Type.FAILURE);
    }
}

function StereoInstaller() {
    const options = settings.use(KEYS);
    const [state, setState] = React.useState<InstallerState | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [feedback, setFeedback] = React.useState("");
    const alive = React.useRef(true);
    async function refresh(pickFolder = false) {
        try {
            const next = await (pickFolder ? Native.browse() : Native.getState());
            if (!alive.current) return;
            setState(next);
            if (!next.success) setFeedback(next.message);
            if (pickFolder && next.success && next.current === "custom") settings.store.clientId = next.current;
        } catch { if (alive.current) setFeedback("تعذر قراءة حالة التثبيت. اضغط Refresh وحاول مجددًا."); }
    }
    React.useEffect(() => {
        alive.current = true;
        void refresh();
        return () => { alive.current = false; };
    }, []);
    React.useEffect(() => {
        if (state?.operation?.status !== "running") return;
        const timer = setInterval(() => void refresh(), 2000);
        return () => clearInterval(timer);
    }, [state?.operation?.status]);
    const selected = state?.clients.find(client => client.id === (options.clientId || state.current)) ?? state?.clients.find(client => client.id === state.current);
    const working = busy || state?.operation?.status === "running";
    const operation = state?.operation?.root === selected?.root ? state?.operation : null;
    async function apply(action: "patch" | "revert") {
        if (!selected || working) return;
        setBusy(true);
        setFeedback("");
        try {
            const result = await Native.queueAction(selected.id, action);
            if (!alive.current) return;
            setFeedback(result.success ? "" : result.message);
            await refresh();
        } catch { if (alive.current) setFeedback("تعذر بدء العملية. أعد فتح صفحة StereoInstaller وحاول مجددًا."); }
        finally { if (alive.current) setBusy(false); }
    }
    return <Panel className="vc-stereo-installer" dir="ltr">
        <div className="vc-stereo-warning" dir="rtl">
            <h3>StereoInstaller</h3>
            <p>يستبدل ملفات discord_voice بالملفات المرفقة ويحفظ نسخة احتياطية كاملة للاسترجاع. عند الضغط على Patch أو Revert، يغلق Discord المختار ويفتحه بعد الانتهاء.</p>
        </div>
        <div className="vc-stereo-setting"><strong>Installer method</strong><span>Verified voice-module replacement</span></div>
        <div className="vc-stereo-setting"><strong>Source code</strong><LinkButton variant="secondary" size="small" href="https://github.com/ProdHallow/Discord-Stereo-Windows-MacOS-Linux" target="_blank" rel="noreferrer">Discord Audio Collective</LinkButton></div>
        <div className="vc-stereo-setting"><strong>Discord client</strong><Select options={(state?.clients ?? []).map(client => ({ value: client.id, label: `${client.name}${client.version ? ` · ${client.version}` : " · Not installed"}` }))} serialize={value => value} isSelected={value => value === selected?.id} select={id => { settings.store.clientId = id; setFeedback(""); }} isDisabled={working} placeholder="Loading Discord clients…" /></div>
        <div className="vc-stereo-path" dir="ltr">{selected?.root || "جاري البحث عن نسخ Discord…"}</div>
        <div className="vc-stereo-actions">
            <Button variant="secondary" size="small" disabled={working} onClick={() => { settings.store.clientId = state?.current; setFeedback(""); void refresh(); }}>Auto-detect</Button>
            <Button variant="secondary" size="small" disabled={working} onClick={() => void refresh(true)}>Browse</Button>
            <Button variant="positive" size="small" disabled={working || !selected?.installed} onClick={() => void apply("patch")}>Patch Discord voice</Button>
            <Button variant="dangerPrimary" size="small" disabled={working || !selected?.backup} onClick={() => void apply("revert")}>Revert to backup</Button>
            <Button variant="secondary" size="small" disabled={busy} onClick={() => { setFeedback(""); void refresh(); }}>Refresh</Button>
        </div>
        {selected?.needsPatch && <div className="vc-stereo-warning" dir="rtl"><strong>Stereo must be installed again</strong><p>{selected.legacyPatched ? "تركيب الستيريو القديم قد يعطّل استقبال الشير. اضغط Patch Discord voice لاستبداله بالتركيب المتوافق مع الاحتفاظ بالستيريو." : "تغيّرت ملفات الصوت بعد آخر تركيب. اضغط Patch Discord voice للنسخة المختارة مجددًا."}</p></div>}
        {selected?.patched && <Status>ملفات الستيريو مثبتة على النسخة المختارة.</Status>}
        {selected && !selected.installed && <Status error>ملفات الصوت غير موجودة لهذه النسخة. افتحها مرة وثبّت وحدة الصوت، أو اختر نسخة ثانية.</Status>}
        <dl className="vc-stereo-details">
            <div><dt>Client</dt><dd>{selected ? `${selected.name} ${selected.version}` : "—"}</dd></div>
            <div><dt>Platform</dt><dd>Windows x64</dd></div>
            <div><dt>Voice module</dt><dd>{selected?.voice || "Not found"}</dd></div>
            <div><dt>Last patch</dt><dd>{selected?.lastPatch ? new Date(selected.lastPatch).toLocaleString() : "Not installed yet"}</dd></div>
            <div><dt>Backup</dt><dd>{selected?.backup ? "Saved original for this version" : "No original backup for this version"}</dd></div>
        </dl>
        <Status error={operation?.status === "failed" || !!feedback}>{feedback || operation?.message || "Ready"}</Status>
        <div className="vc-stereo-footer"><small>Discord Audio Collective · مدمج بواسطة Mc5mr</small><Button variant="secondary" size="small" disabled={working} onClick={() => void openHub()}>Open Stereo Hub</Button></div>
    </Panel>;
}

export default definePlugin({
    name: "ProdHallowStereo",
    description: "Install and restore Discord Audio Collective stereo from Discord settings on Windows.",
    authors: [Devs.Mc5mr],
    enabledByDefault: true,
    required: true,
    hidden: true,
    dependencies: ["NightcordUI", "Settings"],
    settings,
    managedStyle: style,
    openHub,
    settingsAboutComponent: () => <div dir="rtl">
        <p>صفحة الستيريو موجودة داخل إعدادات Equicord باسم StereoInstaller.</p>
        <Button onClick={() => SettingsRouter.openUserSettings(`${key}_panel`)}>فتح StereoInstaller</Button>
    </div>,
    start() {
        if (!SettingsPlugin.customEntries.some(entry => entry.key === key))
            SettingsPlugin.customEntries.push({ key, title: "StereoInstaller", Component: StereoInstaller, Icon: HeadphonesIcon });
    },
    stop() {
        const index = SettingsPlugin.customEntries.findIndex(entry => entry.key === key);
        if (index !== -1) SettingsPlugin.customEntries.splice(index, 1);
    }
});
