@echo off
chcp 65001 >nul
title Bassma webshop - starten
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo  Bassma Lunchroom webshop (proefversie)
echo  ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is niet gevonden op deze computer.
  echo  Installeer het eerst via https://nodejs.org ^(kies de LTS-versie^) en dubbelklik daarna opnieuw op start.bat.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo  Eerste keer: benodigde onderdelen worden geinstalleerd. Even geduld...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Installeren is mislukt. Controleer je internetverbinding en probeer het opnieuw.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo PAYMENT_PROVIDER=sumup> .env
  echo SUMUP_API_BASE=http://localhost:4010>> .env
  echo SUMUP_API_KEY=simulator>> .env
  echo SUMUP_MERCHANT_CODE=MCSIM>> .env
  echo ALLOW_HTTP_WEBHOOK=1>> .env
  echo PUBLIC_URL=http://localhost:3000>> .env
  echo PORT=3000>> .env
)

node proef-setup.js

echo  De betaal-simulator en de webshop worden gestart in twee aparte vensters.
echo  Sluit die vensters om alles te stoppen.
echo.
start "Betaal-simulator (niet sluiten)" /min cmd /c "set PATH=C:\Program Files\nodejs;%PATH% && node test\mock-sumup.js"
timeout /t 2 /nobreak >nul
start "Bassma webshop (niet sluiten)" cmd /k "set PATH=C:\Program Files\nodejs;%PATH% && node server.js"
timeout /t 4 /nobreak >nul

if not defined NOBROWSER (
  start "" "http://localhost:3000"
)

echo  Klaar. De webshop is geopend in je browser: http://localhost:3000
echo.
echo  Voor het beheerpaneel ga je naar: http://localhost:3000/beheer
echo    Gebruikersnaam: eigenaar     Wachtwoord: proefversie2026
echo.
echo  Dit venster mag je sluiten. De twee andere vensters laat je openstaan zolang je de webshop gebruikt.
echo.
pause
