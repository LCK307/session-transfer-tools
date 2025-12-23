# 💾 Web Storage Backup & Restore v3.0

Userscript để xuất/nhập localStorage, sessionStorage, cookies, IndexedDB với **mã hóa AES-256-GCM** và **nén GZIP**.

## 📥 Cài Đặt

1. Cài [Tampermonkey](https://www.tampermonkey.net/)
2. Click: [Cài đặt script](https://raw.githubusercontent.com/YourUsername/web-storage-backup/main/web-storage-backup.user.js)
3. Click "Install"

---

## 🔐 Bảo Mật

| Tính năng | Mô tả |
|-----------|-------|
| **AES-256-GCM** | Chuẩn mã hóa quân sự, ngân hàng |
| **PBKDF2** | 100,000 vòng lặp để tạo key từ mật khẩu |
| **Salt ngẫu nhiên** | 16 bytes, khác nhau mỗi lần mã hóa |
| **IV ngẫu nhiên** | 12 bytes, chống replay attack |
| **Nén GZIP** | Nén trước khi mã hóa, giảm 60-80% |
| **Offline** | Mã hóa/giải mã không cần internet |

---

## 🎯 Tính Năng

### Hỗ Trợ Dữ Liệu

| Loại | JSON | Mã hóa (.enc) | Nhập File | Copy |
|------|------|---------------|-----------|------|
| **Tất cả Storage** | ✅ | ✅ | ✅ | ✅ |
| **localStorage** | ✅ | ✅ | ✅ | - |
| **sessionStorage** | ✅ | ✅ | ✅ | - |
| **cookies** | ✅ | ✅ | ✅ | - |
| **IndexedDB** | ✅ | ✅ | ✅ | - |

### Tính Năng Khác

| Tính năng | Mô tả |
|-----------|-------|
| 📱 Nút kéo thả | Di chuyển tùy ý trên màn hình |
| 💾 Tải file | Xuất ra file .json hoặc .enc |
| 📂 Nhập từ file | Chọn file .json hoặc .enc để nhập |
| 🔄 Hoạt động offline | Tất cả xử lý trên máy |

---

## 📱 Lưu Ý Quan Trọng

| Thiết bị | Nên dùng | Tránh dùng |
|----------|----------|------------|
| **📱 Điện thoại** | 💾 Tải File | ❌ Copy (có thể mất dữ liệu) |
| **💻 Máy tính** | 💾 Tải File hoặc 📤 Copy | - |

> ⚠️ **Trên điện thoại**, clipboard có thể không copy hết dữ liệu lớn. **Luôn dùng "Tải File"**!

---

## 📂 Định Dạng File

| Định dạng | Mã hóa | Nén | Đọc được | Dùng khi |
|-----------|--------|-----|----------|----------|
| **.json** | ❌ | ❌ | ✅ | Debug, xem nội dung |
| **.enc** | ✅ AES-256 | ✅ GZIP | ❌ | Dữ liệu nhạy cảm |

### So Sánh Kích Thước
storage.json → 500 KB (đọc được)
storage.enc → 100 KB (mã hóa + nén, giảm 80%)

---

## 📖 Cách Sử Dụng

### Xuất Có Mã Hóa (Khuyến nghị cho dữ liệu nhạy cảm)
Click nút 💾
Chọn "🔐 Tải File .enc"
Nhập mật khẩu (tối thiểu 4 ký tự)
Xác nhận mật khẩu
File .enc được tải về
⚠️ NHỚ MẬT KHẨU!


### Xuất Không Mã Hóa
Click nút 💾
Chọn "💾 Tải JSON"
File .json được tải về
text


### Nhập Từ File
Click nút 💾
Chọn "📂 Nhập từ File"
Chọn file .json hoặc .enc
Nếu file .enc → Nhập mật khẩu
Xác nhận → Reload trang
✅ Xong!
text


### Copy/Paste (Chỉ dùng trên PC)
XUẤT:

Chọn "📤 Copy JSON" hoặc "🔐 Copy Base64"
Dữ liệu được copy vào clipboard
NHẬP:

Chọn "📥 Nhập JSON" hoặc "🔐 Nhập Mã hóa Base64"
Paste dữ liệu
Nếu mã hóa → Nhập mật khẩu


## 🎨 Giao Diện Menu
┌────────────────────────────────────┐
│ 📱 Điện thoại - Nên tải file! │
├────────────────────────────────────┤
│ 🔐 XUẤT MÃ HÓA (AN TOÀN) │
│ 🔐 Tải File .enc (Nén+Mã hóa) │ ← Màu xanh
│ 🔐 Copy Base64 (⚠️PC) │
├────────────────────────────────────┤
│ 📦 XUẤT KHÔNG MÃ HÓA │
│ 💾 Tải JSON │
│ 📤 Copy JSON (⚠️PC) │ ← Màu vàng
├────────────────────────────────────┤
│ 📥 NHẬP │
│ 📂 Nhập từ File (.json/.enc) │
│ 📥 Nhập JSON (Paste) │
│ 🔐 Nhập Mã hóa Base64 (Paste) │
├────────────────────────────────────┤
│ 📦 LOCALSTORAGE │
│ 💾 Tải JSON │
│ 🔐 Tải .enc │
│ 📂 Nhập File │
├────────────────────────────────────┤
│ 📋 SESSIONSTORAGE │
│ (tương tự) │
├────────────────────────────────────┤
│ 🍪 COOKIES │
│ (tương tự) │
├────────────────────────────────────┤
│ 🗄️ INDEXEDDB │
│ (tương tự) │
├────────────────────────────────────┤
│ ⚙️ KHÁC │
│ 👁️ Xem Storage │
│ 🗑️ Xóa Storage │
└────────────────────────────────────┘

### Màu Sắc

| Màu | Ý nghĩa |
|-----|---------|
| 🟢 Xanh | An toàn (có mã hóa) |
| 🟡 Vàng | Cảnh báo (không mã hóa, chỉ PC) |
| ⚪ Trắng | Bình thường |

---

## ⚠️ Giới Hạn

| Giới hạn | Mô tả |
|----------|-------|
| Cùng domain | Chỉ nhập được vào cùng trang web đã xuất |
| HttpOnly cookies | Không thể xuất (bảo mật trình duyệt) |
| Dữ liệu server | Không backup được (lưu trên server) |
| Quên mật khẩu | **KHÔNG THỂ** khôi phục file .enc |

### Trình Duyệt Hỗ Trợ

| Trình duyệt | Hỗ trợ |
|-------------|--------|
| Chrome 80+ | ✅ |
| Edge 80+ | ✅ |
| Firefox 113+ | ✅ |
| Safari 16.4+ | ✅ |
| Trình duyệt cũ | ⚠️ Chỉ JSON |

---

## 🔒 Chi Tiết Kỹ Thuật Mã Hóa
┌─────────────────────────────────────────────────────────┐
│ │
│ QUY TRÌNH MÃ HÓA: │
│ │
│ 1. JSON data │
│ ↓ │
│ 2. Nén GZIP (giảm 60-80%) │
│ ↓ │
│ 3. Tạo Salt ngẫu nhiên (16 bytes) │
│ ↓ │
│ 4. PBKDF2(password, salt, 100000) → Key 256-bit │
│ ↓ │
│ 5. Tạo IV ngẫu nhiên (12 bytes) │
│ ↓ │
│ 6. AES-256-GCM(data, key, iv) → Encrypted │
│ ↓ │
│ 7. Output: Salt + IV + Encrypted │
│ │
└─────────────────────────────────────────────────────────┘

---

## 📄 License

MIT
