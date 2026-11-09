/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { chooseFile, saveFile } from "@utils/web";
import type { RenderModalProps } from "@vencord/discord-types";
import { Modal, React, TextInput } from "@webpack/common";

import { Panel, Status } from "../NightcordUI.discordDesktop/ui";
import { convertImage, emptyProfiles, type Options, parseProfiles, type Picture, type ProfileState } from "./pictures";

const cl = classNameFactory("vc-mc5mr-preview-");

export function PreviewGallery({ state, options, onSave, ...props }: RenderModalProps & { state: ProfileState; options: Options; onSave(state: ProfileState, options: Options): Promise<void>; }) {
    const [draft, setDraft] = React.useState(state);
    const [config, setConfig] = React.useState(options);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("");
    const [editing, setEditing] = React.useState("");
    const filesRef = React.useRef<HTMLInputElement>(null);
    const alive = React.useRef(true);
    React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const profile = draft.profiles.find(row => row.id === draft.selected) ?? draft.profiles[0];

    function replacePictures(pictures: Picture[]) {
        setDraft(current => ({ ...current, profiles: current.profiles.map(row => row.id === profile.id ? { ...row, pictures } : row) }));
    }

    async function add(files: File[]) {
        if (busy || !files.length) return;
        setBusy(true);
        setStatus("");
        try {
            const remaining = 50 - profile.pictures.length;
            const added: Picture[] = [];
            for (const file of files.slice(0, remaining)) {
                added.push(await convertImage(file));
                if (!alive.current) return;
            }
            replacePictures([...profile.pictures, ...added]);
            if (files.length > remaining) setStatus("Added images up to the 50-image limit.");
        } catch (error) { if (alive.current) setStatus(error instanceof Error ? error.message : "Could not add images."); }
        finally { if (alive.current) setBusy(false); }
    }

    async function addOne() { const file = await chooseFile("image/png,image/jpeg,image/webp"); if (file && alive.current) await add([file]); }
    async function importBackup() {
        const file = await chooseFile(".json,application/json");
        if (!file || busy || !alive.current) return;
        setBusy(true);
        try {
            if (file.size > 100 * 1024 * 1024) throw new Error("Backup must be smaller than 100 MB.");
            const parsed = parseProfiles(JSON.parse(await file.text()));
            if (alive.current) { setDraft(parsed); setStatus("Backup loaded. Click Save to apply it."); }
        } catch (error) { if (alive.current) setStatus(error instanceof Error ? error.message : "Could not import backup."); }
        finally { if (alive.current) setBusy(false); }
    }
    async function save() {
        if (busy) return;
        setBusy(true);
        try { await onSave(draft, config); if (alive.current) props.onClose(); }
        catch (error) { if (alive.current) setStatus(error instanceof Error ? error.message : "Could not save profiles."); }
        finally { if (alive.current) setBusy(false); }
    }

    return <Modal {...props} size="xl" title="Stream Preview">
        <Panel className={cl("shell")} dir="ltr">
            <Button className={cl("enabled")} variant={config.enabled ? "positive" : "secondary"} disabled={busy} onClick={() => setConfig(current => ({ ...current, enabled: !current.enabled }))}>{config.enabled ? "✓ REPLACEMENT ENABLED" : "REPLACEMENT DISABLED"}</Button>
            <div className={cl("heading")}><strong>Profiles <small>{draft.profiles.length}/5</small></strong><Button size="small" disabled={busy || draft.profiles.length >= 5} onClick={() => {
                const id = crypto.randomUUID();
                setDraft(current => ({ ...current, profiles: [...current.profiles, { id, name: `Profile ${current.profiles.length + 1}`, pictures: [] }], selected: id }));
            }}>+ New Profile</Button></div>
            <div className={cl("profiles")}>{draft.profiles.map(row => <div className={cl("profile", { selected: row.id === profile.id })} key={row.id}>
                <Button variant={row.id === profile.id ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => setDraft(current => ({ ...current, selected: row.id }))}>{row.id === profile.id ? "✓ " : ""}{row.name} <span>{row.pictures.length}</span></Button><Button size="small" variant="secondary" disabled={busy} aria-label={`Rename ${row.name}`} onClick={() => setEditing(editing === row.id ? "" : row.id)}>Rename</Button>
            </div>)}</div>
            {editing && <TextInput value={draft.profiles.find(row => row.id === editing)?.name ?? ""} maxLength={32} placeholder="Profile name" onChange={name => setDraft(current => ({ ...current, profiles: current.profiles.map(row => row.id === editing ? { ...row, name } : row) }))} />}
            <div className={cl("hint-row")}><small>Click profile to select · Empty profiles can be deleted</small>{!profile.pictures.length && draft.profiles.length > 1 && <Button size="small" variant="dangerSecondary" disabled={busy} onClick={() => setDraft(current => { const profiles = current.profiles.filter(row => row.id !== profile.id); return { ...current, profiles, selected: profiles[0].id }; })}>Delete empty profile</Button>}</div>
            <div className={cl("toggles")}><Button disabled={busy} onClick={() => setConfig(current => ({ ...current, slideshow: !current.slideshow }))}>Slideshow: {config.slideshow ? "ON" : "OFF"}</Button><Button disabled={busy} onClick={() => setConfig(current => ({ ...current, random: !current.random }))}>Random: {config.random ? "YES" : "NO"}</Button></div>
            <div className={cl("stats")}><span>PROFILE <strong>{profile.name}</strong></span><span>IMAGES <strong>{profile.pictures.length}/50</strong></span></div>
            <div className={cl("actions")}><Button size="small" disabled={busy || profile.pictures.length >= 50} onClick={() => void addOne()}>Add Image</Button><Button size="small" disabled={busy || profile.pictures.length >= 50} onClick={() => filesRef.current?.click()}>+ Multiple</Button><Button size="small" variant="dangerSecondary" disabled={busy || !profile.pictures.length} onClick={() => replacePictures([])}>Delete All</Button><Button size="small" disabled={busy} onClick={() => saveFile(new File([JSON.stringify(draft)], "StreamPreview-backup.json", { type: "application/json" }))}>Export Backup</Button><Button size="small" disabled={busy} onClick={() => void importBackup()}>Import Backup</Button><Button size="small" variant="dangerSecondary" disabled={busy} onClick={() => { setDraft(emptyProfiles()); setEditing(""); }}>↻ Reset All</Button></div>
            <input ref={filesRef} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void add(files); }} />
            <div className={cl("images", { empty: !profile.pictures.length })} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (!busy) void add(Array.from(event.dataTransfer.files)); }}>
                {profile.pictures.length ? profile.pictures.map(picture => <div className={cl("picture")} key={picture.id}><img src={picture.data} alt={picture.name} /><Button size="small" variant="dangerSecondary" disabled={busy} onClick={() => replacePictures(profile.pictures.filter(row => row.id !== picture.id))}>Remove</Button></div>) : <div><span className={cl("camera")}>📷</span><h3>No images</h3><p>Drag images here or click “Add Image”</p></div>}
            </div>
            <p className={cl("hint")}>Images stored locally · Limit: 50 images per profile · Use Export/Import to back up your profiles</p>
            <Status>{status}</Status>
            <div className={cl("footer")}><small>{profile.name}: {profile.pictures.length}/50 images</small><Button disabled={busy} onClick={props.onClose}>Cancel</Button><Button variant="positive" disabled={busy || draft.profiles.some(row => !row.name.trim())} onClick={() => void save()}>✓ Save</Button></div>
        </Panel>
    </Modal>;
}
