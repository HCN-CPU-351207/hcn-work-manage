# HCN Work Manage

Quản lý công việc 3 cấp **Tháng → Tuần → Ngày**, làm theo `CVKT_Spec.md`, có **app PC (Windows .exe)** và **app Android (.apk)**, đồng bộ với nhau qua Wi-Fi nội bộ.
Electron 44 · Capacitor 8 · Vite · React 18 + TypeScript strict · Zustand · i18next (7 ngôn ngữ) · exceljs · electron-builder (NSIS) · electron-updater.

## Cách nhanh nhất: để GitHub build cả hai app

1. Tạo một repository trên GitHub, đẩy toàn bộ thư mục này lên.
2. Vào tab **Actions**:
   - **Build HCN (Windows .exe)** → **Run workflow** → tải artifact **HCN-Setup** (file cài cho PC).
   - **Build HCN (Android .apk)** → **Run workflow** → tải artifact **HCN-Android** (file `HCN-1.0.0.apk`).
3. Mỗi lần chạy mất khoảng 5–10 phút.

## Cài trên điện thoại Android

1. Copy file `HCN-1.0.0.apk` vào điện thoại (Zalo, Google Drive, cáp USB…), bấm vào file.
2. Android hỏi "Cho phép cài ứng dụng không rõ nguồn" → bật cho ứng dụng đang mở file (Files, Zalo, Chrome…) → **Cài đặt**.
3. Google Play Protect có thể cảnh báo vì app không có trên CH Play: chọn **Vẫn cài đặt**.
4. Bản mới sau này: cài file `.apk` mới đè lên, **dữ liệu được giữ** (mọi bản đều ký cùng một khóa trong `android-signing/`).

Yêu cầu Android 7 trở lên (khuyến nghị Android 10+, WebView cập nhật).

## Đồng bộ PC ↔ điện thoại (Wi-Fi, cáp USB, Bluetooth)

PC làm trạm; điện thoại tự đồng bộ khi **app PC đang mở** và hai máy nối với nhau bằng **cùng Wi-Fi**, **cáp USB** hoặc **Bluetooth**. Dữ liệu không đi ra Internet, không cần tài khoản.

1. Trên PC: **Cài đặt > Đồng bộ** → bật **Cho phép điện thoại đồng bộ**. Lần đầu Windows hỏi tường lửa: tích cả **Private** và **Public** rồi **Allow** (mạng USB/Bluetooth thường bị xếp vào Public; bước này cần quyền Admin).
2. PC hiện các **địa chỉ** kèm nhãn đường kết nối (Wi-Fi / Cáp USB / Bluetooth) và **mã ghép đôi 6 số**.
3. Trên điện thoại: **Cài đặt > Đồng bộ** → bấm **Tìm PC tự động** (hoặc gõ địa chỉ) → nhập mã → **Kết nối**.
4. Từ đó điện thoại tự đồng bộ khi mở app, sau mỗi thay đổi (khoảng 3 giây) và mỗi 30 giây. Điện thoại nhớ mọi địa chỉ của PC nên tự chuyển Wi-Fi ↔ USB ↔ Bluetooth, không cần ghép lại.

**Không có Wi-Fi?** Dùng chia sẻ mạng của điện thoại (không tốn dữ liệu di động cho việc đồng bộ):
- **Cáp USB:** cắm điện thoại vào PC → trên điện thoại: Cài đặt > Kết nối & chia sẻ (Điểm phát sóng & chia sẻ) → bật **Chia sẻ kết nối qua USB**.
- **Bluetooth:** ghép đôi Bluetooth điện thoại với PC → trên điện thoại bật **Chia sẻ kết nối qua Bluetooth** → trên PC: biểu tượng Bluetooth ở khay → **Join a Personal Area Network** → chọn điện thoại → **Connect using > Access point**.

Cách gộp: so từng việc, **bản sửa sau cùng thắng**; việc đã xóa không sống lại; hai máy cùng tạo một mã (vd. M008) thì bản của điện thoại được đánh mã mới; việc con của việc bị xóa ở máy kia cũng bị xóa theo.
Vì so theo giờ sửa, hãy để đồng hồ PC và điện thoại ở chế độ tự động. Nhiều điện thoại có thể ghép với cùng một PC; gỡ điện thoại trong danh sách trên PC là nó không đồng bộ được nữa.

