@echo off
title AI Presentation System
echo ========================================================
echo   Starting AI Presentation System...
echo ========================================================
cd /d "%~dp0"

IF EXIST ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) ELSE IF EXIST "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

cd backend
python app.py
pause
