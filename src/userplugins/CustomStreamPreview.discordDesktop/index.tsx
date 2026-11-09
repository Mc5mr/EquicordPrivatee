/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import definePlugin, { OptionType } from "@utils/types";
import type { Stream } from "@vencord/discord-types";
import { ApplicationStreamingStore, closeModal, Constants, Menu, openModal, React, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

import { Panel } from "../NightcordUI.discordDesktop/ui";
import { PreviewGallery } from "./gallery";
import { emptyProfiles, type Options, parseProfiles, type Picture, type ProfileState } from "./pictures";
import style from "./styles.css?managed";
const settings = definePluginSettings({
    enabled: { type: OptionType.BOOLEAN, description: "Replace your outgoing stream preview with a saved picture.", default: true },
    random: { type: OptionType.BOOLEAN, description: "Choose pictures in random order.", default: true },
    slideshow: { type: OptionType.BOOLEAN, description: "Rotate pictures on captured previews, at most once every ten seconds.", default: true }
});
let profiles = emptyProfiles();
let account: string | undefined;
let generation = 0;
let running = false;
let loaded = false;
let chosen: { key: string; picture: Picture; at: number; } | undefined;
const MODAL_KEY = "mc5mr-stream-preview-gallery";

function streamKey(stream: Stream) {
    return stream.guildId ? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}` : `call:${stream.channelId}:${stream.ownerId}`;
}

function currentPicture() {
    const pictures = profiles.profiles.find(profile => profile.id === profiles.selected)?.pictures ?? [];
    if (!running || !settings.store.enabled || !pictures.length || account !== UserStore.getCurrentUser()?.id) return;
    const stream = ApplicationStreamingStore.getCurrentUserActiveStream();
    if (!stream || stream.ownerId !== account) return;
    const key = streamKey(stream);
    const index = chosen ? pictures.findIndex(picture => picture.id === chosen?.picture.id) : -1;
    if (!chosen || chosen.key !== key || index < 0 || (settings.store.slideshow && Date.now() - chosen.at >= 10_000)) {
        const candidates = pictures.length > 1 ? pictures.filter(picture => picture.id !== chosen?.picture.id) : pictures;
        const picture = settings.store.random ? candidates[Math.floor(Math.random() * candidates.length)] : pictures[(index + 1) % pictures.length];
        chosen = { key, picture, at: Date.now() };
    }
    return chosen;
}

async function loadPictures() {
    const epoch = ++generation;
    loaded = false;
    if (account !== UserStore.getCurrentUser()?.id) closeModal(MODAL_KEY);
    account = UserStore.getCurrentUser()?.id;
    profiles = emptyProfiles();
    chosen = undefined;
    if (!account) return;
    try {
        const saved = await DataStore.get<unknown>(`mc5mr-stream-preview:${account}`);
        if (epoch !== generation || !running) return;
        if (saved !== undefined) profiles = parseProfiles(saved);
        loaded = true;
    } catch {
        if (running && epoch === generation) showToast("تعذر تحميل صور المعاينة. المحفوظات لم تتغير؛ جرّب إعادة التحميل من إعدادات البلوقن.", Toasts.Type.FAILURE);
    }
}

async function saveProfiles(next: ProfileState, options: Options, userId: string) {
    const validated = parseProfiles(next);
    if (!running || account !== userId || UserStore.getCurrentUser()?.id !== userId) throw new Error("Account changed. Reopen Stream Preview.");
    await DataStore.set(`mc5mr-stream-preview:${userId}`, validated);
    if (!running || account !== userId || UserStore.getCurrentUser()?.id !== userId) throw new Error("Account changed. Reopen Stream Preview.");
    profiles = validated;
    settings.store.enabled = options.enabled;
    settings.store.random = options.random;
    settings.store.slideshow = options.slideshow;
    chosen = undefined;
}

async function uploadPreview() {
    const value = currentPicture();
    if (!value) throw new Error("ابدأ شير من حسابك، وأضف صورة وفعّل الاستبدال أولًا.");
    await RestAPI.post({ url: Constants.Endpoints.STREAM_PREVIEW(value.key), body: { thumbnail: value.picture.data } });
}

function openGallery() {
    const userId = account;
    if (!userId || !loaded) return showToast("انتظر تحميل الحساب والصور أولًا.", Toasts.Type.FAILURE);
    openModal(props => <PreviewGallery {...props} state={profiles} options={{ enabled: settings.store.enabled, random: settings.store.random, slideshow: settings.store.slideshow }} onSave={(next, options) => saveProfiles(next, options, userId)} />, { modalKey: MODAL_KEY });
}

export default definePlugin({
    name: "CustomStreamPreview",
    description: "Replace stream previews with five local picture profiles, slideshow and backup controls.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Media", "Voice"],
    dependencies: ["NightcordUI"],
    settings,
    managedStyle: style,
    uploadPreview,
    openGallery,
    patches: [{ find: "ApplicationStreamPreviewUploadManager", replacement: { match: /thumbnail:(\i)(?=[,}])/g, replace: "thumbnail:$self.resolveThumbnail($1)" } }],
    resolveThumbnail(original: string) {
        const value = currentPicture();
        if (!value) return original;
        return value.picture.data;
    },
    contextMenus: {
        "stream-context"(children, { stream }: { stream?: Stream; }) {
            if (stream?.ownerId === UserStore.getCurrentUser()?.id) children.push(<Menu.MenuItem id="mc5mr-stream-preview" label="Custom Stream Preview" action={openGallery} />);
        }
    },
    settingsAboutComponent: () => <Panel><p>خمس ملفات صور لهذا الحساب على جهازك، حتى 50 صورة بكل ملف.</p><Button onClick={openGallery}>فتح الصور</Button><Button variant="secondary" onClick={() => void loadPictures()}>إعادة تحميل المحفوظات</Button></Panel>,
    start() { running = true; void loadPictures(); },
    stop() { running = false; loaded = false; generation++; account = undefined; profiles = emptyProfiles(); chosen = undefined; closeModal(MODAL_KEY); },
    flux: {
        CONNECTION_OPEN() { return loadPictures(); },
        LOGOUT() { loaded = false; generation++; account = undefined; profiles = emptyProfiles(); chosen = undefined; closeModal(MODAL_KEY); },
        STREAM_CREATE({ streamKey: key }: { streamKey: string; }) { if (account && key.endsWith(`:${account}`)) chosen = undefined; }
    }
});
