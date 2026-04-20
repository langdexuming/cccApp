@echo off
setlocal

call C:\PROGRA~2\MICROS~2\2022\BUILDT~1\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "REPO_ROOT=%~dp0.."
set "CRT_OVERLAY=%REPO_ROOT%\.local-msvc\crt-x64\Contents\VC\Tools\MSVC\14.44.35207\lib\x64"
set "CRT_STORE_OVERLAY=%REPO_ROOT%\.local-msvc\crt-x64-store\Contents\VC\Tools\MSVC\14.44.35207\lib\x64"
set "VCTOOLS_DIR="

if defined VCINSTALLDIR (
  for /d %%D in ("%VCINSTALLDIR%Tools\MSVC\*") do if not defined VCTOOLS_DIR set "VCTOOLS_DIR=%%~fD\"
)

if not defined VCTOOLS_DIR (
  set "VCTOOLS_DIR=%VCINSTALLDIR%Tools\MSVC\14.44.35207\"
)

if exist "%CRT_OVERLAY%\libcmt.lib" (
  set "LIB=%CRT_OVERLAY%;%LIB%"
)

if exist "%CRT_STORE_OVERLAY%\legacy_stdio_definitions.lib" (
  set "LIB=%CRT_STORE_OVERLAY%;%LIB%"
)

if exist "%VCTOOLS_DIR%include\excpt.h" (
  set "INCLUDE=%VCTOOLS_DIR%include;%INCLUDE%"
)

if exist "%VCTOOLS_DIR%bin\Hostx64\x64\cl.exe" (
  set "PATH=%VCTOOLS_DIR%bin\Hostx64\x64;%PATH%"
)

if defined WindowsSdkDir if defined WindowsSDKVersion (
  if exist "%WindowsSdkDir%bin\%WindowsSDKVersion%x64\rc.exe" (
    set "RC=%WindowsSdkDir%bin\%WindowsSDKVersion%x64\rc.exe"
    set "PATH=%WindowsSdkDir%bin\%WindowsSDKVersion%x64;%PATH%"
  )
  if exist "%WindowsSdkDir%bin\%WindowsSDKVersion%x64\mt.exe" (
    set "MT=%WindowsSdkDir%bin\%WindowsSDKVersion%x64\mt.exe"
  )
)

if not defined CARGO_TARGET_DIR (
  set "CARGO_TARGET_DIR=%REPO_ROOT%\.cargo-target"
)

if not defined CARGO_BUILD_JOBS (
  set "CARGO_BUILD_JOBS=1"
)

set "CC=%REPO_ROOT%\scripts\cl-wrapper.cmd"
set "CXX=%REPO_ROOT%\scripts\cl-wrapper.cmd"
set "AR=%REPO_ROOT%\scripts\lib-wrapper.cmd"

set "RUSTFLAGS=%RUSTFLAGS% -C target-feature=+crt-static"

call %*
set "EXITCODE=%ERRORLEVEL%"
endlocal & exit /b %EXITCODE%
