// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      3.0
// @description  Xuất/Nhập localStorage, cookies, IndexedDB với giao diện tab
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
                            var data = await new Promise(function(resolve, reject) {
                                var request = store.getAll();
                                request.onsuccess = function() { resolve(request.result); };
                                request.onerror = function() { reject(request.error); };
                            });
                            result[dbInfo.name].stores[storeName] = data;
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

    // ==================== FILE FUNCTIONS ====================

    function downloadFile(content, filename) {
        var blob = new Blob([content], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function readFile(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function() { reject(new Error('Không đọc được file')); };
            reader.readAsText(file);
        });
    }

    // ==================== UI ====================

    var panel = null;
    var overlay = null;
    var currentTab = 'export';

    function createUI() {
        // CSS
        GM_addStyle('\
            #sb-float-btn {\
                position: fixed;\
                width: 46px;\
                height: 46px;\
                background: linear-gradient(135deg, #667eea, #764ba2);\
                border: none;\
                border-radius: 50%;\
                color: white;\
                font-size: 20px;\
                z-index: 2147483647;\
                box-shadow: 0 3px 15px rgba(0,0,0,0.3);\
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
            #sb-overlay {\
                position: fixed;\
                top: 0;\
                left: 0;\
                right: 0;\
                bottom: 0;\
                background: rgba(0,0,0,0.6);\
                z-index: 2147483640;\
                display: none;\
            }\
            #sb-overlay.show {\
                display: block;\
            }\
            #sb-panel {\
                position: fixed;\
                top: 50%;\
                left: 50%;\
                transform: translate(-50%, -50%);\
                width: 340px;\
                max-width: 95vw;\
                max-height: 85vh;\
                background: #1a1a2e;\
                border-radius: 16px;\
                z-index: 2147483645;\
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);\
                display: none;\
                flex-direction: column;\
                overflow: hidden;\
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;\
            }\
            #sb-panel.show {\
                display: flex;\
            }\
            #sb-header {\
                display: flex;\
                justify-content: space-between;\
                align-items: center;\
                padding: 14px 16px;\
                background: linear-gradient(135deg, #667eea, #764ba2);\
                color: white;\
            }\
            #sb-header-title {\
                font-size: 16px;\
                font-weight: 600;\
                margin: 0;\
            }\
            #sb-close {\
                background: rgba(255,255,255,0.2);\
                border: none;\
                color: white;\
                width: 30px;\
                height: 30px;\
                border-radius: 50%;\
                font-size: 18px;\
                cursor: pointer;\
                display: flex;\
                align-items: center;\
                justify-content: center;\
            }\
            #sb-tabs {\
                display: flex;\
                background: #16213e;\
            }\
            .sb-tab {\
                flex: 1;\
                padding: 12px;\
                background: none;\
                border: none;\
                border-bottom: 3px solid transparent;\
                color: #888;\
                font-size: 13px;\
                cursor: pointer;\
                transition: all 0.2s;\
            }\
            .sb-tab.active {\
                color: #667eea;\
                border-bottom-color: #667eea;\
                background: rgba(102, 126, 234, 0.1);\
            }\
            #sb-content {\
                flex: 1;\
                overflow-y: auto;\
                padding: 16px;\
                color: white;\
            }\
            .sb-section {\
                margin-bottom: 16px;\
            }\
            .sb-section-title {\
                font-size: 13px;\
                color: #888;\
                margin-bottom: 10px;\
                display: flex;\
                align-items: center;\
                gap: 6px;\
            }\
            .sb-btn {\
                width: 100%;\
                padding: 12px 16px;\
                margin: 6px 0;\
                background: #2d3a5a;\
                border: none;\
                border-radius: 10px;\
                color: white;\
                font-size: 14px;\
                cursor: pointer;\
                display: flex;\
                align-items: center;\
                gap: 10px;\
                transition: background 0.2s;\
            }\
            .sb-btn:active {\
                background: #3d4a7a;\
            }\
            .sb-btn-primary {\
                background: linear-gradient(135deg, #667eea, #764ba2);\
            }\
            .sb-btn-danger {\
                background: #5a2d3a;\
            }\
            .sb-file-input {\
                display: none;\
            }\
            .sb-info {\
                background: #16213e;\
                padding: 12px;\
                border-radius: 10px;\
                margin-bottom: 12px;\
                font-size: 12px;\
                color: #aaa;\
            }\
            .sb-stats {\
                display: grid;\
                grid-template-columns: repeat(3, 1fr);\
                gap: 8px;\
                margin-bottom: 16px;\
            }\
            .sb-stat {\
                background: #16213e;\
                padding: 10px;\
                border-radius: 10px;\
                text-align: center;\
            }\
            .sb-stat-value {\
                font-size: 18px;\
                font-weight: bold;\
                color: #667eea;\
            }\
            .sb-stat-label {\
                font-size: 10px;\
                color: #888;\
                margin-top: 2px;\
            }\
            .sb-divider {\
                height: 1px;\
                background: #2d3a5a;\
                margin: 16px 0;\
            }\
            .sb-toast {\
                position: fixed;\
                bottom: 100px;\
                left: 50%;\
                transform: translateX(-50%);\
                background: #333;\
                color: white;\
                padding: 12px 24px;\
                border-radius: 10px;\
                z-index: 2147483650;\
                font-size: 14px;\
                display: none;\
            }\
            .sb-toast.show {\
                display: block;\
            }\
            .sb-toast.success {\
                background: #2d5a3a;\
            }\
            .sb-toast.error {\
                background: #5a2d3a;\
            }\
        ');

        // Floating Button
        var btn = document.createElement('button');
        btn.id = 'sb-float-btn';
        btn.textContent = '💾';
        document.body.appendChild(btn);

        // Overlay
        overlay = document.createElement('div');
        overlay.id = 'sb-overlay';
        document.body.appendChild(overlay);

        // Panel
        panel = document.createElement('div');
        panel.id = 'sb-panel';

        // Header
        var header = document.createElement('div');
        header.id = 'sb-header';

        var title = document.createElement('h3');
        title.id = 'sb-header-title';
        title.textContent = '💾 Storage Backup';

        var closeBtn = document.createElement('button');
        closeBtn.id = 'sb-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = hidePanel;

        header.appendChild(title);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Tabs
        var tabs = document.createElement('div');
        tabs.id = 'sb-tabs';

        var tabExport = document.createElement('button');
        tabExport.className = 'sb-tab active';
        tabExport.textContent = '📤 Xuất';
        tabExport.onclick = function() { switchTab('export'); };

        var tabImportSingle = document.createElement('button');
        tabImportSingle.className = 'sb-tab';
        tabImportSingle.textContent = '📥 Nhập Riêng';
        tabImportSingle.onclick = function() { switchTab('import-single'); };

        var tabImportAll = document.createElement('button');
        tabImportAll.className = 'sb-tab';
        tabImportAll.textContent = '📦 Nhập Tất Cả';
        tabImportAll.onclick = function() { switchTab('import-all'); };

        tabs.appendChild(tabExport);
        tabs.appendChild(tabImportSingle);
        tabs.appendChild(tabImportAll);
        panel.appendChild(tabs);

        // Content
        var content = document.createElement('div');
        content.id = 'sb-content';
        panel.appendChild(content);

        document.body.appendChild(panel);

        // Toast
        var toast = document.createElement('div');
        toast.className = 'sb-toast';
        toast.id = 'sb-toast';
        document.body.appendChild(toast);

        // Events
        overlay.onclick = hidePanel;
        setupDrag(btn);

        // Initial render
        renderTab('export');
    }

    function switchTab(tab) {
        currentTab = tab;
        var tabs = document.querySelectorAll('.sb-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.remove('active');
        }
        if (tab === 'export') {
            tabs[0].classList.add('active');
        } else if (tab === 'import-single') {
            tabs[1].classList.add('active');
        } else {
            tabs[2].classList.add('active');
        }
        renderTab(tab);
    }

    function renderTab(tab) {
        var content = document.getElementById('sb-content');
        content.textContent = '';

        if (tab === 'export') {
            renderExportTab(content);
        } else if (tab === 'import-single') {
            renderImportSingleTab(content);
        } else {
            renderImportAllTab(content);
        }
    }

    function renderExportTab(content) {
        // Stats
        var stats = document.createElement('div');
        stats.className = 'sb-stats';

        var lsCount = localStorage.length;
        var ssCount = sessionStorage.length;
        var ckCount = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;

        var statLS = createStat(lsCount, 'localStorage');
        var statSS = createStat(ssCount, 'session');
        var statCK = createStat(ckCount, 'cookies');

        stats.appendChild(statLS);
        stats.appendChild(statSS);
        stats.appendChild(statCK);
        content.appendChild(stats);

        // Info
        var info = document.createElement('div');
        info.className = 'sb-info';
        info.textContent = '📱 Trên điện thoại, nên tải file để tránh mất dữ liệu khi copy.';
        content.appendChild(info);

        // Section: Xuất Tất Cả
        var section1 = createSection('📦 Xuất Tất Cả Storage');

        var btnDownloadAll = createButton('💾 Tải File JSON (Tất Cả)', 'sb-btn-primary', async function() {
            var data = await exportAll();
            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename);
            showToast('Đã tải file!', 'success');
        });
        section1.appendChild(btnDownloadAll);

        var btnCopyAll = createButton('📋 Copy JSON (Tất Cả)', '', async function() {
            var data = await exportAll();
            GM_setClipboard(data);
            showToast('Đã copy!', 'success');
        });
        section1.appendChild(btnCopyAll);

        content.appendChild(section1);

        // Divider
        content.appendChild(createDivider());

        // Section: Xuất Riêng
        var section2 = createSection('📂 Xuất Riêng Từng Loại');

        var btnDownloadLS = createButton('📦 Tải localStorage', '', function() {
            var data = JSON.stringify(exportLocalStorage(), null, 2);
            var filename = 'localStorage-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename);
            showToast('Đã tải file!', 'success');
        });
        section2.appendChild(btnDownloadLS);

        var btnDownloadCK = createButton('🍪 Tải Cookies', '', function() {
            var data = JSON.stringify(exportCookies(), null, 2);
            var filename = 'cookies-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename);
            showToast('Đã tải file!', 'success');
        });
        section2.appendChild(btnDownloadCK);

        var btnDownloadSS = createButton('📋 Tải sessionStorage', '', function() {
            var data = JSON.stringify(exportSessionStorage(), null, 2);
            var filename = 'sessionStorage-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename);
            showToast('Đã tải file!', 'success');
        });
        section2.appendChild(btnDownloadSS);

        content.appendChild(section2);

        // Divider
        content.appendChild(createDivider());

        // Section: Xóa
        var section3 = createSection('🗑️ Xóa Dữ Liệu');

        var btnClear = createButton('🗑️ Xóa Tất Cả Storage', 'sb-btn-danger', function() {
            if (confirm('Xóa TẤT CẢ storage của trang này?')) {
                localStorage.clear();
                sessionStorage.clear();
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var name = cookies[i].split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                }
                showToast('Đã xóa tất cả!', 'success');
                renderTab('export');
            }
        });
        section3.appendChild(btnClear);

        content.appendChild(section3);
    }

    function renderImportSingleTab(content) {
        // Info
        var info = document.createElement('div');
        info.className = 'sb-info';
        info.textContent = '📂 Chọn file JSON đã xuất từ tab "Xuất Riêng Từng Loại" để nhập.';
        content.appendChild(info);

        // Section: localStorage
        var section1 = createSection('📦 Nhập localStorage');

        var fileInputLS = document.createElement('input');
        fileInputLS.type = 'file';
        fileInputLS.accept = '.json,.txt';
        fileInputLS.className = 'sb-file-input';
        fileInputLS.id = 'sb-file-ls';
        fileInputLS.onchange = async function(e) {
            if (e.target.files.length > 0) {
                try {
                    var text = await readFile(e.target.files[0]);
                    var data = JSON.parse(text);
                    var count = importLocalStorage(data);
                    showToast('Đã nhập ' + count + ' keys!', 'success');
                    if (confirm('Reload trang để áp dụng?')) {
                        location.reload();
                    }
                } catch (err) {
                    showToast('Lỗi: ' + err.message, 'error');
                }
            }
        };
        content.appendChild(fileInputLS);

        var btnImportLS = createButton('📂 Chọn File localStorage', 'sb-btn-primary', function() {
            fileInputLS.click();
        });
        section1.appendChild(btnImportLS);

        content.appendChild(section1);

        // Divider
        content.appendChild(createDivider());

        // Section: Cookies
        var section2 = createSection('🍪 Nhập Cookies');

        var fileInputCK = document.createElement('input');
        fileInputCK.type = 'file';
        fileInputCK.accept = '.json,.txt';
        fileInputCK.className = 'sb-file-input';
        fileInputCK.id = 'sb-file-ck';
        fileInputCK.onchange = async function(e) {
            if (e.target.files.length > 0) {
                try {
                    var text = await readFile(e.target.files[0]);
                    var data = JSON.parse(text);
                    var count = importCookies(data);
                    showToast('Đã nhập ' + count + ' cookies!', 'success');
                    if (confirm('Reload trang để áp dụng?')) {
                        location.reload();
                    }
                } catch (err) {
                    showToast('Lỗi: ' + err.message, 'error');
                }
            }
        };
        content.appendChild(fileInputCK);

        var btnImportCK = createButton('📂 Chọn File Cookies', 'sb-btn-primary', function() {
            fileInputCK.click();
        });
        section2.appendChild(btnImportCK);

        content.appendChild(section2);

        // Divider
        content.appendChild(createDivider());

        // Section: sessionStorage
        var section3 = createSection('📋 Nhập sessionStorage');

        var fileInputSS = document.createElement('input');
        fileInputSS.type = 'file';
        fileInputSS.accept = '.json,.txt';
        fileInputSS.className = 'sb-file-input';
        fileInputSS.id = 'sb-file-ss';
        fileInputSS.onchange = async function(e) {
            if (e.target.files.length > 0) {
                try {
                    var text = await readFile(e.target.files[0]);
                    var data = JSON.parse(text);
                    var count = importSessionStorage(data);
                    showToast('Đã nhập ' + count + ' keys!', 'success');
                    if (confirm('Reload trang để áp dụng?')) {
                        location.reload();
                    }
                } catch (err) {
                    showToast('Lỗi: ' + err.message, 'error');
                }
            }
        };
        content.appendChild(fileInputSS);

        var btnImportSS = createButton('📂 Chọn File sessionStorage', 'sb-btn-primary', function() {
            fileInputSS.click();
        });
        section3.appendChild(btnImportSS);

        content.appendChild(section3);
    }

    function renderImportAllTab(content) {
        // Info
        var info = document.createElement('div');
        info.className = 'sb-info';
        info.textContent = '📦 Chọn file JSON đã xuất từ "Tải File JSON (Tất Cả)" để nhập toàn bộ storage.';
        content.appendChild(info);

        // Section: Nhập từ File
        var section1 = createSection('📂 Nhập Từ File');

        var fileInputAll = document.createElement('input');
        fileInputAll.type = 'file';
        fileInputAll.accept = '.json,.txt';
        fileInputAll.className = 'sb-file-input';
        fileInputAll.id = 'sb-file-all';
        fileInputAll.onchange = async function(e) {
            if (e.target.files.length > 0) {
                try {
                    var text = await readFile(e.target.files[0]);
                    var data = JSON.parse(text);

                    if (data._meta && data._meta.hostname && data._meta.hostname !== window.location.hostname) {
                        if (!confirm('Dữ liệu từ: ' + data._meta.hostname + '\nTrang hiện tại: ' + window.location.hostname + '\n\nVẫn tiếp tục?')) {
                            return;
                        }
                    }

                    var results = {
                        localStorage: importLocalStorage(data.localStorage),
                        sessionStorage: importSessionStorage(data.sessionStorage),
                        cookies: importCookies(data.cookies),
                        indexedDB: await importIndexedDB(data.indexedDB)
                    };

                    var total = results.localStorage + results.sessionStorage + results.cookies + results.indexedDB;
                    showToast('Đã nhập ' + total + ' items!', 'success');

                    if (confirm('Reload trang để áp dụng?')) {
                        location.reload();
                    }
                } catch (err) {
                    showToast('Lỗi: ' + err.message, 'error');
                }
            }
        };
        content.appendChild(fileInputAll);

        var btnImportFile = createButton('📂 Chọn File Storage', 'sb-btn-primary', function() {
            fileInputAll.click();
        });
        section1.appendChild(btnImportFile);

        content.appendChild(section1);

        // Divider
        content.appendChild(createDivider());

        // Section: Nhập từ Text (backup)
        var section2 = createSection('📝 Nhập Từ Text (Nếu File Không Hoạt Động)');

        var btnImportText = createButton('📝 Dán Text JSON', '', function() {
            var input = prompt('Dán dữ liệu JSON:');
            if (!input) return;

            try {
                var data = JSON.parse(input.trim());

                if (data._meta && data._meta.hostname && data._meta.hostname !== window.location.hostname) {
                    if (!confirm('Dữ liệu từ: ' + data._meta.hostname + '\nTrang hiện tại: ' + window.location.hostname + '\n\nVẫn tiếp tục?')) {
                        return;
                    }
                }

                var lsCount = importLocalStorage(data.localStorage);
                var ssCount = importSessionStorage(data.sessionStorage);
                var ckCount = importCookies(data.cookies);

                var total = lsCount + ssCount + ckCount;
                showToast('Đã nhập ' + total + ' items!', 'success');

                if (confirm('Reload trang để áp dụng?')) {
                    location.reload();
                }
            } catch (err) {
                showToast('Lỗi: ' + err.message, 'error');
            }
        });
        section2.appendChild(btnImportText);

        content.appendChild(section2);
    }

    // ==================== UI HELPERS ====================

    function createSection(titleText) {
        var section = document.createElement('div');
        section.className = 'sb-section';

        var title = document.createElement('div');
        title.className = 'sb-section-title';
        title.textContent = titleText;
        section.appendChild(title);

        return section;
    }

    function createButton(text, extraClass, onclick) {
        var btn = document.createElement('button');
        btn.className = 'sb-btn' + (extraClass ? ' ' + extraClass : '');
        btn.textContent = text;
        btn.onclick = onclick;
        return btn;
    }

    function createStat(value, label) {
        var stat = document.createElement('div');
        stat.className = 'sb-stat';

        var val = document.createElement('div');
        val.className = 'sb-stat-value';
        val.textContent = value;

        var lbl = document.createElement('div');
        lbl.className = 'sb-stat-label';
        lbl.textContent = label;

        stat.appendChild(val);
        stat.appendChild(lbl);
        return stat;
    }

    function createDivider() {
        var div = document.createElement('div');
        div.className = 'sb-divider';
        return div;
    }

    function showToast(message, type) {
        var toast = document.getElementById('sb-toast');
        toast.textContent = message;
        toast.className = 'sb-toast show ' + (type || '');
        setTimeout(function() {
            toast.classList.remove('show');
        }, 2500);
    }

    function showPanel() {
        panel.classList.add('show');
        overlay.classList.add('show');
        renderTab(currentTab);
    }

    function hidePanel() {
        panel.classList.remove('show');
        overlay.classList.remove('show');
    }

    // ==================== DRAG ====================

    function setupDrag(btn) {
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

            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 46));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - 46));

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
                showPanel();
            }
        }

        btn.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd, { passive: false });

        btn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);
    }

    // ==================== MENU COMMANDS ====================

    GM_registerMenuCommand('💾 Mở Storage Backup', showPanel);

    // ==================== INIT ====================

    function init() {
        if (!document.body) {
            setTimeout(init, 100);
            return;
        }

        try {
            createUI();
            console.log('💾 Storage Backup v3.0 Ready');
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