@echo off
rem Registers the address "celadon-game://open" for this Windows user (no administrator rights needed).
rem A slide hyperlink to that address opens the celadon game in its own window without an address bar
rem (Microsoft Edge "app" window). Closing that window brings the slide show back to the front.
rem The command is fixed: nothing from the hyperlink is passed on to the browser.
chcp 65001 >nul
setlocal
set "BROWSER="
for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul ^| find "REG_SZ"') do set "BROWSER=%%b"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul ^| find "REG_SZ"') do set "BROWSER=%%b"
if not defined BROWSER goto nobrowser
reg add "HKCU\Software\Classes\celadon-game" /ve /d "URL:Celadon game window" /f >nul
reg add "HKCU\Software\Classes\celadon-game" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\celadon-game\shell\open\command" /ve /d "\"%BROWSER%\" --app=https://celadon-tycoon.vercel.app/present?open=game --start-fullscreen" /f >nul
if errorlevel 1 goto failed
rem Lets PowerPoint open this one address without its "this location may be unsafe" question (ignored if not allowed).
reg add "HKCU\Software\Microsoft\Office\16.0\Common\Security\Trusted Protocols\All Applications\celadon-game:" /f >nul 2>nul
reg add "HKCU\Software\Policies\Microsoft\Office\16.0\Common\Security\Trusted Protocols\All Applications\celadon-game:" /f >nul 2>nul
echo.
echo  설치했어요. 슬라이드의 글자나 도형에 하이퍼링크(Ctrl+K)로 아래 주소를 넣어 주세요.
echo.
echo      celadon-game://open
echo.
echo  슬라이드 쇼에서 누르면 청자 만들기 게임이 주소창 없는 창으로 열려요.
echo  사용 브라우저: %BROWSER%
echo.
pause
exit /b 0
:nobrowser
echo  Microsoft Edge나 Chrome을 찾지 못했어요. 하이퍼링크에 이 주소를 대신 넣어 주세요.
echo      https://celadon-tycoon.vercel.app/present?open=game
pause
exit /b 1
:failed
echo  등록하지 못했어요. 하이퍼링크에 이 주소를 대신 넣어 주세요.
echo      https://celadon-tycoon.vercel.app/present?open=game
pause
exit /b 1
