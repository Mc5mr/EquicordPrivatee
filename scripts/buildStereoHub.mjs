/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (process.platform !== "win32") throw new Error("Stereo Hub must be packaged on Windows.");
const root = resolve("tools/ProdHallowStereo");
const python = process.env.PYTHON || "python";
const result = spawnSync(python, ["-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--windowed", "--name", "StereoHub", "--distpath", "build/stereo", "--workpath", "build/stereo-work", "--specpath", "build", "--add-data", root + "/payload.json:.", "--add-data", root + "/LICENSE.md:.", "--add-data", root + "/native-patches.json:.", "--add-data", root + "/NATIVE_PATCH_LICENSE.txt:.", "--add-data", root + "/voice-replacement:voice-replacement", root + "/stereo_hub.py"], { stdio: "inherit", shell: false });
if (result.error || result.status !== 0) throw new Error("Stereo Hub packaging failed.");
const smoke = spawnSync("build/stereo/StereoHub.exe", ["--smoke-test"], { timeout: 30_000, stdio: "inherit", shell: false });
if (smoke.error || smoke.status !== 0) throw new Error("Packaged Stereo Hub GUI smoke test failed.");
const verifyReplacement = spawnSync("build/stereo/StereoHub.exe", ["--verify-replacement"], { timeout: 30_000, stdio: "inherit", shell: false, windowsHide: true });
if (verifyReplacement.error || verifyReplacement.status !== 0) throw new Error("Packaged stereo replacement failed verification.");
const smokeRoot = await mkdtemp(resolve("build/stereo-smoke-"));
const integrated = spawnSync("build/stereo/StereoHub.exe", ["--integrated-action", "patch", "--discord-root", smokeRoot + "/MissingDiscord"], { timeout: 30_000, stdio: "inherit", shell: false, windowsHide: true, env: { ...process.env, LOCALAPPDATA: smokeRoot } });
if (integrated.error || integrated.status !== 1 || JSON.parse(await readFile(smokeRoot + "/DiscordStereoHubSimple/integration-result.json", "utf8")).status !== "failed") throw new Error("Packaged integrated installer did not report a missing target safely.");
const folder = "dist/desktop/tools/ProdHallowStereo";
await mkdir(folder, { recursive: true });
await copyFile("build/stereo/StereoHub.exe", folder + "/StereoHub.exe");
await copyFile(root + "/LICENSE.md", folder + "/LICENSE.md");
await copyFile(root + "/payload.json", folder + "/payload.json");
await copyFile(root + "/native-patches.json", folder + "/native-patches.json");
await copyFile(root + "/NATIVE_PATCH_LICENSE.txt", folder + "/NATIVE_PATCH_LICENSE.txt");
await copyFile(root + "/voice-replacement/manifest.json", folder + "/replacement-manifest.json");
const bytes = await readFile(folder + "/StereoHub.exe");
await writeFile(folder + "/manifest.json", JSON.stringify({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }) + "\n");
console.log("Packaged and opened the standalone Stereo Hub GUI successfully.");

