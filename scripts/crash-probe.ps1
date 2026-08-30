$E = Join-Path $env:LOCALAPPDATA 'Temp\kinglet-err.txt'
$O = Join-Path $env:LOCALAPPDATA 'Temp\kinglet-out.txt'
Remove-Item $E, $O -ErrorAction SilentlyContinue
$env:RUST_BACKTRACE = '1'
$p = Start-Process 'D:\Software\Kinglet\kinglet.exe' -PassThru -RedirectStandardError $E -RedirectStandardOutput $O
if ($p.WaitForExit(12000)) { "EXIT=$($p.ExitCode)" } else { "RUNNING"; Stop-Process -Id $p.Id -Force -EA 0 }
"--- STDERR ---"
if (Test-Path $E) { Get-Content $E -Raw } else { "(no stderr file)" }
