/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "@main/utils/constants";
import { createHash, randomUUID } from "crypto";
import { app, type IpcMainInvokeEvent, safeStorage } from "electron";
import { mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { request } from "https";
import { join } from "path";

import { isAccount, isToken, MAX_ACCOUNTS, profileFromResponse, type Result, type SavedAccount } from "./shared";

interface VaultAccount extends SavedAccount { token: string; }
interface Vault { version: 1; accounts: VaultAccount[]; legacyUnavailable?: boolean; }

class VaultError extends Error {}

const profilePath = app.getPath("userData");
const profileKey = createHash("sha256").update(process.platform === "win32" ? profilePath.toLowerCase() : profilePath).digest("hex").slice(0, 16);
const legacyVaultPath = join(DATA_DIR, "tokenImporterMc5mr", "accounts.encrypted");
const vaultDirectory = join(DATA_DIR, "tokenImporterMc5mr", profileKey);
const vaultPath = join(vaultDirectory, "accounts.encrypted");
let mutations: Promise<unknown> = Promise.resolve();
let retryAt = 0;

function allowedCaller(event: IpcMainInvokeEvent): boolean {
    try {
        return event.senderFrame === event.sender.mainFrame
            && ["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"].includes(new URL(event.senderFrame.url).origin);
    } catch {
        return false;
    }
}

function encryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
        && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
}

function withoutToken(account: VaultAccount): SavedAccount {
    return { id: account.id, username: account.username, displayName: account.displayName, verifiedAt: account.verifiedAt };
}

async function readVaultFile(path: string): Promise<Buffer | null> {
    try {
        if ((await stat(path)).size > 256 * 1024) throw new Error("Invalid vault size");
        return await readFile(path);
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
        throw error;
    }
}

function decodeVault(bytes: Buffer): Vault {
    const data: unknown = JSON.parse(safeStorage.decryptString(bytes));
    if (typeof data !== "object" || data === null || !("version" in data) || data.version !== 1
        || !("accounts" in data) || !Array.isArray(data.accounts) || data.accounts.length > MAX_ACCOUNTS) throw new Error("Invalid vault");
    const accounts: VaultAccount[] = [];
    for (const record of data.accounts) {
        if (!isAccount(record) || !("token" in record) || !isToken(record.token)) throw new Error("Invalid account");
        if (accounts.some(account => account.id === record.id)) throw new Error("Duplicate account");
        accounts.push({ ...record, token: record.token });
    }
    return { version: 1, accounts };
}

async function readVault(): Promise<Vault> {
    if (!encryptionAvailable()) throw new Error("Encryption unavailable");
    const bytes = await readVaultFile(vaultPath);
    if (bytes) {
        try { return decodeVault(bytes); }
        catch { throw new VaultError("This installation cannot unlock its saved accounts. The file was preserved. Use Login without saving, or open the Discord installation that saved these accounts."); }
    }
    const legacyBytes = await readVaultFile(legacyVaultPath);
    if (!legacyBytes) return { version: 1, accounts: [] };
    try {
        return decodeVault(legacyBytes);
    } catch {
        return { version: 1, accounts: [], legacyUnavailable: true };
    }
}

