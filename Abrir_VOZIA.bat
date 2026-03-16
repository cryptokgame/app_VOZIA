@echo off
title VOZIA - Voice Assistant
cd /d "D:\YT Finance Automatization\app_VOZIA"
echo Iniciando VOZIA...
echo Cargando entorno virtual y modelos de IA...
call venv\Scripts\activate
python backend\main.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo La aplicacion ha detectado un error.
    echo Presiona una tecla para ver los detalles tecnico...
    pause
)
