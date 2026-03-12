@echo off
REM YunyaClaw 内置 openclaw 命令行包装器
REM 安装时若勾选「添加到 PATH」，可直接在终端运行 openclaw
set "OC_ROOT=%~dp0"
set "NODE=%OC_ROOT%resources\node-win\node.exe"
set "OC_DIR=%OC_ROOT%resources\openclaw\node_modules\openclaw"
cd /d "%OC_DIR%"
"%NODE%" "openclaw.mjs" %*
