; YunyaClaw 自定义 NSIS：安装时可选将 openclaw 添加到 PATH
; 仅写入当前用户 PATH（HKCU\Environment\Path），无需额外插件

!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "nsDialogs.nsh"
!include "StrFunc.nsh"

${StrStr}

Var AddToPathCheckbox
Var AddToPath

; ─── 安装前：关闭正在运行的旧实例 ───
!macro customInit
  ; 1. 用 /T 杀进程树：主进程 + 所有子进程（node.exe gateway 等）
  nsExec::ExecToStack 'taskkill /f /t /im YunyaClaw.exe'
  Pop $0
  Pop $1
  ; 2. 兜底：按命令行匹配残留的 openclaw gateway node 进程
  nsExec::ExecToStack 'cmd.exe /c wmic process where "commandline like ''%openclaw.mjs%gateway%'' and name=''node.exe''" call terminate >nul 2>&1'
  Pop $0
  Pop $1
  ; 3. 兜底：按安装路径匹配残留的 node.exe
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ''*YunyaClaw*'' -or $_.Path -like ''*yunya-claw*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Pop $0
  Pop $1
  ; 等待进程完全退出并释放文件锁（2秒更稳妥）
  Sleep 2000
  ; 4. 再次尝试，确保彻底清理（某些进程第一轮可能正在退出中）
  nsExec::ExecToStack 'taskkill /f /t /im YunyaClaw.exe'
  Pop $0
  Pop $1
  Sleep 500
!macroend

; 只在安装器里插入页面，且把函数定义也放进宏里
; 避免在 BUILD_UNINSTALLER 阶段出现"函数未引用"的 warning 6010
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
    Page custom AddToPathPage AddToPathPageLeave "添加 openclaw 到 PATH"

    Function AddToPathPage
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 24u "选择是否将 openclaw 添加到用户 PATH，以便在终端中直接运行 openclaw 命令："
      Pop $0

      ${NSD_CreateCheckbox} 0 30u 100% 12u "将 openclaw 添加到 PATH"
      Pop $AddToPathCheckbox

      ${NSD_SetState} $AddToPathCheckbox ${BST_CHECKED}
      nsDialogs::Show
    FunctionEnd

    Function AddToPathPageLeave
      ${NSD_GetState} $AddToPathCheckbox $AddToPath
    FunctionEnd
  !endif
!macroend

!macro customUnInstall
  ; 卸载前关闭正在运行的实例（含进程树）
  nsExec::ExecToStack 'taskkill /f /t /im YunyaClaw.exe'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'cmd.exe /c wmic process where "commandline like ''%openclaw.mjs%gateway%'' and name=''node.exe''" call terminate >nul 2>&1'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ''*YunyaClaw*'' -or $_.Path -like ''*yunya-claw*'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Pop $0
  Pop $1
  Sleep 2000
  nsExec::ExecToStack 'taskkill /f /t /im YunyaClaw.exe'
  Pop $0
  Pop $1
  Sleep 500

  ; 卸载时用 PowerShell 从用户 PATH 中移除 $INSTDIR
  ; 避免在卸载器上下文使用 StrRep（其内部 Call 不支持 un. 前缀限制）
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -Command "$p=[Environment]::GetEnvironmentVariable(''Path'',''User'');$parts=$p-split'';''|?{$_ -ne ''$INSTDIR'' -and $_ -ne ''''};$n=$parts-join'';'';if($n-ne$p){[Environment]::SetEnvironmentVariable(''Path'',$n,''User'')}"'
  Pop $0
  Pop $1
  System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'

  ; 删除安装时添加的防火墙规则
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="YunyaClaw Node"'
  Pop $0
  Pop $1
!macroend

!macro customInstall
  ${If} $AddToPath == ${BST_CHECKED}
    ; 读取当前用户 PATH
    ReadRegStr $0 HKCU "Environment" "Path"

    ; 目标路径：这里按你的原意写安装目录
    ; 如果你实际想加入的是某个 bin 子目录，请改成对应路径
    StrCpy $1 "$INSTDIR"

    ; PATH 为空：直接写入
    ${If} $0 == ""
      WriteRegExpandStr HKCU "Environment" "Path" "$1"
    ${Else}
      ; 用 ;PATH; / ;INSTDIR; 方式做精确匹配，避免重复追加
      StrCpy $2 ";$0;"
      StrCpy $3 ";$1;"
      ${StrStr} $4 $2 $3

      ${If} $4 == ""
        WriteRegExpandStr HKCU "Environment" "Path" "$0;$1"
      ${EndIf}
    ${EndIf}

    ; 广播环境变量变更，通知已打开的 shell / explorer
    System::Call 'user32::SendMessageTimeout(i ${HWND_BROADCAST}, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i .r0)'
  ${EndIf}

  ; 预先为内置 node.exe 添加防火墙入站规则，避免首次启动时弹出授权窗口
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="YunyaClaw Node" dir=in action=allow program="$INSTDIR\resources\node-win\node.exe" enable=yes profile=any'
  Pop $0
  Pop $1
!macroend
