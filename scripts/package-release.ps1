$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Write-Package([string]$name, [string]$basePath, [object[]]$files) {
  $archivePath = Join-Path $outputRoot $name
  $temporaryPath = Join-Path $outputRoot ($name + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
  $boundary = [IO.Path]::GetFullPath($basePath).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($file in $files) {
        $resolved = [IO.Path]::GetFullPath($file.FullName)
        if (-not $resolved.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package file is outside its allowed root.' }
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked files are excluded from release packages.' }
        $entryName = $resolved.Substring($boundary.Length).Replace('\', '/')
        if ($entryName -ne '.env.example' -and $entryName -match '(^|/)(\.git|\.local|node_modules|backups)(/|$)|(^|/)\.env($|\.)|wordsteps-backup-.*\.json$|\.(pem|key|p12|pfx)$') { throw 'Private file is excluded from release packages.' }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $resolved, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }
  Move-Item -LiteralPath $temporaryPath -Destination $archivePath -Force
  $result = Get-Item -LiteralPath $archivePath
  [pscustomobject]@{ package = $name; files = $files.Count; bytes = $result.Length }
}

$sourceDirectories = @('src', 'public', 'docs', 'scripts', '.github', 'cloudfunctions')
$sourceTopFiles = @('README.md', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', '.gitignore', '.env.example', 'eslint.config.js', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json')
$sourceFiles = @(
  foreach ($directory in $sourceDirectories) {
    $directoryPath = Join-Path $projectRoot $directory
    $entries = @(Get-ChildItem -LiteralPath $directoryPath -Recurse -Force)
    if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Linked paths are excluded from release packages.' }
    $entries | Where-Object { -not $_.PSIsContainer }
  }
  foreach ($name in $sourceTopFiles) { Get-Item -LiteralPath (Join-Path $projectRoot $name) }
)
Write-Package 'cet4-wordsteps-source.zip' $projectRoot $sourceFiles

$functionRoot = Join-Path $projectRoot 'cloudfunctions/wordsteps-sync'
$functionFiles = @('index.js', 'index.cjs', 'service.cjs', 'word-ids.json', 'package.json', 'package-lock.json') | ForEach-Object { Get-Item -LiteralPath (Join-Path $functionRoot $_) }
Write-Package 'wordsteps-sync.zip' $functionRoot $functionFiles
