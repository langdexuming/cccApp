param(
    [string]$EnvRoot = "E:\.env_trains",
    [switch]$SkipTemp = $false,
    [switch]$SkipPipCache = $false
)

. (Join-Path $PSScriptRoot "00-apply-cache-env.ps1") -EnvRoot $EnvRoot

function Get-DirSizeGB {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return 0
    }
    $size = (Get-ChildItem $Path -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer } |
        Measure-Object Length -Sum).Sum
    return [math]::Round(($size / 1GB), 2)
}

function Invoke-RoboMove {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path $Source)) {
        Write-Host "Skip missing source: $Source" -ForegroundColor DarkYellow
        return
    }

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Write-Host "Move cache: $Source -> $Destination" -ForegroundColor Cyan
    & robocopy $Source $Destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    $sourceSizeAfterCopy = Get-DirSizeGB $Source
    if ($LASTEXITCODE -gt 7 -and $sourceSizeAfterCopy -gt 0) {
        throw "robocopy failed for $Source -> $Destination with exit code $LASTEXITCODE"
    }

    try {
        Get-ChildItem $Source -Force -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop
        }
        Remove-Item $Source -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Source cleanup skipped (possibly already empty or locked): $Source" -ForegroundColor DarkYellow
    }
}

function Clear-DirectoryContents {
    param(
        [string]$Path,
        [string]$Label
    )
    if (-not (Test-Path $Path)) {
        Write-Host "Skip missing directory: $Path" -ForegroundColor DarkYellow
        return
    }

    Write-Host "Clear ${Label}: $Path" -ForegroundColor Cyan
    Get-ChildItem $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Host "Locked or protected, skipped: $($_.FullName)" -ForegroundColor DarkYellow
        }
    }
}

$modelscopeSrc = "C:\Users\langd\.cache\modelscope"
$modelscopeDst = Join-Path $EnvRoot "cache\modelscope"
$hfSrc = "C:\Users\langd\.cache\huggingface"
$hfDst = Join-Path $EnvRoot "cache\huggingface"
$pipCache = "C:\Users\langd\AppData\Local\pip\Cache"
$tempDir = "C:\Users\langd\AppData\Local\Temp"

$beforeC = Get-PSDrive -Name C
Write-Host "C: free before cleanup = $([math]::Round($beforeC.Free / 1GB, 2)) GB" -ForegroundColor Yellow
Write-Host "Current sizes:" -ForegroundColor Yellow
Write-Host "  C modelscope = $(Get-DirSizeGB $modelscopeSrc) GB"
Write-Host "  C huggingface = $(Get-DirSizeGB $hfSrc) GB"
Write-Host "  C pip cache = $(Get-DirSizeGB $pipCache) GB"
Write-Host "  C temp = $(Get-DirSizeGB $tempDir) GB"

Invoke-RoboMove -Source $modelscopeSrc -Destination $modelscopeDst
Invoke-RoboMove -Source $hfSrc -Destination $hfDst

if (-not $SkipPipCache) {
    Clear-DirectoryContents -Path $pipCache -Label "pip cache"
}

if (-not $SkipTemp) {
    Clear-DirectoryContents -Path $tempDir -Label "user temp"
}

$afterC = Get-PSDrive -Name C
Write-Host ""
Write-Host "C: free after cleanup = $([math]::Round($afterC.Free / 1GB, 2)) GB" -ForegroundColor Green
Write-Host "E cache sizes:" -ForegroundColor Green
Write-Host "  E modelscope = $(Get-DirSizeGB $modelscopeDst) GB"
Write-Host "  E huggingface = $(Get-DirSizeGB $hfDst) GB"
