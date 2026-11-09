// Produce a source-map-free private package for the bundled GUI installer.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createPackage, extractFile } from "@electron/asar";

for (const name of await readdir("dist/desktop")) {
    if (name.endsWith(".map")) await rm(`dist/desktop/${name}`);
}
const stereoRoot = "dist/desktop/tools/ProdHallowStereo";
const stereoManifest = JSON.parse(await readFile(stereoRoot + "/manifest.json", "utf8"));
const stereoTool = await readFile(stereoRoot + "/StereoHub.exe");
if (stereoTool.length !== stereoManifest.size || createHash("sha256").update(stereoTool).digest("hex") !== stereoManifest.sha256) throw new Error("Bundled Stereo Hub verification failed.");
await readFile(stereoRoot + "/LICENSE.md");
await copyFile("LICENSE", "dist/desktop/LICENSE");
await copyFile("THIRD_PARTY_PLUGINS.md", "dist/desktop/THIRD_PARTY_PLUGINS.md");
await createPackage("dist/desktop", "dist/desktop.asar");
if (!extractFile("dist/desktop.asar", join("tools", "ProdHallowStereo", "StereoHub.exe")).equals(stereoTool)) throw new Error("Stereo Hub is missing from the installer bundle.");
if (!extractFile("dist/desktop.asar", join("tools", "ProdHallowStereo", "payload.json")).equals(await readFile(stereoRoot + "/payload.json"))) throw new Error("Stereo status manifest is missing from the installer bundle.");
for (const name of ["native-patches.json", "NATIVE_PATCH_LICENSE.txt"])
    if (!extractFile("dist/desktop.asar", join("tools", "ProdHallowStereo", name)).equals(await readFile(stereoRoot + "/" + name))) throw new Error("Native stereo profile or license is missing from the installer bundle.");
const replacementManifest = await readFile(stereoRoot + "/replacement-manifest.json");
if (!extractFile("dist/desktop.asar", join("tools", "ProdHallowStereo", "replacement-manifest.json")).equals(replacementManifest)) throw new Error("Stereo replacement manifest is missing from the installer bundle.");
await mkdir("installer/bundle", { recursive: true });
await copyFile("dist/desktop.asar", "installer/bundle/desktop.asar");
const bytes = await readFile("dist/desktop.asar");
if (bytes.length > 64 * 1024 * 1024) throw new Error("Bundle exceeds the client updater size limit.");
await writeFile("installer/bundle/desktop.sha256", createHash("sha256").update(bytes).digest("hex") + "\n");
console.log("Bundled private package prepared. Original source remains in the private repository.");
