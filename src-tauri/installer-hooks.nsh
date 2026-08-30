; Kinglet NSIS installer hooks
;
; Why this file exists: Tauri 2's `fileAssociations` hard-codes the .md
; DefaultIcon to "$INSTDIR\kinglet.exe,0" (see the generated installer.nsi,
; APP_ASSOCIATE calls) and offers no per-association icon field. To give .md
; files their own document icon we overwrite that registry value after the
; files are in place. md-file.ico ships via bundle.resources, so the path is
; whatever Tauri chose — try both layouts instead of guessing.
;
; Relative jumps (+N) are used deliberately: labels inside a macro would
; collide if the macro were ever inserted twice.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Setting Markdown document icon..."
  IfFileExists "$INSTDIR\icons\md-file.ico" 0 +3
    WriteRegStr SHCTX "Software\Classes\Markdown\DefaultIcon" "" "$INSTDIR\icons\md-file.ico,0"
    Goto +4
  IfFileExists "$INSTDIR\md-file.ico" 0 +3
    WriteRegStr SHCTX "Software\Classes\Markdown\DefaultIcon" "" "$INSTDIR\md-file.ico,0"
    Goto +1
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
