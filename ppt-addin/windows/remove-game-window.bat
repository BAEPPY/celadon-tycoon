@echo off
rem Removes the "celadon-game://open" address registered by the install file.
chcp 65001 >nul
reg delete "HKCU\Software\Classes\celadon-game" /f >nul 2>nul
reg delete "HKCU\Software\Microsoft\Office\16.0\Common\Security\Trusted Protocols\All Applications\celadon-game:" /f >nul 2>nul
reg delete "HKCU\Software\Policies\Microsoft\Office\16.0\Common\Security\Trusted Protocols\All Applications\celadon-game:" /f >nul 2>nul
echo  지웠어요.
pause
