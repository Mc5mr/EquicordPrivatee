# Vencord, a Discord client mod
# Copyright (c) 2026 Vendicated and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

source = Path(__file__).resolve().parents[1] / "tools/ProdHallowStereo/stereo_hub.py"
spec = importlib.util.spec_from_file_location("stereo_hub", source)
hub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hub)


class Log:
    def info(self, text): pass
    def ok(self, text): pass
    def warn(self, text): pass


class StereoTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="prod-hallow-fixture-", dir=source.parents[2])
        self.base = Path(self.directory.name)
        self.assertEqual(self.base.resolve().parent, source.parents[2].resolve())
        self.root = self.base / "DiscordPTB"
        self.app = self.root / "app-1.0.1224"
        self.voice = self.app / "modules/discord_voice-1/discord_voice"
        self.voice.mkdir(parents=True)
        (self.app / "DiscordPTB.exe").write_bytes(b"fixture")
        (self.voice / "discord_voice.node").write_bytes(b"original")
        (self.voice / "nested").mkdir()
        (self.voice / "nested/keep.txt").write_text("original nested")
        self.target = hub.Target(self.root, self.voice, self.app, "DiscordPTB.exe")
        self.log = Log()
        self.data = self.base / "hub"
        self.data_patch = patch.object(hub, "hub_data_dir", return_value=self.data)
        self.data_patch.start()

    def tearDown(self):
        self.data_patch.stop()
        self.directory.cleanup()

    def stage(self, api, destination, log):
        hub.safe_mkdir(destination)
        (destination / "discord_voice.node").write_bytes(b"patched")
        (destination / "index.js").write_text("patched entry")

    def native_stage(self, target, destination, log):
        self.stage("unused", destination, log)
        return True

    def test_unsupported_version_uses_verified_legacy_payload_and_keeps_backup(self):
        profile_file = self.base / "unsupported-profiles.json"
        profile_file.write_text("[]", encoding="utf-8")
        def download(_api, destination, _log):
            self.stage("unused", destination, self.log)
        with patch.object(hub, "NATIVE_PROFILES_FILE", profile_file), patch.object(hub, "download_github_folder_to_dir", side_effect=download) as fetch, patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"):
            hub.patch(self.target, self.log)
        fetch.assert_called_once()
        self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"patched")
        self.assertEqual((hub.permanent_backup_dir(self.target) / "discord_voice.node").read_bytes(), b"original")
        self.assertEqual((self.voice / "index.js").read_text(), "patched entry")

    def test_selected_client_never_falls_back(self):
        with patch.object(hub, "_default_discord_roots", return_value=[self.root]):
            target, _ = hub.resolve_target(self.base / "MissingPTB")
            self.assertIsNone(target)

    def native_profile(self):
        original, patched = b"original", b"Original"
        profile = {"sha256": hashlib.sha256(original).hexdigest(), "patchedSha256": hashlib.sha256(patched).hexdigest(), "patches": [{"offset": 0, "expected": "6f", "replacement": "4f"}]}
        profile_file = self.base / "native-patches.json"
        profile_file.write_text(json.dumps([profile]), encoding="utf-8")
        return profile_file

    def test_native_stereo_preserves_video_and_support_files(self):
        (self.voice / "gpu_encoder_helper.exe").write_bytes(b"original video helper")
        staging = self.data / "staging/native"
        with patch.object(hub, "NATIVE_PROFILES_FILE", self.native_profile()), patch.object(hub, "download_github_folder_to_dir") as download, patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"):
            hub.patch(self.target, self.log)
            download.assert_not_called()
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"Original")
            self.assertEqual((self.voice / "gpu_encoder_helper.exe").read_bytes(), b"original video helper")
            self.assertEqual((self.voice / "nested/keep.txt").read_text(), "original nested")
            self.assertEqual((hub.permanent_backup_dir(self.target) / "discord_voice.node").read_bytes(), b"original")
            hub.patch(self.target, self.log)
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"Original", "repeat repair keeps the original baseline")

    def test_ptb_1225_short_branch_preserves_target_and_second_processing_gate(self):
        registry = json.loads(hub.NATIVE_PROFILES_FILE.read_text(encoding="utf-8"))
        profile = next(p for p in registry if p["sha256"] == "fa2466124c9b65437e0b07cc7d3b9ae945c0a6a2a283b9522b777b6dcc0826a4")
        self.assertEqual(len(profile["patches"]), 5)
        self.assertEqual(profile["patchedSha256"], "3162bd1e54ce5c5388e93e14d7c10d6e109a050fd1149b7e3ecd09263d1885a0")
        original = bytearray(6727800)
        for offset, value in [
            (6727751, "01"), (6727763, "75"), (1269024, "4c0f43e9"), (6727529, "01"),
            (966541, "84c0740983be80020000097f5e"),
            (966656, "84c0740d83be80020000090f8f39010000")
        ]:
            blob = bytes.fromhex(value)
            original[offset:offset + len(blob)] = blob
        expected = bytearray(original)
        changed_offsets = set()
        for item in profile["patches"]:
            before, after = bytes.fromhex(item["expected"]), bytes.fromhex(item["replacement"])
            offset = item["offset"]
            self.assertEqual(original[offset:offset + len(before)], before)
            self.assertEqual(len(before), len(after))
            expected[offset:offset + len(after)] = after
            changed_offsets.update(range(offset, offset + len(after)))
        self.assertEqual(expected[966552], 0xeb)
        self.assertEqual(expected[966553], original[966553])
        self.assertEqual(966552 + 2 + int.from_bytes(expected[966553:966554], "little", signed=True), 966648)
        self.assertEqual(expected[966656:966673], original[966656:966673], "the second processing gate stays intact")
        self.assertEqual(sum(a != b for a, b in zip(original, expected)), 19)
        (self.voice / "discord_voice.node").write_bytes(original)
        (self.voice / "gpu_encoder_helper.exe").write_bytes(b"unchanged video helper")
        profile = {**profile, "sha256": hashlib.sha256(original).hexdigest(), "patchedSha256": hashlib.sha256(expected).hexdigest()}
        fixture_profiles = self.base / "ptb-1225-profiles.json"
        fixture_profiles.write_text(json.dumps([profile]), encoding="utf-8")
        with patch.object(hub, "NATIVE_PROFILES_FILE", fixture_profiles), patch.object(hub, "download_github_folder_to_dir") as download, patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"):
            hub.patch(self.target, self.log)
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), expected)
            self.assertEqual((self.voice / "gpu_encoder_helper.exe").read_bytes(), b"unchanged video helper")
            hub.patch(self.target, self.log)
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), expected)
            download.assert_not_called()

    def test_legacy_stereo_migrates_from_its_exact_original_backup(self):
        hub.ensure_permanent_unpatched_backup(self.target, self.log)
        (self.voice / "discord_voice.node").write_bytes(b"legacy stereo")
        (self.voice / "gpu_encoder_helper.exe").write_bytes(b"old video helper")
        payload_file = self.base / "payload.json"
        payload_file.write_text(json.dumps({"files": [{"name": "discord_voice.node", "blob": hashlib.sha1(b"blob 13\0legacy stereo").hexdigest()}]}), encoding="utf-8")
        with patch.object(hub, "NATIVE_PROFILES_FILE", self.native_profile()), patch.object(hub, "PAYLOAD_FILE", payload_file), patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"):
            hub.patch(self.target, self.log)
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"Original")
            self.assertFalse((self.voice / "gpu_encoder_helper.exe").exists(), "old payload files cannot survive the full original-module migration")
            self.assertEqual((self.voice / "nested/keep.txt").read_text(), "original nested")

    def test_native_stereo_rejects_corrupt_originals_and_patch_sites_before_stop(self):
        profiles = self.native_profile()
        value = json.loads(profiles.read_text())
        value[0]["patches"][0]["expected"] = "ff"
        profiles.write_text(json.dumps(value))
        with patch.object(hub, "NATIVE_PROFILES_FILE", profiles), patch.object(hub, "stop_discord_processes") as stop:
            with self.assertRaisesRegex(RuntimeError, "patch location"):
                hub.patch(self.target, self.log)
            stop.assert_not_called()
        self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")

    def test_discovery_uses_the_newest_voice_module_like_settings(self):
        newer = self.app / "modules/discord_voice-3/discord_voice"
        newer.mkdir(parents=True)
        (newer / "discord_voice.node").write_bytes(b"newest module")
        voice, app, _ = hub.find_voice_dir_with_diagnostics(self.root)
        self.assertEqual(voice, newer)
        self.assertEqual(app, self.app)

    def test_stage_before_stop_and_backup_after_stop(self):
        calls = []
        def stage(api, dest, log):
            calls.append("download")
            self.stage(api, dest, log)
            return True
        def stop(*args, **kwargs):
            self.assertEqual(kwargs["target"].discord_root, self.root)
            calls.append("stop")
        with patch.object(hub, "prepare_native_stereo", side_effect=stage), patch.object(hub, "stop_discord_processes", side_effect=stop), patch.object(hub, "relaunch_discord_for_target") as launch:
            hub.patch(self.target, self.log)
            self.assertEqual(calls, ["download", "stop"])
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"patched")
            backup = hub.permanent_backup_dir(self.target)
            self.assertEqual((backup / "discord_voice.node").read_bytes(), b"original")
            self.assertEqual((backup / "nested/keep.txt").read_text(), "original nested")
            launch.assert_called_once_with(self.target, self.log)
            hub.revert(self.target, self.log)
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")
            self.assertEqual((self.voice / "nested/keep.txt").read_text(), "original nested")

    def test_download_failure_does_not_close_or_edit_discord(self):
        with patch.object(hub, "prepare_native_stereo", side_effect=RuntimeError("offline")), patch.object(hub, "stop_discord_processes") as stop:
            with self.assertRaises(RuntimeError): hub.patch(self.target, self.log)
            stop.assert_not_called()
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")

    def test_failed_install_restores_every_original_file(self):
        copy = hub.copy_dir_contents
        count = 0
        def fail_once(src, dest):
            nonlocal count
            count += 1
            if count == 1:
                (dest / "partial.txt").write_text("partial")
                raise OSError("copy failed")
            copy(src, dest)
        with patch.object(hub, "prepare_native_stereo", side_effect=self.native_stage), patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"), patch.object(hub, "copy_dir_contents", side_effect=fail_once):
            with self.assertRaisesRegex(RuntimeError, "original voice module was restored"): hub.patch(self.target, self.log)
        self.assertFalse((self.voice / "partial.txt").exists())
        self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")
        self.assertEqual((self.voice / "nested/keep.txt").read_text(), "original nested")

    def test_backups_are_specific_to_client_and_app_version(self):
        one = hub.permanent_backup_dir(self.target)
        newer = hub.Target(self.root, self.voice, self.root / "app-1.0.1225")
        self.assertNotEqual(one, hub.permanent_backup_dir(newer))
        other = hub.Target(self.base / "DiscordCanary", self.voice, self.app)
        self.assertNotEqual(one, hub.permanent_backup_dir(other))

    def test_restore_without_backup_does_not_stop_discord(self):
        with patch.object(hub, "stop_discord_processes") as stop:
            with self.assertRaisesRegex(RuntimeError, "No permanent"): hub.revert(self.target, self.log)
            stop.assert_not_called()

    def test_changed_backup_is_rejected_before_restore(self):
        backup = hub.ensure_permanent_unpatched_backup(self.target, self.log)
        (backup / "discord_voice.node").write_bytes(b"damaged backup")
        with patch.object(hub, "stop_discord_processes") as stop:
            with self.assertRaisesRegex(RuntimeError, "incomplete or has changed"): hub.revert(self.target, self.log)
            stop.assert_not_called()

    def test_partial_backup_is_rebuilt_before_install(self):
        backup = hub.permanent_backup_dir(self.target)
        backup.mkdir(parents=True)
        (backup / "discord_voice.node").write_bytes(b"partial old backup")
        hub.ensure_permanent_unpatched_backup(self.target, self.log)
        self.assertEqual((backup / "discord_voice.node").read_bytes(), b"original")
        self.assertTrue((backup.parent / "original-files.json").is_file())

    def test_invalid_target_is_rejected_before_any_action(self):
        self.target.voice_dir = self.base
        with patch.object(hub, "download_github_folder_to_dir") as download:
            with self.assertRaises(RuntimeError): hub.patch(self.target, self.log)
            download.assert_not_called()

    def test_process_stop_is_scoped_to_selected_client(self):
        with patch.object(hub.subprocess, "run") as run:
            run.return_value.returncode = 0
            hub._windows_kill_discord_update_processes_under_root(self.root)
            args = run.call_args.args[0]
            command = args[-1]
            self.assertIn(str(self.root.resolve()), command)
            self.assertIn("StartsWith($root,[StringComparison]::OrdinalIgnoreCase)", command)
            self.assertIn("Hidden", args)
            self.assertNotIn("taskkill", command)

    def test_pinned_payload_verification_rejects_one_bad_file(self):
        data = json.loads(source.with_name("payload.json").read_text(encoding="utf-8"))
        fixture = b"fixture"
        for item in data["files"]:
            item["size"] = len(fixture)
            item["blob"] = hashlib.sha1(b"blob " + str(len(fixture)).encode() + bytes([0]) + fixture).hexdigest()
        with patch.object(hub, "detect_platform_key", return_value="windows"), patch.object(hub.json, "loads", return_value=data), patch.object(hub, "download_bytes", return_value=fixture) as download, patch.object(hub, "validate_download_payload"):
            destination = self.data / "staging/test"
            hub.download_github_folder_to_dir("unused", destination, self.log)
            self.assertEqual(download.call_count, 9)
            for args in download.call_args_list:
                self.assertIn(data["commit"], args.args[0])
            data["files"][-1]["blob"] = "0" * 40
            with self.assertRaisesRegex(RuntimeError, "integrity check"): hub.download_github_folder_to_dir("unused", destination, self.log)

    def test_download_requires_fixed_repository_and_bounds(self):
        with self.assertRaisesRegex(RuntimeError, "Unexpected"): hub.download_bytes("https://example.com/payload")
        with self.assertRaisesRegex(RuntimeError, "Unexpected"): hub.download_bytes("https://raw.githubusercontent.com/ProdHallow/Discord-Stereo-Windows-MacOS-Linux/main/payload")

    def test_source_credits_and_standalone_manifest_are_kept(self):
        self.assertIn("Copyright (c) 2026 Discord Audio Collective", source.with_name("LICENSE.md").read_text(encoding="utf-8"))
        manifest = json.loads(source.with_name("payload.json").read_text())
        self.assertEqual(len(manifest["files"]), 9)
        self.assertEqual(sum(item["size"] for item in manifest["files"]), 25213746)

    def test_integrated_patch_and_revert_report_without_a_gui(self):
        with patch.object(hub, "prepare_native_stereo", side_effect=self.native_stage), patch.object(hub, "stop_discord_processes"), patch.object(hub, "relaunch_discord_for_target"), patch.object(hub.time, "sleep"):
            self.assertEqual(hub.run_integrated_action("patch", self.root), 0)
            report = json.loads((self.data / "integration-result.json").read_text())
            self.assertEqual(report["status"], "completed")
            self.assertEqual(report["root"], str(self.root))
            meta = json.loads(hub.quick_hub_meta_path(self.root).read_text())
            self.assertEqual(meta["app_version"], self.app.name)
            self.assertEqual(meta["node_sha256"], hashlib.sha256(b"patched").hexdigest())
            self.assertFalse(meta["reverted"])
            self.assertEqual(hub.run_integrated_action("revert", self.root), 0)
            self.assertTrue(json.loads(hub.quick_hub_meta_path(self.root).read_text())["reverted"])
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")

    def test_integrated_action_does_not_fall_back_to_an_old_app(self):
        (self.root / "app-1.0.1225").mkdir()
        with patch.object(hub.time, "sleep"), patch.object(hub, "stop_discord_processes") as stop:
            self.assertEqual(hub.run_integrated_action("patch", self.root), 1)
            stop.assert_not_called()
            self.assertEqual(json.loads((self.data / "integration-result.json").read_text())["status"], "failed")
            self.assertEqual((self.voice / "discord_voice.node").read_bytes(), b"original")

    def test_concurrent_installer_is_rejected_before_mutation(self):
        with hub.operation_lock(), patch.object(hub, "download_github_folder_to_dir") as download:
            with self.assertRaisesRegex(RuntimeError, "already running"):
                hub.patch(self.target, self.log)
            download.assert_not_called()

    def test_integrated_download_error_preserves_client_and_reports_failure(self):
        with patch.object(hub.time, "sleep"), patch.object(hub, "prepare_native_stereo", side_effect=RuntimeError("offline")), patch.object(hub, "stop_discord_processes") as stop:
            self.assertEqual(hub.run_integrated_action("patch", self.root), 1)
            stop.assert_not_called()
            report = json.loads((self.data / "integration-result.json").read_text())
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["message"], "offline")



