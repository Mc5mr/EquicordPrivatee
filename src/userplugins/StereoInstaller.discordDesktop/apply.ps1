param([Parameter(Mandatory=$true)][string]$TaskFile)
$ErrorActionPreference = 'Stop'
$task = Get-Content -LiteralPath $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
$closed = $false
$stage = $null
$rollback = $null
$moved = $false
function Hash([string]$File) { (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() }
function State([string]$Status, [string]$Message) {
    @{ status=$Status; message=$Message; target=$task.target; time=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $task.statusFile -Encoding UTF8
    Write-Host $Message
}
function ClientProcesses {
    @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and $_.Path.StartsWith($task.root + '\', [StringComparison]::OrdinalIgnoreCase) } catch { $false }
    })
}
function VerifyDirectory([string]$Directory, $Expected) {
    $items = @(Get-ChildItem -LiteralPath $Directory -File -Recurse -Force)
    $properties = @($Expected.PSObject.Properties)
    if ($items.Count -ne $properties.Count) { throw 'عدد ملفات مجلد الصوت تغير؛ ألغيت العملية.' }
    foreach ($property in $properties) {
        $path = Join-Path $Directory $property.Name
        if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Hash $path) -ne $property.Value) { throw 'بصمة ملف الصوت غير مطابقة.' }
    }
    foreach ($item in @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'مجلد الصوت يحتوي رابطاً؛ ألغيت العملية.' }
    }
}
function CopyDirectory([string]$Source, [string]$Destination) {
    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    foreach ($item in @(Get-ChildItem -LiteralPath $Source -Force)) { Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force }
}
try {
    try { $host.UI.RawUI.WindowTitle = 'StereoInstaller - Discord voice' } catch { }
    Write-Host 'StereoInstaller: checking package and backup...'
    if (!(Test-Path -LiteralPath $task.executable -PathType Leaf)) { throw 'تعذر العثور على برنامج Discord لإعادة فتحه.' }
    if ((Hash $task.target) -ne $task.expectedHash) { throw 'تغيرت وحدة الصوت؛ ألغيت العملية.' }
    VerifyDirectory $task.voiceDirectory $task.expectedFiles
    if ($task.bundle) { VerifyDirectory $task.source $task.sourceFiles }
    elseif ((Hash $task.source) -ne $task.sourceHash) { throw 'بصمة النسخة الاحتياطية غير مطابقة.' }

    Write-Host 'Closing the selected Discord client...'
    Start-Sleep -Milliseconds 1200
    $processes = @(ClientProcesses)
    if ($processes.Count -gt 0) { $closed = $true }
    foreach ($process in $processes) { $process.CloseMainWindow() | Out-Null }
    Start-Sleep -Milliseconds 1800
    foreach ($process in @(ClientProcesses)) { Stop-Process -Id $process.Id -Force -ErrorAction Stop }
    $closed = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (@(ClientProcesses).Count -gt 0) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'لم يتم إغلاق نسخة Discord بالكامل؛ لم تتغير ملفاتها.' }
        Start-Sleep -Milliseconds 250
    }
    # Recheck after shutdown, so a concurrent client update cannot be overwritten.
    VerifyDirectory $task.voiceDirectory $task.expectedFiles
    if ((Hash $task.target) -ne $task.expectedHash) { throw 'تغيرت وحدة الصوت أثناء الإغلاق؛ ألغيت العملية.' }
    if ($task.bundle) {
        $stage = $task.voiceDirectory + '.mc5mr-stage-' + [Guid]::NewGuid().ToString('N')
        if ($task.action -eq 'install') {
            CopyDirectory $task.voiceDirectory $stage
            foreach ($property in $task.sourceFiles.PSObject.Properties) {
                Copy-Item -LiteralPath (Join-Path $task.source $property.Name) -Destination (Join-Path $stage $property.Name) -Force
            }
            if (Test-Path -LiteralPath $task.backupDirectory) {
                VerifyDirectory $task.backupDirectory $task.expectedFiles
                $rollback = $task.voiceDirectory + '.mc5mr-old-' + [Guid]::NewGuid().ToString('N')
            } else { $rollback = $task.backupDirectory }
            $patchedFiles = @{}
            foreach ($item in @(Get-ChildItem -LiteralPath $stage -File -Recurse -Force)) { $patchedFiles[$item.FullName.Substring($stage.Length + 1)] = Hash $item.FullName }
            @{ target=$task.target; originalHash=$task.expectedHash; patchedHash=$task.sourceHash; originalFiles=$task.expectedFiles; patchedFiles=$patchedFiles } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $task.backupManifest -Encoding UTF8
        } else {
            VerifyDirectory $task.backupDirectory $task.sourceFiles
            CopyDirectory $task.backupDirectory $stage
            $rollback = $task.voiceDirectory + '.mc5mr-old-' + [Guid]::NewGuid().ToString('N')
        }
        if ((Hash (Join-Path $stage 'discord_voice.node')) -ne $task.sourceHash) { throw 'بصمة الملف المرحلي غير مطابقة.' }
        [IO.Directory]::Move($task.voiceDirectory, $rollback)
        $moved = $true
        [IO.Directory]::Move($stage, $task.voiceDirectory)
        $stage = $null
        if ((Hash $task.target) -ne $task.sourceHash) { throw 'بصمة وحدة الصوت بعد التثبيت غير مطابقة.' }
        $moved = $false
        if ($rollback -ne $task.backupDirectory) { Remove-Item -LiteralPath $rollback -Recurse -Force }
        $rollback = $null
    } else {
        # Restore a legacy v16 backup, which contains only the original .node.
        $stage = $task.target + '.mc5mr-' + [Guid]::NewGuid().ToString('N') + '.tmp'
        [IO.File]::Copy($task.source, $stage, $false)
        [IO.File]::Replace($stage, $task.target, $null)
        $stage = $null
    }
    State 'succeeded' 'اكتملت العملية؛ يجري فتح Discord تلقائياً.'
} catch {
    $failure = $_.Exception.Message
    if ($moved -and $rollback -and (Test-Path -LiteralPath $rollback)) {
        try {
            if (Test-Path -LiteralPath $task.voiceDirectory) { Remove-Item -LiteralPath $task.voiceDirectory -Recurse -Force }
            [IO.Directory]::Move($rollback, $task.voiceDirectory)
            $moved = $false
        } catch { Write-Host ('Backup retained at: ' + $rollback) }
    }
    State 'failed' $failure
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    if ($closed -and !(Test-Path -LiteralPath $task.voiceDirectory)) {
        Write-Host 'Restart skipped: restore the retained backup folder first.'
    } elseif ($closed -and @(ClientProcesses).Count -eq 0) {
        try { Start-Process -FilePath $task.executable -WorkingDirectory ([IO.Path]::GetDirectoryName($task.executable)) }
        catch { State 'failed' ('انتهى تعديل الملفات، لكن تعذر فتح Discord تلقائياً: ' + $_.Exception.Message) }
    }
    Start-Sleep -Seconds 3
}
