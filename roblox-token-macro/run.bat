@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py) || (set PY=python)
echo Ставлю зависимости...
%PY% -m pip install -q -r requirements.txt
%PY% token_macro.py
pause
