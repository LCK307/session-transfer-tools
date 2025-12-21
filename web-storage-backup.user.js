// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Xuất/Nhập localStorage, cookies, IndexedDB với nút kéo thả
// @author       LCK307
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @homepageURL  https://github.com/LCK307/web-storage-backup
// @supportURL   https://github.com/LCK307/web-storage-backup/issues
// @updateURL    https://raw.githubusercontent.com/LCK307/web-storage-backup/main/web-storage-backup.user.js
// @downloadURL  https://raw.githubusercontent.com/LCK307/web-storage-backup/main/web-storage-backup.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== EXPORT FUNCTIONS ====================

    function exportLocalStorage() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    }

    function exportSessionStorage() {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    }

    function exportCookies() {
        const cookies = {};
        document.cookie.split(';').forEach(cookie => {
            const [name, ...valueParts] = cookie.trim().split('=');
            if (name) {
                cookies[name] = valueParts.join('=');
            }
        });
        return cookies;
    }

    async function exportIndexedDB() {
        const databases = await indexedDB.databases?.() || [];
        const result = {};

        for (const dbInfo of databases) {
            if (!dbInfo.name) continue;

            try {
                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbInfo.name);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                result[dbInfo.name] = {
                    version: db.version,
                    stores: {}
                };

                const storeNames = Array.from(db.objectStoreNames);

                for (const storeName of storeNames) {
                    try {
                        const tx = db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        const data = await new Promise((resolve, reject) => {
                            const request = store.getAll();
                            request.onsuccess = () => resolve(request.result);
                            request.onerror = () => reject(request.error);
                        });
                        result[dbInfo.name].stores[storeName] = data;
                    } catch (e) {
                        console.warn(`Không đọc được store ${storeName}:`, e);
                    }
                }

                db.close();
            } catch (e) {
                console.warn(`Không đọc được DB ${dbInfo.name}:`, e);
            }
        }

        return result;
    }

    async function exportAll() {
        const data = {
            _meta: {
                url: window.location.origin,
                hostname: window.location.hostname,
                exportedAt: new Date().toISOString(),
                userAgent: navigator.userAgent
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB()
        };

        return JSON.stringify(data, null, 2);
    }

    async function exportCompressed() {
        const data = await exportAll();
        try {
            return btoa(unescape(encodeURIComponent(data)));
        } catch {
            return data;
        }
    }

    // ==================== IMPORT FUNCTIONS ====================

    function importLocalStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
            try {
                localStorage.setItem(key, value);
                count++;
            } catch (e) {
                console.warn(`Lỗi set localStorage[${key}]:`, e);
            }
        }
        return count;
    }

    function importSessionStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const [key, value] of Object.entries(data)) {
            try {
                sessionStorage.setItem(key, value);
                count++;
            } catch (e) {
                console.warn(`Lỗi set sessionStorage[${key}]:`, e);
            }
        }
        return count;
    }

    function importCookies(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;
        for (const [name, value] of Object.entries(data)) {
            try {
                const expires = new Date();
                expires.setFullYear(expires.getFullYear() + 1);
                document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`;
                count++;
            } catch (e) {
                console.warn(`Lỗi set cookie[${name}]:`, e);
            }
        }
        return count;
    }

    async function importIndexedDB(data) {
        if (!data || typeof data !== 'object') return 0;
        let count = 0;

        for (const [dbName, dbData] of Object.entries(data)) {
            try {
                await new Promise((resolve) => {
                    const deleteRequest = indexedDB.deleteDatabase(dbName);
                    deleteRequest.onsuccess = resolve;
                    deleteRequest.onerror = resolve;
                    deleteRequest.onblocked = resolve;
                });

                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbName, dbData.version || 1);

                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        for (const storeName of Object.keys(dbData.stores || {})) {
                            if (!db.objectStoreNames.contains(storeName)) {
                                db.createObjectStore(storeName, { autoIncrement: true });
                            }
                        }
                    };

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                for (const [storeName, storeData] of Object.entries(dbData.stores || {})) {
                    if (!db.objectStoreNames.contains(storeName)) continue;

                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);

                    for (const item of storeData) {
                        try {
                            store.add(item);
                            count++;
                        } catch (e) {
                            console.warn(`Lỗi add vào ${storeName}:`, e);
                        }
                    }

                    await new Promise(resolve => {
                        tx.oncomplete = resolve;
                        tx.onerror = resolve;
                    });
                }

                db.close();
            } catch (e) {
                console.warn(`Lỗi import DB ${dbName}:`, e);
            }
        }

        return count;
    }

    async function importAll(input) {
        try {
            let data;

            try {
                const decoded = decodeURIComponent(escape(atob(input)));
                data = JSON.parse(decoded);
            } catch {
                data = JSON.parse(input);
            }

            if (data._meta?.hostname && data._meta.hostname !== window.location.hostname) {
                const confirmImport = window.confirm(
                    `⚠️ Dữ liệu từ: ${data._meta.hostname}\n` +
                    `Trang hiện tại: ${window.location.hostname}\n\n` +
                    `Vẫn tiếp tục nhập?`
                );
                if (!confirmImport) return { success: false, error: 'Người dùng hủy' };
            }

            const results = {
                localStorage: importLocalStorage(data.localStorage),
                sessionStorage: importSessionStorage(data.sessionStorage),
                cookies: importCookies(data.cookies),
                indexedDB: await importIndexedDB(data.indexedDB)
            };

            return {
                success: true,
                results,
                total: Object.values(results).reduce((a, b) => a + b, 0)
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function getStats() {
        return {
            localStorage: localStorage.length,
            sessionStorage: sessionStorage.length,
            cookies: document.cookie.split(';').filter(c => c.trim()).length
        };
    }

    // ==================== ACTION HANDLERS ====================

    async function handleExportJSON() {
        try {
            const data = await exportAll();
            GM_setClipboard(data);

            const parsed = JSON.parse(data);
            const stats = {
                localStorage: Object.keys(parsed.localStorage || {}).length,
                sessionStorage: Object.keys(parsed.sessionStorage || {}).length,
                cookies: Object.keys(parsed.cookies || {}).length,
                indexedDB: Object.keys(parsed.indexedDB || {}).length
            };

            alert(
                `✅ Đã copy vào clipboard!\n\n` +
                `📊 Thống kê:\n` +
                `├── localStorage: ${stats.localStorage} keys\n` +
                `├── sessionStorage: ${stats.sessionStorage} keys\n` +
                `├── cookies: ${stats.cookies} cookies\n` +
                `└── indexedDB: ${stats.indexedDB} databases\n\n` +
                `📋 Dán vào thiết bị khác để nhập.`
            );
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    async function handleExportCompressed() {
        try {
            const data = await exportCompressed();
            GM_setClipboard(data);
            alert(
                `✅ Đã copy dạng nén!\n\n` +
                `Kích thước: ${(data.length / 1024).toFixed(1)} KB\n\n` +
                `Gọn hơn để gửi qua chat.`
            );
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleExportLocalStorage() {
        const data = JSON.stringify(exportLocalStorage(), null, 2);
        GM_setClipboard(data);
        alert(`✅ Đã copy localStorage (${Object.keys(JSON.parse(data)).length} keys)`);
    }

    function handleExportCookies() {
        const data = JSON.stringify(exportCookies(), null, 2);
        GM_setClipboard(data);
        alert(`✅ Đã copy cookies (${Object.keys(JSON.parse(data)).length} cookies)`);
    }

    async function handleImport() {
        const input = prompt(
            '📥 NHẬP DỮ LIỆU STORAGE\n\n' +
            'Dán dữ liệu đã xuất từ thiết bị khác:\n' +
            '(Hỗ trợ JSON hoặc chuỗi nén)\n\n' +
            '⚠️ Sẽ ghi đè dữ liệu hiện tại!'
        );

        if (!input || !input.trim()) return;

        const result = await importAll(input.trim());

        if (result.success) {
            const reload = confirm(
                `✅ Nhập thành công!\n\n` +
                `📊 Chi tiết:\n` +
                `├── localStorage: ${result.results.localStorage} keys\n` +
                `├── sessionStorage: ${result.results.sessionStorage} keys\n` +
                `├── cookies: ${result.results.cookies} cookies\n` +
                `└── indexedDB: ${result.results.indexedDB} records\n\n` +
                `🔄 Reload trang để áp dụng?`
            );

            if (reload) {
                location.reload();
            }
        } else {
            alert(`❌ Lỗi: ${result.error}`);
        }
    }

    function handleView() {
        const stats = getStats();

        let preview = `📊 STORAGE CỦA ${window.location.hostname}\n\n`;
        preview += `localStorage: ${stats.localStorage} keys\n`;
        preview += `sessionStorage: ${stats.sessionStorage} keys\n`;
        preview += `cookies: ${stats.cookies} cookies\n\n`;

        preview += `── localStorage (10 đầu) ──\n`;
        for (let i = 0; i < Math.min(10, localStorage.length); i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            preview += `${key}: ${value?.slice(0, 50)}...\n`;
        }

        alert(preview);
    }

    function handleClear() {
        const choice = prompt(
            '🗑️ XÓA STORAGE\n\n' +
            'Nhập số để chọn:\n' +
            '1 - Xóa localStorage\n' +
            '2 - Xóa sessionStorage\n' +
            '3 - Xóa cookies\n' +
            '4 - Xóa TẤT CẢ\n' +
            '0 - Hủy'
        );

        switch (choice) {
            case '1':
                localStorage.clear();
                alert('✅ Đã xóa localStorage');
                break;
            case '2':
                sessionStorage.clear();
                alert('✅ Đã xóa sessionStorage');
                break;
            case '3':
                document.cookie.split(';').forEach(cookie => {
                    const name = cookie.split('=')[0].trim();
                    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                });
                alert('✅ Đã xóa cookies');
                break;
            case '4':
                if (confirm('⚠️ Xóa TẤT CẢ storage?')) {
                    localStorage.clear();
                    sessionStorage.clear();
                    document.cookie.split(';').forEach(cookie => {
                        const name = cookie.split('=')[0].trim();
                        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                    });
                    alert('✅ Đã xóa tất cả!');
                }
                break;
        }
    }

    // ==================== MENU COMMANDS (Giữ nguyên) ====================

    GM_registerMenuCommand('📤 Xuất Storage (JSON)', handleExportJSON);
    GM_registerMenuCommand('🗜️ Xuất Storage (Nén)', handleExportCompressed);
    GM_registerMenuCommand('📦 Xuất localStorage', handleExportLocalStorage);
    GM_registerMenuCommand('🍪 Xuất Cookies', handleExportCookies);
    GM_registerMenuCommand('📥 Nhập Storage', handleImport);
    GM_registerMenuCommand('👁️ Xem Storage', handleView);
    GM_registerMenuCommand('🗑️ Xóa Storage', handleClear);

   // ==================== NÚT KÉO THẢ ====================

function createFloatingUI() {
    const style = document.createElement('style');
    style.textContent = `
        #sb-float-btn {
            position: fixed;
            width: 42px;
            height: 42px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 18px;
            cursor: grab;
            z-index: 2147483647;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            touch-action: none;
            user-select: none;
        }
        #sb-float-btn:active { cursor: grabbing; }
        #sb-float-btn.dragging { opacity: 0.7; transform: scale(1.1); }

        #sb-menu {
            position: fixed;
            background: #1e1e2e;
            border-radius: 12px;
            padding: 6px;
            z-index: 2147483646;
            box-shadow: 0 5px 25px rgba(0,0,0,0.4);
            display: none;
            min-width: 180px;
        }
        #sb-menu.show { display: block; }

        #sb-menu button {
            display: block;
            width: 100%;
            padding: 10px 12px;
            margin: 3px 0;
            background: #2d2d3d;
            border: none;
            border-radius: 8px;
            color: white;
            font-size: 13px;
            text-align: left;
            cursor: pointer;
            transition: background 0.15s;
        }
        #sb-menu button:hover { background: #3d3d5d; }
        #sb-menu button:active { background: #4d4d6d; }

        #sb-menu .divider {
            height: 1px;
            background: #3d3d5d;
            margin: 6px 0;
        }
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'sb-float-btn';
    btn.textContent = '💾';
    document.body.appendChild(btn);

    const menu = document.createElement('div');
    menu.id = 'sb-menu';

    const menuItems = [
        { icon: '📤', text: 'Xuất JSON', action: handleExportJSON },
        { icon: '🗜️', text: 'Xuất Nén', action: handleExportCompressed },
        { icon: '📦', text: 'Xuất localStorage', action: handleExportLocalStorage },
        { icon: '🍪', text: 'Xuất Cookies', action: handleExportCookies },
        { divider: true },
        { icon: '📥', text: 'Nhập Storage', action: handleImport },
        { divider: true },
        { icon: '👁️', text: 'Xem Storage', action: handleView },
        { icon: '🗑️', text: 'Xóa Storage', action: handleClear }
    ];

    menuItems.forEach(item => {
        if (item.divider) {
            const div = document.createElement('div');
            div.className = 'divider';
            menu.appendChild(div);
        } else {
            const menuBtn = document.createElement('button');
            menuBtn.textContent = `${item.icon} ${item.text}`;
            menuBtn.onclick = () => {
                menu.classList.remove('show');
                item.action();
            };
            menu.appendChild(menuBtn);
        }
    });

    document.body.appendChild(menu);

    // ===== DRAG & DROP (SỬA CHO ĐIỆN THOẠI) =====
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let totalMoved = 0;
    let startTime = 0;

    const MOVE_THRESHOLD = 10; // Phải di chuyển > 10px mới tính là kéo
    const TAP_TIME = 200; // Nhấn < 200ms tính là tap

    const savedPos = GM_getValue('sb_btn_pos', null);
    if (savedPos) {
        btn.style.left = savedPos.left + 'px';
        btn.style.top = savedPos.top + 'px';
    } else {
        btn.style.right = '15px';
        btn.style.bottom = '80px';
    }

    function onStart(e) {
        isDragging = true;
        totalMoved = 0;
        startTime = Date.now();
        btn.classList.add('dragging');

        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = btn.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        e.preventDefault();
    }

    function onMove(e) {
        if (!isDragging) return;

        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        // Tính tổng quãng đường di chuyển
        totalMoved = Math.sqrt(dx * dx + dy * dy);

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 42));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - 42));

        btn.style.left = newLeft + 'px';
        btn.style.top = newTop + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';

        e.preventDefault();
    }

    function onEnd(e) {
        if (!isDragging) return;

        const elapsed = Date.now() - startTime;
        const wasDragged = totalMoved > MOVE_THRESHOLD;
        const wasTap = elapsed < TAP_TIME && !wasDragged;

        isDragging = false;
        btn.classList.remove('dragging');

        // Lưu vị trí
        const rect = btn.getBoundingClientRect();
        GM_setValue('sb_btn_pos', { left: rect.left, top: rect.top });

        // Nếu là tap (nhấn nhanh, không kéo) → mở menu
        if (wasTap) {
            toggleMenu();
        }
    }

    function toggleMenu() {
        if (menu.classList.contains('show')) {
            menu.classList.remove('show');
            return;
        }

        const rect = btn.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;

        if (left + 180 > window.innerWidth) {
            left = window.innerWidth - 190;
        }
        if (top + 350 > window.innerHeight) {
            top = rect.top - 360;
        }
        if (left < 10) left = 10;
        if (top < 10) top = 10;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.classList.add('show');
    }

    // Mouse events
    btn.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    // Touch events
    btn.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    // Click cho máy tính (backup)
    btn.addEventListener('click', (e) => {
        // Chỉ xử lý nếu không phải touch device
        if (!('ontouchstart' in window)) {
            toggleMenu();
        }
    });

    // Đóng menu khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('show');
        }
    });

    document.addEventListener('touchstart', (e) => {
        if (!btn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('show');

        // ===== SHOW MENU =====
        btn.addEventListener('click', () => {
            if (hasMoved) return; // Không mở menu nếu vừa kéo

            if (menu.classList.contains('show')) {
                menu.classList.remove('show');
                return;
            }

            // Tính vị trí menu
            const rect = btn.getBoundingClientRect();
            let left = rect.left;
            let top = rect.bottom + 8;

            // Nếu menu ra ngoài màn hình
            if (left + 160 > window.innerWidth) {
                left = window.innerWidth - 170;
            }
            if (top + 300 > window.innerHeight) {
                top = rect.top - 310;
            }
            if (left < 10) left = 10;
            if (top < 10) top = 10;

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.classList.add('show');
        });

        // Đóng menu khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });
    }

    // ==================== INIT ====================

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        createFloatingUI();
        console.log('💾 Web Storage Backup & Restore - Sẵn sàng!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
