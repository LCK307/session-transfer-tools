# 💾 Web Storage Backup & Restore

Userscript để xuất/nhập localStorage, cookies, IndexedDB giữa các thiết bị.

## 📥 Cài Đặt

1. Cài [Tampermonkey](https://www.tampermonkey.net/)
2. Click: [Cài đặt script](https://raw.githubusercontent.com/LCK307/web-storage-backup/main/web-storage-backup.user.js)
3. Click "Install"

## 🎯 Tính Năng

| Tính năng | Mô tả |
|-----------|-------|
| ✅ Xuất/Nhập localStorage | Lưu dữ liệu trang web |
| ✅ Xuất/Nhập sessionStorage | Lưu dữ liệu phiên |
| ✅ Xuất/Nhập cookies | Lưu cookies |
| ✅ Xuất/Nhập IndexedDB | Lưu database |
| ✅ Nút kéo thả | Di chuyển nút tùy ý |
| ✅ Tải file | Xuất ra file JSON/TXT |
| ✅ Chọn file để nhập | Nhập từ file |

## 📱 Lưu Ý Quan Trọng

| Thiết bị | Nên dùng | Tránh dùng |
|----------|----------|------------|
| **📱 Điện thoại** | 💾 Tải File | ❌ Copy (có thể mất dữ liệu) |
| **💻 Máy tính** | 💾 Tải File hoặc 📋 Copy | - |

> ⚠️ **Trên điện thoại**, nếu dữ liệu quá lớn, clipboard có thể không copy hết được. **Luôn dùng "Tải File"** để đảm bảo an toàn!

## 📖 Cách Sử Dụng

### Xuất Dữ Liệu
Mở trang web cần backup (vd: youtube.com)
Click nút 💾 góc màn hình
Chọn:

• 💾 Tải JSON (Tất cả) - Khuyến nghị

• 💾 Tải File Nén (.txt) - Gọn hơn

• 💾 Tải localStorage - Chỉ localStorage

• 💾 Tải Cookies - Chỉ cookies

File sẽ được tải về

### Nhập Dữ Liệu
Mở CÙNG trang web trên thiết bị mới
Click nút 💾
Chọn:
• 📂 Nhập Storage (File) - Chọn file JSON/TXT đã tải
Chọn file → OK
Reload trang
✅ Xong!

## 📂 Các Loại File

| File | Nội dung | Dùng khi |
|------|----------|----------|
| `storage-*.json` | Tất cả dữ liệu | Backup đầy đủ |
| `storage-compressed-*.txt` | Tất cả (nén) | Gửi qua chat |
| `localStorage-*.json` | Chỉ localStorage | Backup riêng |
| `cookies-*.json` | Chỉ cookies | Backup riêng |

## ⚠️ Lưu Ý

- Chỉ hoạt động trên **cùng domain** (youtube.com → youtube.com)
- **HttpOnly cookies** không thể xuất bằng JavaScript
- Dữ liệu đăng nhập lưu trên server **không thể** backup

## 📄 License

MIT