async function writeVault(vault: Vault): Promise<void> {
    if (!encryptionAvailable()) throw new Error("Encryption unavailable");
    const encrypted = safeStorage.encryptString(JSON.stringify({ version: 1, accounts: vault.accounts }));
    await mkdir(vaultDirectory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(vaultDirectory, `accounts-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, encrypted, { flag: "wx", mode: 0o600 });
    try {
        await rename(temporaryPath, vaultPath);
    } finally {
        await rm(temporaryPath, { force: true });
    }
}

function serialize<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
    const operation = mutations.then(action, action);
    mutations = operation;
    return operation;
}

async function guarded<T>(event: IpcMainInvokeEvent, action: () => Promise<Result<T>>): Promise<Result<T>> {
    if (!allowedCaller(event)) return { ok: false, error: "Open Token Importer from Discord desktop." };
    if (!encryptionAvailable()) return { ok: false, error: "Encrypted storage is unavailable. No tokens have been saved." };
    try {
        return await action();
    } catch (error) {
        if (error instanceof VaultError) return { ok: false, error: error.message };
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code === "ENOSPC") return { ok: false, error: "There is not enough disk space to save this account. Free some space and try again. Existing accounts were kept." };
        if (code === "EACCES" || code === "EPERM" || code === "EBUSY") return { ok: false, error: "The saved account file is locked or cannot be written. Close any duplicate window of this Discord installation and retry. Existing accounts were kept." };
        return { ok: false, error: "Could not open or save the encrypted account file. Existing accounts were not replaced." };
    }
}

function verifyToken(token: string): Promise<Result<SavedAccount>> {
    if (Date.now() < retryAt) return Promise.resolve({ ok: false, error: "Discord asked us to wait before trying again.", retryAfter: Math.ceil((retryAt - Date.now()) / 1000) });
    return new Promise(resolve => {
        const req = request("https://discord.com/api/v10/users/@me", {
            method: "GET",
            headers: { Authorization: token, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000)
        }, response => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > 64 * 1024) {
                    req.destroy();
                    resolve({ ok: false, error: "Discord returned an unexpected response." });
                } else chunks.push(chunk);
            });
            response.on("error", () => resolve({ ok: false, error: "The verification connection was interrupted. Try again." }));
            response.on("end", () => {
                const status = response.statusCode ?? 0;
                if (status === 401) return resolve({ ok: false, error: "This token is invalid or has expired." });
                if (status === 403) return resolve({ ok: false, error: "Discord did not allow this sign-in. Use Discord's normal login first." });
                if (status === 429) {
                    const header = response.headers["retry-after"];
                    const seconds = Number(Array.isArray(header) ? header[0] : header);
                    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
                    retryAt = Date.now() + delay * 1000;
                    return resolve({ ok: false, error: "Discord asked us to wait before trying again.", retryAfter: Math.ceil(delay) });
                }
                if (status !== 200) return resolve({ ok: false, error: "Discord could not verify this account. Try again later." });
                try {
                    const profile = profileFromResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                    resolve(profile ? { ok: true, value: profile } : { ok: false, error: "This is not a supported Discord user account." });
                } catch {
                    resolve({ ok: false, error: "Discord returned an unreadable response." });
                }
            });
        });
        req.on("error", () => resolve({ ok: false, error: "Could not reach Discord to verify the token. Check your connection and try again." }));
        req.end();
    });
}

export async function listAccounts(event: IpcMainInvokeEvent): Promise<Result<SavedAccount[]>> {
    return guarded(event, async () => {
        const vault = await readVault();
        return {
            ok: true, value: vault.accounts.map(withoutToken),
            notice: vault.legacyUnavailable ? "The older account file could not be unlocked in this Discord installation. It was kept unchanged. You can add your accounts separately here, or open the installation where you saved them." : undefined
        };
    });
}

export async function verifyForLogin(event: IpcMainInvokeEvent, token: unknown): Promise<Result<SavedAccount>> {
    if (!allowedCaller(event)) return { ok: false, error: "Open Token Importer from Discord desktop." };
    if (!isToken(token)) return { ok: false, error: "Paste one complete token for your own account." };
    return verifyToken(token);
}

export async function addAccount(event: IpcMainInvokeEvent, token: unknown): Promise<Result<SavedAccount>> {
    if (!isToken(token)) return { ok: false, error: "Paste a complete user token, one token per line." };
    return guarded(event, () => serialize(async () => {
        const vault = await readVault();
        const verified = await verifyToken(token);
        if (!verified.ok) return verified;
        const existing = vault.accounts.findIndex(account => account.id === verified.value.id);
        if (existing < 0 && vault.accounts.length >= MAX_ACCOUNTS) return { ok: false, error: `You can save up to ${MAX_ACCOUNTS} personal accounts.` };
        const record: VaultAccount = { ...verified.value, token };
        if (existing < 0) vault.accounts.push(record);
        else vault.accounts[existing] = record;
        await writeVault(vault);
        return { ok: true, value: verified.value };
    }));
}

export async function prepareLogin(event: IpcMainInvokeEvent, id: unknown): Promise<Result<{ token: string; }>> {
    if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return { ok: false, error: "Choose a saved account." };
    return guarded(event, async () => {
        const account = (await readVault()).accounts.find(account => account.id === id);
        if (!account) return { ok: false, error: "This account is no longer saved." };
        const verified = await verifyToken(account.token);
        if (!verified.ok) return verified;
        if (verified.value.id !== id) return { ok: false, error: "This token belongs to a different account. Remove it and import it again." };
        return { ok: true, value: { token: account.token } };
    });
}

export async function removeAccount(event: IpcMainInvokeEvent, id: unknown): Promise<Result<SavedAccount[]>> {
    if (typeof id !== "string" || !/^\d{17,20}$/.test(id)) return { ok: false, error: "Choose a saved account." };
    return guarded(event, () => serialize(async () => {
        const vault = await readVault();
        vault.accounts = vault.accounts.filter(account => account.id !== id);
        await writeVault(vault);
        return { ok: true, value: vault.accounts.map(withoutToken) };
    }));
}

export async function exportTokens(event: IpcMainInvokeEvent): Promise<Result<string>> {
    return guarded(event, async () => ({ ok: true, value: (await readVault()).accounts.map(account => account.token).join("\n") }));
}
