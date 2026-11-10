/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MediaEngine, MediaEngineConnection } from "@vencord/discord-types";
import { ChannelStore, MediaEngineStore, UserStore, VoiceStateStore } from "@webpack/common";

export interface AudioConfig {
    encoderRate: number; sampleRate: number; packetSamples: number; channels: number; bitrate: number;
    rateEnabled: boolean; sampleEnabled: boolean; packetEnabled: boolean; channelsEnabled: boolean; bitrateEnabled: boolean;
}
export const defaults: AudioConfig = { encoderRate: 128000, sampleRate: 48000, packetSamples: 960, channels: 2, bitrate: 128, rateEnabled: false, sampleEnabled: false, packetEnabled: false, channelsEnabled: true, bitrateEnabled: false };
const requests = new Map<string, AudioConfig>();
const connections = new Map<MediaEngineConnection, { sync(): void; restore(reset?: boolean): void; }>();
const listeners = new Set<() => void>();
let engineRestore: (() => void) | undefined;
let installedEngine: MediaEngine | undefined;
let configurationRevision = 0;
let owner: string | undefined;
let status = "لم يتم تطبيق إعدادات مخصصة.";
export function subscribeAudio(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getAudioStatus() { return status; }
function publish(value: string) { if (status === value) return; status = value; listeners.forEach(listener => listener()); }
export function validate(config: AudioConfig): string | null {
    if (config.channelsEnabled && ![1, 2].includes(config.channels)) return "Opus يدعم هنا قناة واحدة أو قناتين فقط.";
    if (config.sampleEnabled && ![8000, 12000, 16000, 24000, 48000].includes(config.sampleRate)) return "Sample Rate يجب أن يكون 8000 أو 12000 أو 16000 أو 24000 أو 48000 Hz.";
    const frameMs = config.packetSamples / (config.sampleEnabled ? config.sampleRate : 48000) * 1000;
    if (config.packetEnabled && ![2.5, 5, 10, 20, 40, 60].includes(frameMs)) return "Pac Size يجب أن يمثل إطار Opus بين 2.5 و60 ms؛ 960 عند 48000 Hz يساوي 20 ms.";
    if (config.rateEnabled && (!Number.isFinite(config.encoderRate) || config.encoderRate < 8000 || config.encoderRate > 512000)) return "Encoder Bitrate يجب أن يكون بين 8000 و512000 bit/s.";
    if (config.bitrateEnabled && (!Number.isFinite(config.bitrate) || config.bitrate < 8 || config.bitrate > 512)) return "Audio Bitrate يجب أن يكون بين 8 و512 Kb/s.";
    return null;
}
function enabled(value: AudioConfig) { return value.rateEnabled || value.sampleEnabled || value.packetEnabled || value.channelsEnabled || value.bitrateEnabled; }
function config() {
    if (!requests.size) return;
    const result = { ...defaults };
    const values = [...requests.entries()].filter(([source]) => source !== "mic").map(([, value]) => value);
    const mic = requests.get("mic");
    if (mic) values.push(mic);
    for (const value of values) {
        if (value.rateEnabled) { result.rateEnabled = true; result.encoderRate = value.encoderRate; }
        if (value.sampleEnabled) { result.sampleEnabled = true; result.sampleRate = value.sampleRate; }
        if (value.packetEnabled) { result.packetEnabled = true; result.packetSamples = value.packetSamples; }
        if (value.channelsEnabled) { result.channelsEnabled = true; result.channels = value.channels; }
        if (value.bitrateEnabled) { result.bitrateEnabled = true; result.bitrate = value.bitrate; }
    }
    return result;
}
function allowedRate(value: number) {
    const state = owner ? VoiceStateStore.getVoiceStateForUser(owner) : undefined;
    const channel = state?.channelId ? ChannelStore.getChannel(state.channelId) : undefined;
    return Math.min(value, channel?.bitrate ?? 96000);
}
export function transformOptions(options: object, value: AudioConfig): object {
    const result: Record<string, unknown> = { ...options };
    if ("audioEncoder" in options && options.audioEncoder && typeof options.audioEncoder === "object") {
        const encoder = { ...options.audioEncoder } as Record<string, unknown>;
        if (value.channelsEnabled) encoder.channels = value.channels;
        if (value.sampleEnabled) {
            if (!value.packetEnabled && typeof encoder.pacsize === "number" && typeof encoder.freq === "number") encoder.pacsize = encoder.pacsize * value.sampleRate / encoder.freq;
            encoder.freq = value.sampleRate;
        }
        if (value.rateEnabled) encoder.rate = allowedRate(value.encoderRate);
        if (value.packetEnabled) encoder.pacsize = value.packetSamples;
        result.audioEncoder = encoder;
    }
    if (value.bitrateEnabled && "encodingVoiceBitRate" in options) result.encodingVoiceBitRate = allowedRate(value.bitrate * 1000);
    return result;
}
type NativeTransport = { setTransportOptions(options: object): void; };
function attach(connection: MediaEngineConnection) {
    if (connections.has(connection) || connection.destroyed || connection.context !== "default" || connection.userId !== owner) return;
    if (!("conn" in connection) || !connection.conn || typeof connection.conn !== "object" || !("setTransportOptions" in connection.conn) || typeof connection.conn.setTransportOptions !== "function") throw new Error("محرك الصوت لا يوفّر اتصال الصوت الأصلي المطلوب. لم يتم تأكيد التطبيق.");
    const native = connection.conn as NativeTransport;
    const original = native.setTransportOptions;
    const originalBitrate = connection.setVoiceBitRate;
    const originalDestroy = connection.destroy;
    let baseBitrate = connection.voiceBitrate;
    const options = connection.getCodecOptions("opus", "", connection.context);
    let baseEncoder: object | undefined;
    if ("audioEncoder" in options && options.audioEncoder && typeof options.audioEncoder === "object" && "type" in options.audioEncoder && typeof options.audioEncoder.type === "number" && options.audioEncoder.type > 0) baseEncoder = { ...options.audioEncoder };
    let sentEncoder = false;
    let appliedRevision = -1;
    let appliedEncoder: object | undefined;
    let appliedBitrate = -1;
    let appliedLimit = -1;
    const sync = () => {
        const value = config();
        if (!value || connection.destroyed || connection.userId !== UserStore.getCurrentUser()?.id) return;
        const limit = allowedRate(512000);
        if (appliedRevision === configurationRevision && appliedEncoder === baseEncoder && appliedBitrate === baseBitrate && appliedLimit === limit) return;
        const changes: Record<string, unknown> = { encodingVoiceBitRate: baseBitrate };
        if (baseEncoder) changes.audioEncoder = baseEncoder;
        Reflect.apply(original, native, [transformOptions(changes, value)]);
        connection.voiceBitrate = value.bitrateEnabled ? allowedRate(value.bitrate * 1000) : baseBitrate;
        sentEncoder = !!baseEncoder;
        appliedRevision = configurationRevision;
        appliedEncoder = baseEncoder;
        appliedBitrate = baseBitrate;
        appliedLimit = limit;
        publish(baseEncoder ? "أُرسلت الإعدادات لمحرك الصوت الحالي، وستُطبّق تلقائيًا على الاتصالات الجديدة. اختبر الصوت للتأكد من خرج الستيريو." : "تم حفظ الطلب؛ سيُرسل الترميز عند اكتمال اتصال الصوت.");
    };
    const wrapped = function (this: NativeTransport, options: object) {
        if ("audioEncoder" in options && options.audioEncoder && typeof options.audioEncoder === "object") baseEncoder = { ...options.audioEncoder };
        if ("encodingVoiceBitRate" in options && typeof options.encodingVoiceBitRate === "number") baseBitrate = options.encodingVoiceBitRate;
        const value = config();
        const active = value && !connection.destroyed && connection.userId === UserStore.getCurrentUser()?.id;
        const payload = active && value.rateEnabled && baseEncoder && "encodingVoiceBitRate" in options && !("audioEncoder" in options) ? { ...options, audioEncoder: baseEncoder } : options;
        const result = Reflect.apply(original, this, [active ? transformOptions(payload, value) : options]);
        if (active && "audioEncoder" in options) { sentEncoder = true; publish("أُرسلت إعدادات الترميز لمحرك الصوت. اختبر الصوت للتأكد من خرج الستيريو."); }
        return result;
    };
    const setBitrate = function (this: MediaEngineConnection, value: number) {
        baseBitrate = value;
        const active = config();
        const rate = active?.bitrateEnabled && this.userId === UserStore.getCurrentUser()?.id ? allowedRate(active.bitrate * 1000) : value;
        const saved = baseBitrate;
        Reflect.apply(originalBitrate, this, [rate]);
        baseBitrate = saved;
    };
    if (!Reflect.set(native, "setTransportOptions", wrapped)) throw new Error("واجهة الصوت الأصلية للقراءة فقط؛ لم تُطبّق الإعدادات.");
    if (!Reflect.set(connection, "setVoiceBitRate", setBitrate)) { Reflect.set(native, "setTransportOptions", original); throw new Error("واجهة معدل الصوت للقراءة فقط؛ لم تُطبّق الإعدادات."); }
    const destroy: typeof originalDestroy = function (...args) {
        try { return Reflect.apply(originalDestroy, connection, args); }
        finally { connections.get(connection)?.restore(); connections.delete(connection); }
    };
    if (!Reflect.set(connection, "destroy", destroy)) { Reflect.set(native, "setTransportOptions", original); Reflect.set(connection, "setVoiceBitRate", originalBitrate); throw new Error("تعذّر ربط دورة حياة اتصال الصوت."); }
    connections.set(connection, { sync, restore(reset = true) {
        if (native.setTransportOptions === wrapped) Reflect.set(native, "setTransportOptions", original);
        if (connection.setVoiceBitRate === setBitrate) Reflect.set(connection, "setVoiceBitRate", originalBitrate);
        if (connection.destroy === destroy) Reflect.set(connection, "destroy", originalDestroy);
        if (!reset || connection.destroyed) return;
        const changes: Record<string, unknown> = { encodingVoiceBitRate: baseBitrate };
        if (sentEncoder && baseEncoder) changes.audioEncoder = baseEncoder;
        Reflect.apply(original, native, [changes]);
        connection.voiceBitrate = baseBitrate;
    } });
}
function install(): boolean {
    const engine: MediaEngine = MediaEngineStore.getMediaEngine();
    if (!engine) return false;
    if (engine === installedEngine) return true;
    if (typeof engine.connect !== "function" || !engine.connections) throw new Error("محرك الصوت في هذه النسخة لا يوفّر الواجهة المطلوبة.");
    engineRestore?.();
    connections.forEach(connection => connection.restore(false));
    connections.clear();
    installedEngine = undefined;
    engineRestore = undefined;
    const original = engine.connect;
    const wrapped: typeof original = function (...args) {
        const connection = original.apply(engine, args);
        try { attach(connection); connections.get(connection)?.sync(); }
        catch (error) { publish(String(error)); }
        return connection;
    };
    if (!Reflect.set(engine, "connect", wrapped)) throw new Error("واجهة الاتصال للقراءة فقط في هذه النسخة.");
    engineRestore = () => { if (engine.connect === wrapped) engine.connect = original; };
    installedEngine = engine;
    return true;
}
export function resumeAudio() {
    if (!requests.size) return;
    try {
        if (!install()) return;
        MediaEngineStore.getMediaEngine().connections.forEach(connection => { attach(connection); connections.get(connection)?.sync(); });
    } catch (error) { publish(String(error)); }
}
export function applyAudio(source: string, value: AudioConfig): string {
    const error = validate(value); if (error) throw new Error(error);
    const currentOwner = UserStore.getCurrentUser()?.id;
    if (!currentOwner) throw new Error("سجل الدخول أولًا.");
    if (owner && owner !== currentOwner) clearAudio();
    if (!enabled(value)) { removeAudio(source); return status; }
    owner = currentOwner;
    const previous = requests.get(source);
    requests.set(source, { ...value });
    configurationRevision++;
    try {
        publish("تم حفظ الإعدادات. تقدر تعدّلها بدون دخول روم، وسيستخدمها اتصال المايك عند توفره.");
        if (!install()) return status;
        MediaEngineStore.getMediaEngine().connections.forEach(connection => { attach(connection); connections.get(connection)?.sync(); });
    } catch (error) {
        if (previous) requests.set(source, previous); else requests.delete(source);
        configurationRevision++;
        if (!requests.size) clearAudio(); else connections.forEach(connection => connection.sync());
        publish(String(error)); throw error;
    }
    return status;
}
export function removeAudio(source: string) {
    requests.delete(source);
    configurationRevision++;
    if (!requests.size) clearAudio();
    else connections.forEach(connection => connection.sync());
}
export function clearAudio() {
    requests.clear(); engineRestore?.(); engineRestore = undefined;
    installedEngine = undefined;
    configurationRevision++;
    let failed = false;
    connections.forEach(connection => { try { connection.restore(); } catch { failed = true; } });
    connections.clear(); owner = undefined;
    publish(failed ? "أُزيلت إعدادات الصوت المخصصة؛ تعذر إرسال الاستعادة لاتصال مغلق. أعد الدخول للروم." : "تمت استعادة إعدادات الصوت الأصلية.");
}