## Tổng quan dự án và lọc theo cột

- **Bấm 1 lần** vào một việc ở **CV Tháng** hoặc **CV Tuần** để mở bảng *Tổng quan dự án* bên phải (bấm đúp vẫn mở khung sửa; Esc để đóng). Trên điện thoại: chạm vào thẻ việc.
- Bảng gồm: 3 vòng chỉ số (tiến độ, thời gian đã trôi, ngày còn lại) kèm kết luận nhanh/chậm; đường tiến độ thực tế so với kế hoạch; cột giờ làm theo tuần (CV Tháng) hoặc theo ngày (CV Tuần); phân bổ thời gian theo Phân loại / Vị trí / người; danh sách việc con; độ chính xác kế hoạch; việc sắp tới và đang trễ. Bấm vào việc con để nhảy tới việc đó.
- **Lọc theo cột kiểu Excel:** rê chuột lên tiêu đề cột → nút ▾ → sắp xếp tăng/giảm, tìm giá trị, tích chọn giá trị (kèm số lượng), OK. Cột đang lọc đổi màu; nút *Lọc N cột* trên thanh lọc để xóa nhanh. Bộ lọc cột được lưu cùng **Lưu bộ lọc**.

## Hủy công việc

- Nút **⊘ Hủy việc** ở cột thao tác, khung sửa, bảng Tổng quan dự án và thanh chọn nhiều việc; có thể ghi lý do. Nút **Khôi phục** để bỏ hủy (hoặc bấm *Hoàn tác* ngay sau khi hủy).
- "Đã hủy" là dấu riêng: trạng thái, ngày và giờ thực tế đã làm **vẫn giữ nguyên**; tiến độ lúc hủy được lưu (ví dụ 60%). Việc hiện mờ, gạch ngang, nhãn "Đã hủy · ngày", thanh Gantt sọc xám.
- Hủy CV Tháng / Tuần thì các việc con **chưa xong** bị hủy theo, việc con đã xong giữ nguyên; khôi phục việc cha thì việc con bị hủy theo cũng được khôi phục.
- Việc đã hủy không tính vào tiến độ việc cha đang chạy, không quá hạn, không nhắc việc, không vào chuông và thẻ tổng quan. Lọc được bằng trạng thái "Đã hủy" hoặc lọc cột.

## Thông báo trễ hạn

Bật trong **Cài đặt > Thông báo**:
- **Việc Tháng/Tuần:** báo trước hạn N ngày, báo vào ngày đến hạn, báo khi đã trễ mà chưa xong.
- **Việc Ngày:** nhắc trước giờ bắt đầu N phút, báo khi quá giờ kết thúc mà chưa xong.
- **Giờ báo buổi sáng** cho các mốc theo ngày, và **giờ yên lặng** (thông báo rơi vào đó sẽ dời đến khi hết).
- Mỗi mốc chỉ báo một lần; máy nào đã báo thì máy kia không báo lại sau khi đồng bộ. Bấm vào thông báo để mở đúng việc.

**Điện thoại:** nhắc việc được hẹn giờ bằng hệ thống, nên vẫn báo khi đã tắt app hoặc sau khi khởi động lại máy. Lần đầu hãy **cho phép thông báo** (và *Báo thức & lời nhắc* nếu Android hỏi). Nếu báo trễ, tắt chế độ tiết kiệm pin cho HCN.

**Máy tính:** HCN cần đang chạy để nhắc. Mặc định bấm **X** chỉ ẩn xuống **khay hệ thống** (cạnh đồng hồ); tắt hẳn bằng chuột phải biểu tượng HCN > **Thoát hẳn**. Bật **Tự mở cùng Windows** để HCN chạy ẩn ngay khi đăng nhập.

## Tự build trên máy Windows

### File cài PC `HCN-Setup-1.0.0.exe`

1. Cài **Node.js 22 LTS** từ https://nodejs.org (chọn bản Windows Installer, bấm Next đến hết).
2. Giải nén thư mục này, mở **Command Prompt** (hoặc PowerShell) trong thư mục đó.
3. Chạy lần lượt:

   ```
   npm install
   npm test
   npm run dist
   ```

