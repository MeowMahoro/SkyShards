Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""cd /d D:\Code\SkyShards && corepack pnpm run dev > D:\Code\SkyShards\dev.log 2>&1""", 0, False
Set WshShell = Nothing
