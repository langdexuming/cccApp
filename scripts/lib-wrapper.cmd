@echo off
setlocal

set "TOOL="

if defined VCINSTALLDIR (
  for /d %%D in ("%VCINSTALLDIR%Tools\MSVC\*") do if not defined TOOL set "TOOL=%%~fD\bin\Hostx64\x64\lib.exe"
)

if not defined TOOL (
  for %%I in (lib.exe) do if not defined TOOL set "TOOL=%%~$PATH:I"
)

if not defined TOOL if defined VCINSTALLDIR (
  set "TOOL=%VCINSTALLDIR%Tools\MSVC\14.44.35207\bin\Hostx64\x64\lib.exe"
)

if not exist "%TOOL%" (
  echo lib.exe not found in PATH 1>&2
  exit /b 1
)

set /a ATTEMPT=0

:retry
"%TOOL%" %*
set "EXITCODE=%ERRORLEVEL%"

if "%EXITCODE%"=="0" goto done

set /a ATTEMPT+=1
if %ATTEMPT% GEQ 8 goto done

timeout /t 1 /nobreak >nul
goto retry

:done
endlocal & exit /b %EXITCODE%
