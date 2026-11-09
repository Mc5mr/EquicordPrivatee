/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { CopyIcon, DeleteIcon, PlusIcon } from "@components/Icons";
import { Switch } from "@components/Switch";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import type { VoiceState } from "@vencord/discord-types";
import { closeModal, FluxDispatcher, Modal, openModal, React, Select, Slider, TextInput, UserStore, useStateFromStores } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";
import { applyAudio, AudioConfig, clearAudio, defaults, getAudioStatus, removeAudio, resumeAudio, subscribeAudio } from "./audio";
import style from "./styles.css?managed";

const logger = new Logger("MicSettings");
const PROFILE_KEYS: "profiles"[] = ["profiles"];
const MODAL_KEY = "mc5mr-better-microphone";
const settings = definePluginSettings({ profiles: { type: OptionType.CUSTOM, description: "Microphone presets saved per signed-in account.", default: {} as Record<string, Record<string, AudioConfig>> } }).withPrivateSettings<{ applied?: Record<string, AudioConfig>; stereoMigrated?: boolean; }>();
const fields = [
    { label: "Sample Frequency", key: "encoderRate", enabled: "rateEnabled", unit: "Encoder bit/s", step: 1000 },
    { label: "Sample Rate", key: "sampleRate", enabled: "sampleEnabled", unit: "Hz · max 48000", step: 1000 },
    { label: "Pac Size", key: "packetSamples", enabled: "packetEnabled", unit: "Samples per frame", step: 120 },
    { label: "Channels", key: "channels", enabled: "channelsEnabled", unit: "Mono 1 · Stereo 2", step: 1 }
] as const;
function applySaved() {
    const owner = UserStore.getCurrentUser()?.id;
    if (!settings.store.stereoMigrated) {
        const applied = { ...settings.store.applied };
        for (const [id, value] of Object.entries(applied)) if (value.channels === 2 && !value.channelsEnabled) applied[id] = { ...value, channelsEnabled: true };
        settings.store.applied = applied;
        const profiles = { ...settings.store.profiles };
        for (const [account, presets] of Object.entries(profiles)) {
            const migrated = { ...presets };
            for (const [name, value] of Object.entries(migrated)) if (value.channels === 2 && !value.channelsEnabled) migrated[name] = { ...value, channelsEnabled: true };
            profiles[account] = migrated;
        }
        settings.store.profiles = profiles;
        settings.store.stereoMigrated = true;
    }
    removeAudio("mic");
    const value = owner ? settings.store.applied?.[owner] : undefined;
    if (value) { try { applyAudio("mic", value); } catch (error) { logger.error(error); } }
}
function openSettings() {
    openModal(props => <Modal {...props} role="dialog" size="lg" title="Microphone Settings"><MicrophonePanel onApplied={props.onClose} /></Modal>, { modalKey: MODAL_KEY });
}
function MicrophonePanel({ onApplied }: { onApplied?: () => void; } = {}) {
    const owner = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id ?? "");
    const { profiles } = settings.use(PROFILE_KEYS);
    const [draft, setDraft] = React.useState<AudioConfig>(() => ({ ...(settings.store.applied?.[owner] ?? defaults) }));
    const [simple, setSimple] = React.useState(false);
    const [selected, setSelected] = React.useState("");
    const [name, setName] = React.useState("");
    const [naming, setNaming] = React.useState(false);
    const appliedStatus = React.useSyncExternalStore(subscribeAudio, getAudioStatus);
    const [sliderVersion, setSliderVersion] = React.useState(0);
    const [status, setStatus] = React.useState("");
    React.useEffect(() => { setDraft({ ...(settings.store.applied?.[owner] ?? defaults) }); setSliderVersion(value => value + 1); setSelected(""); setName(""); setNaming(false); setStatus(""); }, [owner]);
    const presets = profiles[owner] ?? {};
    function save() {
        if (!naming && !selected) { setNaming(true); return; }
        const key = (naming ? name.trim() : selected).slice(0, 60);
        if (!key) { setStatus("اكتب اسم البروفايل أولًا."); return; }
        settings.store.profiles = { ...profiles, [owner]: { ...presets, [key]: { ...draft } } }; setSelected(key); setName(""); setNaming(false); setStatus("تم حفظ البروفايل.");
    }
    return <Panel className="vc-nc-mic" dir="ltr">
        {!simple && <div className="vc-nc-mic-grid">{fields.map(field => <section key={field.key} className="vc-nc-mic-card"><strong>{field.label}</strong><div className="vc-nc-mic-value"><TextInput type="number" aria-label={field.label} title={field.unit} value={String(draft[field.key])} disabled={!draft[field.enabled]} onChange={value => setDraft({ ...draft, [field.key]: Number(value) })} /><div className="vc-nc-mic-status"><span id={`vc-nc-status-${field.key}`}>Status</span><Switch aria-labelledby={`vc-nc-status-${field.key}`} checked={draft[field.enabled]} onChange={value => setDraft({ ...draft, [field.enabled]: value })} /></div></div></section>)}</div>}
        <div className={simple ? "vc-nc-mic-middle vc-nc-mic-simple" : "vc-nc-mic-middle"}><section className="vc-nc-mic-card"><strong>Audio Bitrate</strong><span className="vc-nc-mic-unit" title={String(draft.bitrate) + " Kb/s"}>Kb/s</span><div className="vc-nc-mic-value"><Slider disabled={!draft.bitrateEnabled} minValue={8} maxValue={512} initialValue={draft.bitrate} key={sliderVersion} markers={[8, 96, 320, 512]} onValueRender={value => `${Math.round(value)} Kb/s`} asValueChanges={value => setDraft({ ...draft, bitrate: Math.round(value) })} /><div className="vc-nc-mic-status"><span id="vc-nc-status-bitrate">Status</span><Switch aria-labelledby="vc-nc-status-bitrate" checked={draft.bitrateEnabled} onChange={value => setDraft({ ...draft, bitrateEnabled: value })} /></div></div></section>
        {!simple && <section className="vc-nc-mic-card"><strong>Profile</strong><div className="vc-nc-mic-presets">
            {naming ? <TextInput value={name} onChange={setName} placeholder="Profile name" aria-label="Profile name" autoFocus onKeyDown={event => { if (event.key === "Enter") save(); if (event.key === "Escape") setNaming(false); }} /> : <Select options={Object.keys(presets).map(key => ({ value: key, label: key }))} serialize={value => value} isSelected={value => value === selected} placeholder="Select profile" select={key => { setSelected(key); setDraft({ ...presets[key] }); setSliderVersion(value => value + 1); setStatus(""); }} />}
            <Button className="vc-nc-mic-icon-button" size="small" variant="positive" disabled={!owner} onClick={save} title="Save profile" aria-label="Save profile"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg></Button>
            <Button className="vc-nc-mic-icon-button" size="small" variant="secondary" disabled={!owner} onClick={() => { setDraft({ ...defaults }); setSliderVersion(value => value + 1); setSelected(""); setName(""); setNaming(true); }} title="New profile" aria-label="New profile"><PlusIcon width={18} height={18} /></Button>
            <Button className="vc-nc-mic-icon-button" size="small" variant="secondary" disabled={!owner} onClick={() => { setName(selected ? selected + " copy" : "Copy"); setSelected(""); setNaming(true); }} title="Duplicate profile" aria-label="Duplicate profile"><CopyIcon width={18} height={18} /></Button>
            <Button className="vc-nc-mic-icon-button" size="small" variant="dangerPrimary" disabled={!selected || naming} onClick={() => { const next = { ...presets }; delete next[selected]; settings.store.profiles = { ...profiles, [owner]: next }; setSelected(""); }} title="Delete profile" aria-label="Delete profile"><DeleteIcon width={18} height={18} /></Button>
        </div></section>}{simple && <section className="vc-nc-mic-card"><strong>Stereo</strong><Switch aria-label="Stereo" checked={draft.channelsEnabled && draft.channels === 2} onChange={value => setDraft({ ...draft, channelsEnabled: value, channels: 2 })} /></section>}</div>
        <section className="vc-nc-mic-card vc-nc-mic-info"><strong>Important</strong><p>To take full advantage of this plugin, please disable <b>Krisp</b> and <b>Echo Cancellation</b>, otherwise features like Stereo (Channels) will not work.</p></section>
        <div className="vc-nc-mic-feedback" dir="rtl"><p role="status">{status || appliedStatus}</p></div>
        <footer className="vc-nc-mic-footer"><span>Microphone Settings · Mc5mr</span><Button size="small" variant="secondary" onClick={() => { const applied = { ...settings.store.applied }; delete applied[owner]; settings.store.applied = applied; removeAudio("mic"); setDraft({ ...defaults }); setSelected(""); setSliderVersion(value => value + 1); setStatus("تمت استعادة الصوت وحذف الإعدادات المطبقة المحفوظة لهذا الحساب."); }}>Restore</Button><FormSwitch title="Simple" value={simple} onChange={setSimple} hideBorder /><Button onClick={() => { try { applyAudio("mic", draft); settings.store.applied = { ...settings.store.applied, [owner]: { ...draft } }; setStatus(""); onApplied?.(); } catch (error) { setStatus(String(error)); } }}>Apply</Button></footer>
    </Panel>;
}
export default definePlugin({
    name: "MicSettings", description: "Saved microphone encoder controls with per-account presets.",
    authors: [Devs.Mc5mr], enabledByDefault: true, tags: ["Utility", "Voice"], dependencies: ["NightcordUI"], settings, managedStyle: style,
    openSettings, settingsAboutComponent: MicrophonePanel,
    start: applySaved,
    toolboxActions: { "Microphone Settings": openSettings },
    flux: {
        LOGOUT() { clearAudio(); },
        CONNECTION_OPEN: applySaved,
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (voiceStates.some(state => state.userId === UserStore.getCurrentUser()?.id)) FluxDispatcher.wait(resumeAudio);
        }
    },
    stop() { clearAudio(); closeModal(MODAL_KEY); }
});


