/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Picture { id: string; name: string; data: string; }
export interface Profile { id: string; name: string; pictures: Picture[]; }
export interface ProfileState { version: 1; profiles: Profile[]; selected: string; }
export interface Options { enabled: boolean; random: boolean; slideshow: boolean; }

export function emptyProfiles(): ProfileState {
    return { version: 1, profiles: [{ id: "default", name: "Default", pictures: [] }], selected: "default" };
}

function isPicture(value: unknown): value is Picture {
    if (!value || typeof value !== "object") return false;
    return "id" in value && typeof value.id === "string" && value.id.length <= 64 && value.id.length > 0
        && "name" in value && typeof value.name === "string" && value.name.length <= 255
        && "data" in value && typeof value.data === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.data) && value.data.length < 400_000;
}

export function parseProfiles(value: unknown): ProfileState {
    if (Array.isArray(value)) {
        const state = emptyProfiles();
        state.profiles[0].pictures = value.filter(isPicture).slice(0, 50);
        return state;
    }
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("profiles" in value) || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 5 || !("selected" in value) || typeof value.selected !== "string") throw new Error("Invalid Stream Preview backup.");
    const profiles: Profile[] = [];
    for (const profile of value.profiles) {
        if (!profile || typeof profile !== "object" || typeof profile.id !== "string" || !profile.id || profile.id.length > 64 || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 32 || !Array.isArray(profile.pictures) || profile.pictures.length > 50 || !profile.pictures.every(isPicture)) throw new Error("Invalid profile or image in backup.");
        if (profiles.some(row => row.id === profile.id) || new Set(profile.pictures.map((picture: Picture) => picture.id)).size !== profile.pictures.length) throw new Error("Duplicate profile or image IDs in backup.");
        profiles.push({ id: profile.id, name: profile.name, pictures: profile.pictures.map((picture: Picture) => ({ id: picture.id, name: picture.name, data: picture.data })) });
    }
    if (!profiles.some(profile => profile.id === value.selected)) throw new Error("Selected profile is missing.");
    return { version: 1, profiles, selected: value.selected };
}

export async function convertImage(file: File): Promise<Picture> {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("Choose PNG, JPEG or WEBP under 8 MB.");
    const image = await createImageBitmap(file);
    try {
        if (image.width * image.height > 40_000_000) throw new Error("Image dimensions are too large.");
        const canvas = new OffscreenCanvas(640, 360);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image processing is unavailable.");
        context.fillStyle = "#111111";
        context.fillRect(0, 0, 640, 360);
        const scale = Math.min(640 / image.width, 360 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (640 - width) / 2, (360 - height) / 2, width, height);
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.75 });
        let binary = "";
        for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
        const data = `data:image/jpeg;base64,${btoa(binary)}`;
        if (data.length >= 400_000) throw new Error("Converted image is too large.");
        return { id: crypto.randomUUID(), name: file.name.slice(0, 255), data };
    } finally { image.close(); }
}
