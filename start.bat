@echo off
chcp 65001 >nul
title 买了啥 · 跨平台购物账本
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有找到 Node.js。
  echo 请先到 https://nodejs.org 安装 18 或更高版本，然后重新双击本文件。
  echo.
  pause
  exit /b 1
)

node src\server.js
if errorlevel 1 pause
