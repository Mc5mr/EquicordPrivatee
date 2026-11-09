# Vencord, a Discord client mod
# Copyright (c) 2026 Vendicated and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

param([string]$Worker, [string]$TaskFile, [string]$StatusFile, [string]$LockedLog)
$script:lockedStream = $null
if ($LockedLog) {
    $script:lockedStream = [IO.File]::Open($LockedLog, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite)
    $script:clientPath = (Get-Content -LiteralPath $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json).originalExecutable
    $blocked = $false
    try { $probe = [IO.File]::OpenRead($LockedLog); $probe.Dispose() }
    catch { $blocked = $true }
    if (!$blocked) { throw 'The live log fixture must block OpenRead.' }
}
function Start-Sleep { param($Seconds, $Milliseconds) }
function Get-Process {
    if (!$script:lockedStream) { return @() }
    $client = [pscustomobject]@{ Path=$script:clientPath; Id=12345 }
    $client | Add-Member ScriptMethod CloseMainWindow {
        $script:lockedStream.Dispose()
        $script:lockedStream = $null
        return $true
    }
    return @($client)
}
function Stop-Process { throw 'A test must never stop a real process.' }
function Start-Process {
    param($FilePath, $WorkingDirectory)
    [IO.File]::WriteAllText(($TaskFile + '.launch'), $FilePath)
}
function New-Object {
    param($ComObject)
    $shell = [pscustomobject]@{}
    $shell | Add-Member ScriptMethod CreateShortcut {
        param($Path)
        $shortcut = [pscustomobject]@{ TargetPath=''; WorkingDirectory=''; Path=$Path }
        $shortcut | Add-Member ScriptMethod Save { [IO.File]::WriteAllText($this.Path, $this.TargetPath) }
        if (Test-Path -LiteralPath $Path) { $shortcut.TargetPath = [IO.File]::ReadAllText($Path) }
        return $shortcut
    }
    return $shell
}
try { . $Worker -TaskFile $TaskFile -StatusFile $StatusFile }
finally { if ($script:lockedStream) { $script:lockedStream.Dispose() } }
