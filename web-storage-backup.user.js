// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      2.4
// @description  Xuất/Nhập localStorage, cookies, IndexedDB với nút kéo thả
// @author       Your Name
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== DETECT MOBILE ====================

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // ==================== EXPORT FUNCTIONS ====================

    function exportLocalStorage() {
        var data = {};
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    }

    function exportSessionStorage() {
        var data = {};
        for (var i = 0; i < sessionStorage.length; i++) {
            var key = sessionStorage.key(i);
            data[key] = sessionStorage.getItem(key);
        }
        return data;
    }

    function exportCookies() {
        var cookies = {};
        var parts = document.cookie.split(';');
        for (var i = 0; i < parts.length; i++) {
            var cookie = parts[i].trim();
            var eqPos = cookie.indexOf('=');
            if (eqPos > 0) {
                var name = cookie.substring(0, eqPos);
                var value = cookie.substring(eqPos + 1);
                cookies[name] = value;
            }
        }
        return cookies;
    }

    async function exportIndexedDB() {
        if (!indexedDB.databases) return {};

        try {
            var databases = await indexedDB.databases();
            var result = {};

            for (var i = 0; i < databases.length; i++) {
                var dbInfo = databases[i];
                if (!dbInfo.name) continue;

                try {
                    var db = await new Promise(function(resolve, reject) {
                        var request = indexedDB.open(dbInfo.name);
                        request.onsuccess = function() { resolve(request.result); };
                        request.onerror = function() { reject(request.error); };
                    });

                    result[dbInfo.name] = {
                        version: db.version,
                        stores: {}
                    };

                    var storeNames = Array.from(db.objectStoreNames);

                    for (var j = 0; j < storeNames.length; j++) {
                        var storeName = storeNames[j];
                        try {
                            var tx = db.transaction(storeName, 'readonly');
                            var store = tx.objectStore(storeName);
                            var storeData = await new Promise(function(resolve, reject) {
                                var req = store.getAll();
                                req.onsuccess = function() { resolve(req.result); };
                                req.onerror = function() { reject(req.error); };
                            });
                            result[dbInfo.name].stores[storeName] = storeData;
                        } catch (e) {}
                    }

                    db.close();
                } catch (e) {}
            }

            return result;
        } catch (e) {
            return {};
        }
    }

    async function exportAll() {
        var data = {
            _meta: {
                url: window.location.origin,
                hostname: window.location.hostname,
                exportedAt: new Date().toISOString()
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB()
        };

        return JSON.stringify(data, null, 2);
    }

    async function exportCompressed() {
        var data = await exportAll();
        try {
            return btoa(unescape(encodeURIComponent(data)));
        } catch (e) {
            return data;
        }
    }

    // ==================== IMPORT FUNCTIONS ====================

    function importLocalStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        var count = 0;
        for (var key in data) {
            try {
                localStorage.setItem(key, data[key]);
                count++;
            } catch (e) {}
        }
        return count;
    }

    function importSessionStorage(data) {
        if (!data || typeof data !== 'object') return 0;
        var count = 0;
        for (var key in data) {
            try {
                sessionStorage.setItem(key, data[key]);
                count++;
            } catch (e) {}
        }
        return count;
    }

    function importCookies(data) {
        if (!data || typeof data !== 'object') return 0;
        var count = 0;
        for (var name in data) {
            try {
                var expires = new Date();
                expires.setFullYear(expires.getFullYear() + 1);
                document.cookie = name + '=' + data[name] + '; expires=' + expires.toUTCString() + '; path=/';
                count++;
            } catch (e) {}
        }
        return count;
    }

    async function importIndexedDB(data) {
        if (!data || typeof data !== 'object') return 0;
        var count = 0;

        for (var dbName in data) {
            var dbData = data[dbName];
            try {
                await new Promise(function(resolve) {
                    var deleteRequest = indexedDB.deleteDatabase(dbName);
                    deleteRequest.onsuccess = resolve;
                    deleteRequest.onerror = resolve;
                    deleteRequest.onblocked = resolve;
                });

                var db = await new Promise(function(resolve, reject) {
                    var request = indexedDB.open(dbName, dbData.version || 1);

                    request.onupgradeneeded = function(event) {
                        var database = event.target.result;
                        var stores = dbData.stores || {};
                        for (var storeName in stores) {
                            if (!database.objectStoreNames.contains(storeName)) {
                                database.createObjectStore(storeName, { autoIncrement: true });
                            }
                        }
                    };

                    request.onsuccess = function() { resolve(request.result); };
                    request.onerror = function() { reject(request.error); };
                });

                var stores = dbData.stores || {};
                for (var storeName in stores) {
                    if (!db.objectStoreNames.contains(storeName)) continue;

                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);
                    var storeData = stores[storeName];

                    for (var i = 0; i < storeData.length; i++) {
                        try {
                            store.add(storeData[i]);
                            count++;
                        } catch (e) {}
                    }

                    await new Promise(function(resolve) {
                        tx.oncomplete = resolve;
                        tx.onerror = resolve;
                    });
                }

                db.close();
            } catch (e) {}
        }

        return count;
    }

    async function importFromData(input) {
        try {
            var data;

            try {
                var decoded = decodeURIComponent(escape(atob(input)));
                data = JSON.parse(decoded);
            } catch (e) {
                data = JSON.parse(input);
            }

            if (data._meta && data._meta.hostname && data._meta.hostname !== window.location.hostname) {
                if (!window.confirm('Dữ liệu từ: ' + data._meta.hostname + '\nTrang hiện tại: ' + window.location.hostname + '\n\nVẫn tiếp tục?')) {
                    return { success: false, error: 'Người dùng hủy' };
                }
            }

            var results = {
                localStorage: importLocalStorage(data.localStorage),
                sessionStorage: importSessionStorage(data.sessionStorage),
                cookies: importCookies(data.cookies),
                indexedDB: await importIndexedDB(data.indexedDB)
            };

            return {
                success: true,
                results: results,
                total: results.localStorage + results.sessionStorage + results.cookies + results.indexedDB
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ==================== FILE FUNCTIONS ====================

    function downloadFile(content, filename, type) {
        var mimeType = type || 'application/json';
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function pickAndReadFile(callback) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        input.onchange = function(e) {
            if (e.target.files.length > 0) {
                var reader = new FileReader();
                reader.onload = function(event) {
                    callback(event.target.result);
                };
                reader.onerror = function() {
                    alert('Không đọc được file!');
                };
                reader.readAsText(e.target.files[0]);
            }
        };
        input.click();
    }

    // ==================== ACTION HANDLERS ====================

    async function handleExportJSON() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File" thay vì "Copy" để tránh mất dữ liệu.');
        }
        try {
            var data = await exportAll();
            GM_setClipboard(data);

            var parsed = JSON.parse(data);
            var ls = Object.keys(parsed.localStorage || {}).length;
            var ss = Object.keys(parsed.sessionStorage || {}).length;
            var ck = Object.keys(parsed.cookies || {}).length;
            var idb = Object.keys(parsed.indexedDB || {}).length;

            alert('Đã copy!\n\nlocalStorage: ' + ls + '\nsessionStorage: ' + ss + '\ncookies: ' + ck + '\nindexedDB: ' + idb);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleDownloadJSON() {
        try {
            var data = await exportAll();
            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename, 'application/json');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleExportCompressed() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File Nén" thay vì "Copy" để tránh mất dữ liệu.');
        }
        try {
            var data = await exportCompressed();
            GM_setClipboard(data);
            alert('Đã copy dạng nén!\n\nKích thước: ' + (data.length / 1024).toFixed(1) + ' KB');
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleDownloadCompressed() {
        try {
            var data = await exportCompressed();
            var filename = 'storage-compressed-' + window.location.hostname + '-' + Date.now() + '.txt';
            downloadFile(data, filename, 'text/plain');
            alert('Đã tải file nén: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleExportLocalStorage() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File" thay vì "Copy".');
        }
        var data = JSON.stringify(exportLocalStorage(), null, 2);
        GM_setClipboard(data);
        alert('Đã copy localStorage (' + Object.keys(JSON.parse(data)).length + ' keys)');
    }

    function handleDownloadLocalStorage() {
        var data = JSON.stringify(exportLocalStorage(), null, 2);
        var filename = 'localStorage-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename, 'application/json');
        alert('Đã tải file: ' + filename);
    }

    function handleExportCookies() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File" thay vì "Copy".');
        }
        var data = JSON.stringify(exportCookies(), null, 2);
        GM_setClipboard(data);
        alert('Đã copy cookies (' + Object.keys(JSON.parse(data)).length + ')');
    }

    function handleDownloadCookies() {
        var data = JSON.stringify(exportCookies(), null, 2);
        var filename = 'cookies-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename, 'application/json');
        alert('Đã tải file: ' + filename);
    }

    async function handleImport() {
        var input = prompt('Dán dữ liệu storage (JSON hoặc nén):');
        if (!input) return;

        var result = await importFromData(input.trim());

        if (result.success) {
            if (confirm('Nhập thành công! ' + result.total + ' items\n\nReload trang?')) {
                location.reload();
            }
        } else {
            alert('Lỗi: ' + result.error);
        }
    }

    function handleImportFromFile() {
        pickAndReadFile(async function(text) {
            var result = await importFromData(text.trim());
            if (result.success) {
                if (confirm('Nhập thành công! ' + result.total + ' items\n\nReload trang?')) {
                    location.reload();
                }
            } else {
                alert('Lỗi: ' + result.error);
            }
        });
    }

    function handleImportLocalStorage() {
        var input = prompt('Dán dữ liệu localStorage (JSON):');
        if (!input) return;

        try {
            var data = JSON.parse(input.trim());
            var count = importLocalStorage(data);
            if (confirm('Đã nhập ' + count + ' keys!\n\nReload trang?')) {
                location.reload();
            }
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleImportLocalStorageFromFile() {
        pickAndReadFile(function(text) {
            try {
                var data = JSON.parse(text.trim());
                var count = importLocalStorage(data);
                if (confirm('Đã nhập ' + count + ' keys!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    function handleImportCookies() {
        var input = prompt('Dán dữ liệu cookies (JSON):');
        if (!input) return;

        try {
            var data = JSON.parse(input.trim());
            var count = importCookies(data);
            if (confirm('Đã nhập ' + count + ' cookies!\n\nReload trang?')) {
                location.reload();
            }
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleImportCookiesFromFile() {
        pickAndReadFile(function(text) {
            try {
                var data = JSON.parse(text.trim());
                var count = importCookies(data);
                if (confirm('Đã nhập ' + count + ' cookies!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    function handleView() {
        var ls = localStorage.length;
        var ss = sessionStorage.length;
        var ck = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;

        alert('STORAGE: ' + window.location.hostname + '\n\nlocalStorage: ' + ls + '\nsessionStorage: ' + ss + '\ncookies: ' + ck);
    }

    function handleClear() {
        var choice = prompt('Nhập số:\n1 - Xóa localStorage\n2 - Xóa sessionStorage\n3 - Xóa cookies\n4 - Xóa TẤT CẢ\n0 - Hủy');

        if (choice === '1') {
            localStorage.clear();
            alert('Đã xóa localStorage');
        } else if (choice === '2') {
            sessionStorage.clear();
            alert('Đã xóa sessionStorage');
        } else if (choice === '3') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var name = cookies[i].split('=')[0].trim();
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            }
            alert('Đã xóa cookies');
        } else if (choice === '4') {
            if (confirm('Xóa TẤT CẢ storage?')) {
                localStorage.clear();
                sessionStorage.clear();
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var name = cookies[i].split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                }
                alert('Đã xóa tất cả!');
            }
        }
    }

    // ==================== MENU COMMANDS ====================

    GM_registerMenuCommand('📤 Copy JSON (⚠️ PC)', handleExportJSON);
    GM_registerMenuCommand('💾 Tải File JSON', handleDownloadJSON);
    GM_registerMenuCommand('🗜️ Copy Nén (⚠️ PC)', handleExportCompressed);
    GM_registerMenuCommand('💾 Tải File Nén (.txt)', handleDownloadCompressed);
    GM_registerMenuCommand('📦 Copy localStorage (⚠️ PC)', handleExportLocalStorage);
    GM_registerMenuCommand('💾 Tải localStorage', handleDownloadLocalStorage);
    GM_registerMenuCommand('🍪 Copy Cookies (⚠️ PC)', handleExportCookies);
    GM_registerMenuCommand('💾 Tải Cookies', handleDownloadCookies);
    GM_registerMenuCommand('📥 Nhập Storage (Paste)', handleImport);
    GM_registerMenuCommand('📂 Nhập Storage (File)', handleImportFromFile);
    GM_registerMenuCommand('📦 Nhập localStorage (Paste)', handleImportLocalStorage);
    GM_registerMenuCommand('📂 Nhập localStorage (File)', handleImportLocalStorageFromFile);
    GM_registerMenuCommand('🍪 Nhập Cookies (Paste)', handleImportCookies);
    GM_registerMenuCommand('📂 Nhập Cookies (File)', handleImportCookiesFromFile);
    GM_registerMenuCommand('👁️ Xem Storage', handleView);
    GM_registerMenuCommand('🗑️ Xóa Storage', handleClear);

    // ==================== FLOATING UI ====================

    function createFloatingUI() {
        GM_addStyle('\
            #sb-float-btn {\
                position: fixed;\
                width: 44px;\
                height: 44px;\
                background: linear-gradient(135deg, #667eea, #764ba2);\
                border: none;\
                border-radius: 50%;\
                color: white;\
                font-size: 18px;\
                z-index: 2147483647;\
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);\
                display: flex;\
                align-items: center;\
                justify-content: center;\
                touch-action: none;\
                user-select: none;\
                -webkit-user-select: none;\
                cursor: pointer;\
            }\
            #sb-float-btn.dragging {\
                opacity: 0.8;\
                transform: scale(1.1);\
            }\
            #sb-menu {\
                position: fixed;\
                background: #1e1e2e;\
                border-radius: 12px;\
                padding: 6px;\
                z-index: 2147483646;\
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);\
                display: none;\
                min-width: 220px;\
                max-height: 80vh;\
                overflow-y: auto;\
            }\
            #sb-menu.show {\
                display: block;\
            }\
            #sb-menu button {\
                display: block;\
                width: 100%;\
                padding: 12px 14px;\
                margin: 3px 0;\
                background: #2d2d3d;\
                border: none;\
                border-radius: 8px;\
                color: white;\
                font-size: 13px;\
                text-align: left;\
                cursor: pointer;\
            }\
            #sb-menu button:active {\
                background: #4d4d6d;\
            }\
            #sb-menu button.warn {\
                color: #ffaa00;\
            }\
            .sb-menu-divider {\
                height: 1px;\
                background: #3d3d5d;\
                margin: 6px 0;\
            }\
            .sb-menu-title {\
                color: #888;\
                font-size: 11px;\
                padding: 8px 10px 4px;\
                text-transform: uppercase;\
            }\
            .sb-menu-warning {\
                background: #3d2d1d;\
                color: #ffaa00;\
                font-size: 11px;\
                padding: 8px 10px;\
                border-radius: 6px;\
                margin: 6px 0;\
            }\
        ');

        var btn = document.createElement('button');
        btn.id = 'sb-float-btn';
        btn.textContent = '💾';
        document.body.appendChild(btn);

        var menu = document.createElement('div');
        menu.id = 'sb-menu';

        var menuData = [
            { warning: isMobile() ? '📱 Đang dùng điện thoại - Nên tải file!' : null },
            { title: '── XUẤT (TẢI FILE) ──' },
            { text: '💾 Tải JSON (Tất cả)', action: handleDownloadJSON },
            { text: '💾 Tải File Nén (.txt)', action: handleDownloadCompressed },
            { text: '💾 Tải localStorage', action: handleDownloadLocalStorage },
            { text: '💾 Tải Cookies', action: handleDownloadCookies },
            { title: '── XUẤT (COPY - ⚠️ PC) ──' },
            { text: '📤 Copy JSON', action: handleExportJSON, warn: true },
            { text: '🗜️ Copy Nén', action: handleExportCompressed, warn: true },
            { text: '📦 Copy localStorage', action: handleExportLocalStorage, warn: true },
            { text: '🍪 Copy Cookies', action: handleExportCookies, warn: true },
            { title: '── NHẬP (CHỌN FILE) ──' },
            { text: '📂 Nhập Storage (File)', action: handleImportFromFile },
            { text: '📂 Nhập localStorage (File)', action: handleImportLocalStorageFromFile },
            { text: '📂 Nhập Cookies (File)', action: handleImportCookiesFromFile },
            { title: '── NHẬP (PASTE) ──' },
            { text: '📥 Nhập Storage (Paste)', action: handleImport },
            { text: '📦 Nhập localStorage (Paste)', action: handleImportLocalStorage },
            { text: '🍪 Nhập Cookies (Paste)', action: handleImportCookies },
            { title: '── KHÁC ──' },
            { text: '👁️ Xem Storage', action: handleView },
            { text: '🗑️ Xóa Storage', action: handleClear }
        ];

        for (var i = 0; i < menuData.length; i++) {
            var item = menuData[i];
            if (item.warning) {
                var warningDiv = document.createElement('div');
                warningDiv.className = 'sb-menu-warning';
                warningDiv.textContent = item.warning;
                menu.appendChild(warningDiv);
            } else if (item.title) {
                var titleDiv = document.createElement('div');
                titleDiv.className = 'sb-menu-title';
                titleDiv.textContent = item.title;
                menu.appendChild(titleDiv);
            } else if (item.divider) {
                var divider = document.createElement('div');
                divider.className = 'sb-menu-divider';
                menu.appendChild(divider);
            } else {
                var menuBtn = document.createElement('button');
                menuBtn.textContent = item.text;
                if (item.warn) {
                    menuBtn.className = 'warn';
                }
                (function(action) {
                    menuBtn.onclick = function() {
                        menu.classList.remove('show');
                        action();
                    };
                })(item.action);
                menu.appendChild(menuBtn);
            }
        }

        document.body.appendChild(menu);

        // Drag
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;
        var isDragging = false;
        var hasDragged = false;

        var savedPos = GM_getValue('sb_btn_pos', null);
        if (savedPos) {
            btn.style.left = savedPos.left + 'px';
            btn.style.top = savedPos.top + 'px';
        } else {
            btn.style.right = '15px';
            btn.style.bottom = '80px';
        }

        function getPos(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        function dragStart(e) {
            var pos = getPos(e);
            startX = pos.x;
            startY = pos.y;

            var rect = btn.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            isDragging = true;
            hasDragged = false;

            btn.classList.add('dragging');
            e.preventDefault();
        }

        function dragMove(e) {
            if (!isDragging) return;

            var pos = getPos(e);
            var dx = pos.x - startX;
            var dy = pos.y - startY;
            var distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 10) {
                hasDragged = true;
            }

            var newLeft = startLeft + dx;
            var newTop = startTop + dy;

            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 44));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 44));

            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';

            e.preventDefault();
        }

        function dragEnd(e) {
            if (!isDragging) return;

            isDragging = false;
            btn.classList.remove('dragging');

            var rect = btn.getBoundingClientRect();
            GM_setValue('sb_btn_pos', { left: rect.left, top: rect.top });

            if (!hasDragged) {
                toggleMenu();
            }
        }

        function toggleMenu() {
            if (menu.classList.contains('show')) {
                menu.classList.remove('show');
                return;
            }

            var rect = btn.getBoundingClientRect();
            var left = rect.left;
            var top = rect.bottom + 10;

            if (left + 220 > window.innerWidth) {
                left = window.innerWidth - 230;
            }
            if (left < 10) {
                left = 10;
            }
            if (top + 500 > window.innerHeight) {
                top = rect.top - 510;
            }
            if (top < 10) {
                top = 10;
            }

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.classList.add('show');
        }

        btn.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd, { passive: false });

        btn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        document.addEventListener('click', function(e) {
            if (e.target !== btn && !menu.contains(e.target)) {
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

        try {
            createFloatingUI();
            console.log('💾 Storage Backup v2.4 Ready');
        } catch (e) {
            console.error('Storage Backup error:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
