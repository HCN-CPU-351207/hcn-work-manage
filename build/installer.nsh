; HCN Work Manage - tùy biến trình cài đặt / gỡ cài đặt (NSIS qua electron-builder)
; Dữ liệu nằm ở %APPDATA%\HCN\ (không nằm trong thư mục cài) nên cập nhật hay cài đè không làm mất dữ liệu.

; ---------- Trang cuối của trình cài đặt: ô "Tạo shortcut trên Desktop" (mặc định bật) ----------
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !define MUI_FINISHPAGE_SHOWREADME
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Tạo shortcut trên Desktop"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION hcnCreateDesktopShortcut
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
Function hcnCreateDesktopShortcut
  CreateShortCut "$DESKTOP\HCN Work Manage.lnk" "$INSTDIR\HCN Work Manage.exe" "" "$INSTDIR\HCN Work Manage.exe" 0
FunctionEnd
!endif

; ---------- Gỡ cài đặt: hỏi có xóa dữ liệu không, mặc định là Không ----------
!macro customUnInstall
  ; Bỏ qua khi đây là bước gỡ bản cũ trong lúc cập nhật
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\HCN Work Manage.lnk"
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Bạn có muốn xóa toàn bộ dữ liệu công việc không?$\r$\n$\r$\nChọn Không để giữ lại dữ liệu tại $APPDATA\HCN" /SD IDNO IDNO hcnKeepData
      RMDir /r "$APPDATA\HCN"
    hcnKeepData:
  ${endIf}
!macroend
