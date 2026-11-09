# Vencord, a Discord client mod
# Copyright (c) 2026 Vendicated and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

param([Parameter(Mandatory=$true)][string]$TaskFile, [Parameter(Mandatory=$true)][string]$StatusFile)
$ErrorActionPreference = 'Stop'
$task = $null
$transcript = $false
$stage = $null
$published = $false
$closed = $false
function Hash([string]$File) {
    $stream = [IO.File]::OpenRead($File)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
function State([string]$Status, [string]$Message) {
    $json = @{ status=$Status; message=$Message; pid=$PID; time=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
    [IO.File]::WriteAllText(($StatusFile + '.tmp'), $json, [Text.UTF8Encoding]::new($true))
    if (Test-Path -LiteralPath $StatusFile) { [IO.File]::Replace(($StatusFile + '.tmp'), $StatusFile, [NullString]::Value) }
    else { [IO.File]::Move(($StatusFile + '.tmp'), $StatusFile) }
    Write-Host $Message
}
function Inside([string]$Root, [string]$Path) {
    [IO.Path]::GetFullPath($Path).StartsWith([IO.Path]::GetFullPath($Root).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}
function NoLinks([string]$Path) {
    foreach ($item in @((Get-Item -LiteralPath $Path -Force)) + @(Get-ChildItem -LiteralPath $Path -Recurse -Force)) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'المجلد يحتوي رابطاً؛ ألغيت العملية.' }
    }
}
function VerifyVoice([string]$Path) {
    $files = @(Get-ChildItem -LiteralPath $Path -File -Recurse -Force)
    if ($files.Count -ne @($task.voiceFiles.PSObject.Properties).Count) { throw 'عدد ملفات الصوت غير مطابق.' }
    foreach ($property in $task.voiceFiles.PSObject.Properties) {
        if ((Hash (Join-Path $Path $property.Name)) -ne $property.Value) { throw 'بصمة ملفات الستيريو غير مطابقة.' }
    }
}
function ClientProcesses {
    @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and (Inside $task.root $_.Path) } catch { $false }
    })
}
function CloseClient {
    State 'pending' 'جارٍ إغلاق Discord المختار لتجهيز النسخة المستقلة.'
    $script:closed = $true
    foreach ($process in @(ClientProcesses)) { $process.CloseMainWindow() | Out-Null }
    Start-Sleep -Milliseconds 1800
    foreach ($process in @(ClientProcesses)) { Stop-Process -Id $process.Id -Force -ErrorAction Stop }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (@(ClientProcesses).Count -gt 0) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'لم يتم إغلاق نسخة Discord بالكامل.' }
        Start-Sleep -Milliseconds 250
    }
}
try {
    Start-Transcript -LiteralPath ($StatusFile + '.log') -Force | Out-Null
    $transcript = $true
    State 'pending' 'بدأت نافذة التثبيت. جارٍ التحقق من ملفات Discord المختار.'
    $task = Get-Content -LiteralPath $TaskFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $root = [IO.Path]::GetFullPath($task.root).TrimEnd('\')
    if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'مجلد Discord يحتوي رابطاً؛ ألغيت العملية.' }
    if ((Split-Path $root -Leaf) -notmatch '^Discord(PTB|Canary)?$' -or $task.version -notmatch '^app-1\.0\.2\d\d$') { throw 'مسار النسخة غير صالح.' }
    $destination = Join-Path $root $task.version
    if (!(Inside $root $destination) -or [IO.Path]::GetFullPath($task.executable) -ne (Join-Path $destination ((Split-Path $root -Leaf) + '.exe'))) { throw 'مسار التشغيل غير صالح.' }
    if (!(Inside $root $task.originalExecutable) -or !(Test-Path -LiteralPath $task.originalExecutable -PathType Leaf)) { throw 'تعذر العثور على نسخة Discord الأصلية.' }
    $shortcutPath = Join-Path $root 'Stereo Discord.lnk'
    if ($task.action -eq 'restore' -or $task.action -eq 'launch') {
        $record = Get-Content -LiteralPath $task.recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $marker = Get-Content -LiteralPath (Join-Path $destination '.mc5mr-stereo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($record.root -ne $root -or $record.version -ne $task.version -or $marker.root -ne $root) { throw 'هذه النسخة لا تخص المثبت.' }
        NoLinks $destination
    } elseif ($task.action -eq 'install') {
        if (Test-Path -LiteralPath $destination) { throw 'اسم المجلد مستخدم؛ لم تتغير الملفات.' }
        CloseClient
        $stage = Join-Path $root ('.mc5mr-stereo-stage-' + [Guid]::NewGuid().ToString('N'))
        [IO.Directory]::CreateDirectory($stage) | Out-Null
        if ($task.archive) {
            State 'pending' 'جارٍ فك حزمة Discord في مجلد مستقل.'
            if ((Hash $task.archive.path) -ne $task.archive.hash) { throw 'تغير ملف ZIP بعد التحقق منه.' }
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [IO.Compression.ZipFile]::OpenRead($task.archive.path)
            try {
                $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
                [long]$total = 0
                foreach ($entry in $zip.Entries) {
                    $prefix = $task.archive.version + '/'
                    if (!$entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'الحزمة تحتوي ملفات خارج مجلد النسخة.' }
                    $name = $entry.FullName.Substring($prefix.Length).Replace('/', '\')
                    if (!$name) { continue }
                    if ($name.Contains(':') -or $name.StartsWith('\') -or $name.Split('\') -contains '..') { throw 'مسار داخل ZIP غير صالح.' }
                    $path = Join-Path $stage $name
                    if (!(Inside $stage $path) -or !$seen.Add($path.TrimEnd('\'))) { throw 'الحزمة تحتوي مساراً مكرراً أو غير صالح.' }
                    $total += $entry.Length
                    if ($total -gt 2GB) { throw 'حجم الحزمة بعد الفك أكبر من الحد المدعوم.' }
                    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($path) | Out-Null; continue }
                    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $path, $false)
                }
            } finally { $zip.Dispose() }
        } else {
            if (!(Inside $root $task.sourceApp) -or !(Inside $task.sourceApp $task.originalVoice)) { throw 'مسار النسخة الأصلية غير صالح.' }
            NoLinks $task.sourceApp
            if ((Hash $task.originalVoice) -ne $task.expectedHash) { throw 'تغيرت وحدة الصوت الأصلية؛ ألغيت العملية.' }
            State 'pending' 'جارٍ نسخ ملفات Discord إلى المجلد المستقل. قد يستغرق ذلك عدة دقائق.'
            foreach ($item in @(Get-ChildItem -LiteralPath $task.sourceApp -Force)) { Copy-Item -LiteralPath $item.FullName -Destination $stage -Recurse -Force }
            $files = @(Get-ChildItem -LiteralPath $task.sourceApp -File -Recurse -Force)
            $checked = 0
            State 'pending' ('جارٍ التحقق من الملفات المنسوخة: 0 / ' + $files.Count)
            foreach ($item in $files) {
                $copy = Join-Path $stage $item.FullName.Substring($task.sourceApp.Length + 1)
                if ((Hash $item.FullName) -ne (Hash $copy)) { throw 'تغيرت ملفات Discord أثناء نسخها؛ ألغيت العملية.' }
                $checked++
                if ($checked % 100 -eq 0) { State 'pending' ('جارٍ التحقق من الملفات المنسوخة: ' + $checked + ' / ' + $files.Count) }
            }
            State 'pending' 'جارٍ تركيب الستيريو والتحقق من ملفات الصوت.'
            $voice = Join-Path $stage $task.voice
            if (!(Inside $stage $voice)) { throw 'مسار وحدة الصوت غير صالح.' }
            NoLinks $voice
            if ($task.nativePatch) {
                if ((Hash $task.nativePatch) -ne $task.voiceFiles.'discord_voice.node') { throw 'تغير ملف الستيريو المجهز؛ ألغيت العملية.' }
                Copy-Item -LiteralPath $task.nativePatch -Destination (Join-Path $voice 'discord_voice.node') -Force
            } else {
                Remove-Item -LiteralPath $voice -Recurse -Force
                [IO.Directory]::CreateDirectory($voice) | Out-Null
                foreach ($item in @(Get-ChildItem -LiteralPath $task.source -File)) { Copy-Item -LiteralPath $item.FullName -Destination $voice }
            }
        }
        NoLinks $stage
        $voice = Join-Path $stage $task.voice
        if (!(Inside $stage $voice)) { throw 'مسار وحدة الصوت غير صالح.' }
        VerifyVoice $voice
        $resources = Join-Path $stage 'resources'
        $build = Get-Content -LiteralPath (Join-Path $resources 'build_info.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($build.releaseChannel -ne $task.channel) { throw 'نوع Discord داخل الحزمة مختلف عن النسخة المختارة.' }
        $exe = Join-Path $stage ((Split-Path $root -Leaf) + '.exe')
        if (!(Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'الحزمة لا تحتوي برنامج Discord المختار.' }
        $asar = Join-Path $resources 'app.asar'
        $originalAsar = Join-Path $resources '_app.asar'
        if (!(Test-Path -LiteralPath $originalAsar -PathType Leaf)) {
            if (!(Test-Path -LiteralPath $asar -PathType Leaf)) { throw 'ملف تطبيق Discord الأصلي مفقود.' }
            Move-Item -LiteralPath $asar -Destination $originalAsar
        }
        if (Test-Path -LiteralPath $asar) { Remove-Item -LiteralPath $asar -Recurse -Force }
        [IO.Directory]::CreateDirectory($asar) | Out-Null
        if (!(Test-Path -LiteralPath $task.injector -PathType Leaf)) { throw 'ملف Equicord الحالي غير موجود.' }
        $patcher = (Join-Path $task.injector 'patcher.js') | ConvertTo-Json -Compress
        $dataDirectory = (Split-Path -Parent $task.injector) | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $asar 'index.js'), ('process.env.EQUICORD_USER_DATA_DIR=' + $dataDirectory + ';require(' + $patcher + ');'), [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $asar 'package.json'), '{"name":"discord","main":"index.js"}', [Text.UTF8Encoding]::new($false))
        @{ root=$root; version=$task.version; originalExecutable=$task.originalExecutable; executable=$task.executable } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage '.mc5mr-stereo.json') -Encoding UTF8
        State 'pending' ('اكتمل تجهيز ' + $task.version + '. جارٍ نشر النسخة المستقلة وتشغيلها.')
    } else { throw 'عملية غير معروفة.' }
    if (!$closed) { CloseClient }
    if ($task.action -eq 'install') {
        [IO.Directory]::Move($stage, $destination)
        $stage = $null
        $published = $true
        Get-Content -LiteralPath (Join-Path $destination '.mc5mr-stereo.json') -Raw -Encoding UTF8 | Set-Content -LiteralPath $task.recordFile -Encoding UTF8
        if (!(Test-Path -LiteralPath $shortcutPath)) {
            $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $task.executable
            $shortcut.WorkingDirectory = $destination
            $shortcut.Save()
        }
        State 'succeeded' ('اكتمل تجهيز ' + $task.version + '. استخدم Stereo Discord لتشغيل نسخة الستيريو مباشرة.')
    } elseif ($task.action -eq 'restore') {
        if (!(Inside $root $destination)) { throw 'مسار الحذف خارج مجلد Discord.' }
        Remove-Item -LiteralPath $destination -Recurse -Force
        Remove-Item -LiteralPath $task.recordFile -Force
        if (Test-Path -LiteralPath $shortcutPath) {
            $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
            if ($shortcut.TargetPath -eq $task.executable) { Remove-Item -LiteralPath $shortcutPath -Force }
        }
        State 'succeeded' 'حُذفت نسخة الستيريو المستقلة؛ يجري فتح Discord الأصلي.'
    } else {
        $published = $true
        State 'succeeded' 'يجري فتح نسخة Discord الستيريو المستقلة.'
    }
} catch {
    State 'failed' $_.Exception.Message
} finally {
    if ($stage -and (Inside $task.root $stage) -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    if ($closed -and @(ClientProcesses).Count -eq 0) {
        $launch = if ($published) { $task.executable } else { $task.originalExecutable }
        try { Start-Process -FilePath $launch -WorkingDirectory ([IO.Path]::GetDirectoryName($launch)) }
        catch { State 'failed' 'اكتمل تجهيز الملفات، لكن تعذر فتح Discord. استخدم الاختصار داخل مجلده.' }
    }
    if ($transcript) { Stop-Transcript | Out-Null }
    Start-Sleep -Seconds 3
}