class ClientSelectionTests(unittest.TestCase):
    def test_first_launch_uses_host_root_even_with_extra_flags(self):
        with patch.object(hub.Path, "read_text", side_effect=FileNotFoundError):
            self.assertEqual(hub.initial_discord_root(["--discord-root", str(source.parent), "--client", "PTB", "--extra"]), source.parent)

    def test_saved_manual_choice_survives_reopening(self):
        saved = str(source.parent / "DiscordCanary")
        with patch.object(hub.Path, "read_text", return_value=json.dumps({"root": saved})):
            self.assertEqual(hub.initial_discord_root(["--client", "Stable"]), Path(saved))

    def test_corrupt_preference_uses_ptb_host_hint(self):
        with patch.object(hub.Path, "read_text", return_value="broken json"):
            self.assertEqual(hub.initial_discord_root(["--client", "PTB"]), dict(hub.windows_discord_clients())["PTB"])

    def test_selector_contains_all_three_channels(self):
        self.assertEqual([name for name, _ in hub.windows_discord_clients()], ["Stable", "PTB", "Canary"])

    def app(self, root):
        class Variable:
            def __init__(self, value): self.value = value
            def get(self): return self.value
            def set(self, value): self.value = value
        app = hub.App.__new__(hub.App)
        app.path_var = Variable(str(root))
        app.logger = Log()
        app._refresh_client_choices = lambda: None
        app._refresh_install_derived_ui = lambda: None
        app._remember_selection = lambda: None
        app.set_status = lambda _: None
        return app

    def test_refresh_preserves_ptb_and_never_scans_stable_first(self):
        ptb = dict(hub.windows_discord_clients())["PTB"]
        app = self.app(ptb)
        target = hub.Target(ptb, ptb / "voice")
        with patch.object(hub, "resolve_target", return_value=(target, "")) as resolve:
            app.on_autodetect()
            resolve.assert_called_once_with(ptb)
        self.assertEqual(app.path_var.get(), str(ptb))

    def test_missing_canary_does_not_fall_back_to_stable(self):
        canary = dict(hub.windows_discord_clients())["Canary"]
        app = self.app(canary)
        with patch.object(hub, "resolve_target", return_value=(None, "not installed")) as resolve:
            app.on_autodetect()
            resolve.assert_called_once_with(canary)
        self.assertEqual(app.path_var.get(), str(canary))

    def test_dropdown_selection_replaces_stable_target(self):
        clients = list(hub.windows_discord_clients())
        app = self.app(clients[0][1])
        app._client_roots = clients
        app.client_combo = type("Combo", (), {"current": lambda _: 1})()
        with patch.object(app, "on_autodetect") as refresh:
            app.on_client_selected()
            refresh.assert_called_once()
        self.assertEqual(app.path_var.get(), str(clients[1][1]))

    def test_blank_target_cannot_patch_default_stable(self):
        app = self.app("")
        with patch.object(hub, "resolve_target") as resolve:
            with self.assertRaisesRegex(RuntimeError, "Select Stable"):
                app._get_target()
            resolve.assert_not_called()


if __name__ == "__main__":
    unittest.main()