4. Mở thư mục `release\` → có `HCN-Setup-1.0.0.exe`. Bấm đúp để cài.

Lần đầu `npm install` tải khoảng 300–400 MB (Electron, công cụ build), mất vài phút.

### File cài Android `.apk` (cần Android Studio)

1. Cài **Android Studio** (có sẵn JDK và Android SDK).
2. Trong thư mục dự án:

   ```
   npm install
   npm run build:android
   npx cap add android
   npx @capacitor/assets generate --android --iconBackgroundColor "#34D399" --splashBackgroundColor "#121614"
   node scripts/android-prepare.mjs
   npx cap sync android
   cd android && gradlew assembleRelease
   ```

3. File nằm ở `android\app\build\outputs\apk\release\app-release.apk`.

Khóa ký APK nằm ở `android-signing/hcn-release.jks` (mật khẩu `hcn-work-manage`), để mọi bản build đều cài đè được lên nhau. Nếu phát hành rộng rãi, hãy tạo khóa riêng và khai báo trong GitHub **Settings > Secrets**: `HCN_KEYSTORE_BASE64`, `HCN_KEYSTORE_PASSWORD`, `HCN_KEY_ALIAS`, `HCN_KEY_PASSWORD`. Đổi khóa thì phải gỡ app cũ trên điện thoại (nhớ đồng bộ hoặc sao lưu trước).

### Chạy thử khi phát triển

```
npm install
npm run dev      # mở cửa sổ Electron, tự nạp lại khi sửa giao diện
npm test         # 141 test (Vitest): core, lưu trữ, gộp đồng bộ, đồng bộ HTTP đầu-cuối
npm run typecheck
```

## Cài đặt, dữ liệu, gỡ cài đặt (mục 3 của đặc tả)

| Hạng mục | Giá trị |
|---|---|
| Kiểu cài | Theo người dùng, **không cần quyền Admin**, được chọn thư mục cài |
| Thư mục cài mặc định | `%LOCALAPPDATA%\Programs\HCN Work Manage\` |
| Shortcut | Start Menu luôn có; Desktop và Start Menu luôn được tạo |
| Dữ liệu | `%APPDATA%\HCN\` gồm `data.json`, `settings.json`, `sync.json`, `backups\`, `logs\`, `tmp\` |
| Ghi dữ liệu | Nguyên tử (ghi `tmp\data.json.part` rồi đổi tên), debounce 300 ms, lỗi thì thử lại mỗi 10 giây |
| Sao lưu tự động | Mỗi ngày 1 bản (giữ 7), trước mỗi lần cập nhật (giữ 3), trước khi khôi phục |
| Gỡ cài đặt | Hỏi "Bạn có muốn xóa toàn bộ dữ liệu công việc không?", mặc định **Không** |

## Cập nhật tự động (mục 4)

- **Máy tính:** app tự kiểm tra bản mới trên GitHub Releases 10 giây sau khi mở và mỗi 6 giờ; có bản mới thì tải ngầm và hiện nút **Cài và khởi động lại** (hoặc *Để sau* — cài khi thoát app). Kiểm tra tay: Cài đặt > Cập nhật.
- **Điện thoại (từ bản 1.3.1):** app tự hỏi GitHub mỗi lần mở (cách nhau ít nhất 6 giờ); có bản mới thì hiện nút **Tải bản mới** → trình duyệt tải file .apk → chạm vào thông báo tải xong để cài đè. Dữ liệu giữ nguyên. Android luôn yêu cầu bạn bấm xác nhận cài với app cài ngoài CH Play.
- Phát hành bản mới: tăng `version` trong `package.json`, đẩy lên nhánh `main`, chạy hai workflow build; file tự đăng lên Releases.

## Chuyển dữ liệu từ bản HTML cũ

Mở bản HTML cũ → bấm **Sao lưu** (được `cvkt-backup-YYYY-MM-DD.json`) → trong app: **Cài đặt > Dữ liệu > Khôi phục từ .json** → chọn file đó.
App tự đổi `nguoi` (chữ) thành nhân sự, sinh mã W###/D###, ghép giờ thực tế với ngày, và **bỏ qua hoàn toàn** `thuchi`, `cpcd`, `vay`.

## Phím tắt

`Ctrl+K` hoặc `/` tìm kiếm · `Ctrl+N` tạo nhanh · `Ctrl+,` cài đặt · `Ctrl+S` lưu ngay · `Ctrl+Z` hoàn tác xóa (8 giây) · `Esc` đóng · `1–4` chuyển tab.
Trên Android, nút **Back** đóng lớp đang mở, rồi về Tổng quan, rồi thu nhỏ app. Sao lưu và xuất Excel mở menu **Chia sẻ** (lưu vào Drive, gửi Zalo, Gmail…).

## Cấu trúc mã nguồn

```
electron/      main.ts (cửa sổ, IPC, menu), preload.ts, storage.ts (ghi nguyên tử, sao lưu, migration),
               hub.ts + syncServer.ts (trạm đồng bộ Wi-Fi), updater.ts, excel.ts, notify.ts, logger.ts
