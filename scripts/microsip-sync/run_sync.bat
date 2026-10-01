@echo off
TITLE Karey Alimentos - Sincronizador Microsip
cd /d "%~dp0"

echo ========================================================
echo   KAREY ALIMENTOS - SINCRONIZADOR MICROSIP INVENTARIO
echo ========================================================
echo.

:: Verificar que exista config.json
if not exist "config.json" (
    echo [AVISO] No se encontro 'config.json'. Creando desde config.example.json...
    copy config.example.json config.json
    echo Edita el archivo 'config.json' con la ruta de tu base de datos de Microsip.
    pause
    exit /b
)

:: Verificar python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH.
    echo Por favor instala Python 3.9+ marcando 'Add python.exe to PATH'.
    pause
    exit /b
)

:: Ejecutar script
python sync_microsip.py --watch

pause
