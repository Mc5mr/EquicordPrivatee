/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Mc5mr and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import definePlugin from "@utils/types";
import { React, showToast, Toasts } from "@webpack/common";

interface FrozenShare {
    sender: RTCRtpSender;
    source: MediaStreamTrack;
    frame: MediaStreamTrack;
    stop: () => void;
}

const senders = new Set<RTCRtpSender>();
const subscribers = new Set<() => void>();
let frozen: FrozenShare | undefined;
let busy = false;
let generation = 0;
let unhook: (() => void) | undefined;

function publish() {
    for (const subscriber of subscribers) subscriber();
}

function subscribe(callback: () => void) {
    subscribers.add(callback);
    return () => { subscribers.delete(callback); };
}

function displayTracks() {
    return [...senders].filter(sender => {
        const track = sender.track;
        return track?.kind === "video" && track.readyState === "live" && !!track.getSettings().displaySurface;
    });
}

async function restore(share: FrozenShare) {
    if (share.sender.track !== share.frame) return;
    await share.sender.replaceTrack(share.source.readyState === "live" ? share.source : null);
}

async function release(share: FrozenShare) {
    await restore(share);
    share.stop();
    if (frozen === share) {
        frozen = undefined;
        publish();
    }
}

async function freeze(sender: RTCRtpSender, source: MediaStreamTrack, epoch: number) {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = new MediaStream([source]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: MediaStreamTrack | undefined;
    let shared = false;
    const ended = () => {
        if (frozen?.source === source) void release(frozen).catch(() => {});
    };
    try {
        await Promise.race([
            video.play(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Capture timed out")), 3000);
            })
        ]);
        if (epoch !== generation || sender.track !== source || source.readyState !== "live") return;
        if (!video.videoWidth || !video.videoHeight) throw new Error("No display frame");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(video, 0, 0);
        const stream = canvas.captureStream(1);
        context.drawImage(video, 0, 0);
        frame = stream.getVideoTracks()[0];
        if (!frame) throw new Error("No frozen track");
        const track = frame;
        const share: FrozenShare = { sender, source, frame: track, stop() {
            source.removeEventListener("ended", ended);
            track.stop();
        } };
        await sender.replaceTrack(track);
        if (epoch !== generation || source.readyState !== "live") {
            await release(share);
            return;
        }
        frozen = share;
        shared = true;
        source.addEventListener("ended", ended, { once: true });
        publish();
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        video.pause();
        video.srcObject = null;
        if (!shared) frame?.stop();
    }
}

async function toggle() {
    if (busy || !unhook) return;
    busy = true;
    try {
        if (frozen) {
            await release(frozen);
            return;
        }
        const matches = displayTracks();
        const sender = matches[0];
        if (matches.length !== 1 || !sender?.track) {
            showToast("ما لقيت مشاركة شاشة متوافقة للتثبيت.", Toasts.Type.FAILURE);
            return;
        }
        await freeze(sender, sender.track, generation);
    } catch {
        showToast("تعذر تغيير حالة تثبيت مشاركة الشاشة.", Toasts.Type.FAILURE);
    } finally {
        busy = false;
    }
}

function Skull({ className }: { className?: string; }) {
    return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3a8 8 0 0 0-4 15v3h8v-3a8 8 0 0 0-4-15Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <path d="M12 18v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>;
}

function FreezeButton() {
    const active = React.useSyncExternalStore(subscribe, () => !!frozen);
    return <HeaderBarButton icon={Skull} selected={active}
        tooltip={active ? "استئناف صورة الشير" : "تثبيت صورة الشير الحالية"}
        onClick={() => void toggle()} />;
}

export default definePlugin({
    name: "StreamFreeze",
    description: "Freeze and resume the outgoing video of a supported WebRTC display share.",
    authors: [{ name: "Mc5mr", id: 523157034141745153n }],
    tags: ["Voice"],
    headerBarButton: { icon: Skull, render: FreezeButton, priority: 100 },
    start() {
        const prototype = globalThis.RTCPeerConnection?.prototype;
        if (!prototype || unhook) return;
        const { addTrack, addTransceiver, close } = prototype;
        const patchedAddTrack: typeof addTrack = function (this: RTCPeerConnection, ...args) {
            const sender = addTrack.apply(this, args);
            senders.add(sender);
            return sender;
        };
        const patchedAddTransceiver: typeof addTransceiver = function (this: RTCPeerConnection, ...args) {
            const transceiver = addTransceiver.apply(this, args);
            senders.add(transceiver.sender);
            return transceiver;
        };
        const patchedClose: typeof close = function (this: RTCPeerConnection) {
            for (const sender of this.getSenders()) {
                senders.delete(sender);
                if (frozen?.sender === sender) {
                    frozen.stop();
                    frozen = undefined;
                    publish();
                }
            }
            return close.call(this);
        };
        prototype.addTrack = patchedAddTrack;
        prototype.addTransceiver = patchedAddTransceiver;
        prototype.close = patchedClose;
        unhook = () => {
            if (prototype.addTrack === patchedAddTrack) prototype.addTrack = addTrack;
            if (prototype.addTransceiver === patchedAddTransceiver) prototype.addTransceiver = addTransceiver;
            if (prototype.close === patchedClose) prototype.close = close;
        };
    },
    stop() {
        generation++;
        unhook?.();
        unhook = undefined;
        senders.clear();
        const share = frozen;
        if (share) void release(share).catch(() => { share.stop(); frozen = undefined; publish(); });
    }
});
