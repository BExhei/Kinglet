# What icon will Explorer actually draw for a given file?
# Asks the shell itself (SHGetFileInfo) instead of trusting the registry string.
# Usage: pwsh -NoProfile -File scripts/shell-icon-probe.ps1 <file> [<file> ...]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellIco {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon; public int iIcon; public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)]  public string szTypeName;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string p, uint attr, ref SHFILEINFO i, uint cb, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr h);
}
"@

$out = Join-Path $env:TEMP 'kinglet-icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($f in $Files) {
  $fi = New-Object ShellIco+SHFILEINFO
  $cb = [System.Runtime.InteropServices.Marshal]::SizeOf($fi)
  # SHGFI_ICON 0x100 | SHGFI_LARGEICON 0x0 | SHGFI_TYPENAME 0x400
  [void][ShellIco]::SHGetFileInfo($f, 0, [ref]$fi, $cb, 0x100 -bor 0x400)
  if ($fi.hIcon -eq [IntPtr]::Zero) { Write-Output "$f -> NO ICON"; continue }
  $ico = [System.Drawing.Icon]::FromHandle($fi.hIcon)
  $bmp = New-Object System.Drawing.Bitmap 128, 128
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'NearestNeighbor'
  $g.DrawImage($ico.ToBitmap(), 0, 0, 128, 128)
  $g.Dispose()
  $name = 'shell-' + [System.IO.Path]::GetFileNameWithoutExtension($f) + [System.IO.Path]::GetExtension($f).Replace('.', '_') + '.png'
  $p = Join-Path $out $name
  $bmp.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $ico.Dispose()
  [void][ShellIco]::DestroyIcon($fi.hIcon)
  Write-Output "$f -> type='$($fi.szTypeName)' icon saved: $p"
}
