@echo off
setlocal
set "suite=%~1"
set "setup="
if not defined suite set "suite=all"
if /I "%suite%"=="--setup" (
  set "suite=all"
  set "setup=1"
)
if /I "%~2"=="--setup" set "setup=1"
set "valid="
for %%S in (all runtime insights browser smoke admin google-link google-profile account-data artist-feed theme discussions) do if /I "%suite%"=="%%S" (
  set "valid=1"
  set "suite=%%S"
)
if not defined valid (
  echo Usage: run.cmd [all^|runtime^|insights^|browser^|smoke^|admin^|google-link^|google-profile^|account-data^|artist-feed^|theme^|discussions] [--setup]
  exit /b 2
)
pushd "%~dp0..\.."
if errorlevel 1 exit /b 1
if defined setup (
  docker compose exec -T backend sh -c "apk add --no-cache poppler-utils chromium >/dev/null && npm install --prefix /tmp/hearsay-browser --no-save --ignore-scripts playwright >/dev/null"
  if errorlevel 1 goto failed
)
docker compose cp scripts/tests/. backend:/app/tests
if errorlevel 1 goto failed
docker compose exec -T --workdir /app backend node tests/run.mjs %suite%
if errorlevel 1 goto failed
popd
exit /b 0
:failed
popd
exit /b 1
