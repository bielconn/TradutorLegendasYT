@echo off
echo ==================================================
echo   Iniciando Servidor de Dublagem Local (Piper)
echo ==================================================
cd local-tts-server
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O servidor parou inesperadamente.
    echo Verifique a mensagem acima para detalhes.
)
pause