src/core/      logic thuần, có test: status, time, codes, migrate, search, ops, actions,
               sync.ts (gộp dữ liệu), dataHub.ts (phiên bản dữ liệu)
src/platform/  capacitor.ts: lưu trữ, đồng bộ, chia sẻ file, thông báo, nút Back trên Android
capacitor.config.ts, scripts/android-prepare.mjs, android-signing/, assets/icon-*.png, assets/splash*.png
src/store/     Zustand store, ghi qua IPC
src/components Toolbar, SubNav, Overview (4 thẻ 3D), Gantt (Tháng/Tuần/Timeline/Split), Grid, Mobile,
               BulkBar, Drawer, Settings, Tooltip
src/i18n/      vi, en, zh, pt, fr, de, ja
tests/         Vitest
build/         icon.ico, icon.png, installer.nsh
```

## Đã kiểm tra những gì

- 141 test đơn vị (mục 13.1 + đồng bộ): trạng thái/tiến độ/quá hạn, ngày thực tế, Bắt đầu/Kết thúc/Reset, trùng giờ và xếp làn, chênh lệch, migration file cũ, sinh mã không tái sử dụng, ghi nguyên tử khi lỗi giữa chừng, xoay vòng sao lưu và nhật ký.
- Gộp đồng bộ: sửa khác việc, sửa cùng việc, xóa không sống lại, sửa sau khi bên kia xóa, trùng mã, việc mồ côi, người đã xóa, idempotent; đồng bộ đầu-cuối qua HTTP thật (ghép đôi sai/đúng mã, mã dùng một lần, token chỉ lưu dạng băm, gỡ thiết bị).
- Điện thoại ↔ PC trong Chromium ở chế độ Android (plugin Capacitor bản web) với trạm PC thật: ghép đôi, nhận dữ liệu, việc tạo trên điện thoại tự lên PC, thay đổi trên PC về điện thoại, dữ liệu còn sau khi mở lại app, xóa được đồng bộ.
- Kiểm tra kiểu TypeScript strict cho giao diện, phần Android và main process (với kiểu của Electron 44, Capacitor 8, electron-updater 6.8, exceljs 4.4).
- 42 kịch bản giao diện chạy trong Chromium theo checklist 13.2: 4 thẻ và số liệu, hover nâng 4 px, thanh Gantt 44 px bo 6 px, dải thực tế 4 px, Split-View, tooltip, tìm `m001`, lệnh `/`, tạo nhanh, sửa trực tiếp, khóa trạng thái khi có việc con, Bulk Bar, xóa dây chuyền + Hoàn tác, xuất Excel 4 sheet và xuất đã chọn, 7 ngôn ngữ, Dark/Light, mobile (thẻ, vuốt phải/trái, Timeline toàn màn hình), tablet.

Chỉ kiểm tra được trên máy thật: trình cài NSIS, shortcut, hộp thoại gỡ cài đặt, cài đè bản mới (Windows); cài `.apk`, menu Chia sẻ, thông báo, nút Back, đồng bộ qua Wi-Fi thật và tường lửa Windows (Android + PC).
