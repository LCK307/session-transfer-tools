// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      2.6
// @description  Xuất/Nhập localStorage, cookies, sessionStorage, IndexedDB với nén GZIP
// @author       LCK307
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

    // ==================== GZIP COMPRESSION ====================

    async function compressGzip(data) {
        try {
            var encoder = new TextEncoder();
            var inputData = encoder.encode(data);

            var stream = new CompressionStream('gzip');
            var writer = stream.writable.getWriter();
            writer.write(inputData);
            writer.close();

            var compressedData = await new Response(stream.readable).arrayBuffer();
            return new Uint8Array(compressedData);
        } catch (e) {
            console.error('Compression error:', e);
            return null;
        }
    }

    async function decompressGzip(compressedData) {
        try {
            var stream = new DecompressionStream('gzip');
            var writer = stream.writable.getWriter();
            writer.write(compressedData);
            writer.close();

            var decompressedData = await new Response(stream.readable).arrayBuffer();
            var decoder = new TextDecoder();
            return decoder.decode(decompressedData);
        } catch (e) {
            console.error('Decompression error:', e);
            return null;
        }
    }

    function uint8ArrayToBase64(uint8Array) {
        var binary = '';
        for (var i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }

    function base64ToUint8Array(base64) {
        var binary = atob(base64);
        var uint8Array = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            uint8Array[i] = binary.charCodeAt(i);
        }
        return uint8Array;
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

    async function exportCompressedGzip() {
        var jsonData = await exportAll();
        var compressed = await compressGzip(jsonData);
        if (compressed) {
            return compressed;
        }
        return null;
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

            // Nếu là Uint8Array hoặc ArrayBuffer (từ file .gz)
            if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
                var uint8 = input instanceof Uint8Array ? input : new Uint8Array(input);
                var jsonStr = await decompressGzip(uint8);
                if (jsonStr) {
                    data = JSON.parse(jsonStr);
                } else {
                    return { success: false, error: 'Không giải nén được file GZIP' };
                }
            } else if (typeof input === 'string') {
                // Thử parse JSON trực tiếp
                try {
                    data = JSON.parse(input);
                } catch (e) {
                    // Thử giải nén Base64 GZIP
                    try {
                        var uint8 = base64ToUint8Array(input);
                        var jsonStr = await decompressGzip(uint8);
                        if (jsonStr) {
                            data = JSON.parse(jsonStr);
                        } else {
                            return { success: false, error: 'Không giải nén được dữ liệu' };
                        }
                    } catch (e2) {
                        return { success: false, error: 'Định dạng không hợp lệ' };
                    }
                }
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
        var blob;
        if (content instanceof Uint8Array) {
            blob = new Blob([content], { type: type || 'application/gzip' });
        } else {
            blob = new Blob([content], { type: type || 'application/json' });
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function pickAndReadFile(callback, readAs) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.gz,.txt';
        input.onchange = function(e) {
            if (e.target.files.length > 0) {
                var file = e.target.files[0];
                var reader = new FileReader();
                reader.onload = function(event) {
                    callback(event.target.result, file.name);
                };
                reader.onerror = function() {
                    alert('Không đọc được file!');
                };
                if (readAs === 'arraybuffer' || file.name.endsWith('.gz')) {
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.readAsText(file);
                }
            }
        };
        input.click();
    }

    // ==================== ACTION HANDLERS ====================

    // === TẤT CẢ STORAGE ===

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

            var size = (data.length / 1024).toFixed(1);
            alert('Đã tải file: ' + filename + '\nKích thước: ' + size + ' KB');
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleDownloadGzip() {
        try {
            var jsonData = await exportAll();
            var originalSize = jsonData.length;

            var compressed = await compressGzip(jsonData);
            if (!compressed) {
                alert('Trình duyệt không hỗ trợ nén GZIP!\n\nDùng "Tải JSON" thay thế.');
                return;
            }

            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + '.gz';
            downloadFile(compressed, filename, 'application/gzip');

            var compressedSize = compressed.length;
            var ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

            alert('Đã tải file: ' + filename + '\n\nGốc: ' + (originalSize / 1024).toFixed(1) + ' KB\nNén: ' + (compressedSize / 1024).toFixed(1) + ' KB\nGiảm: ' + ratio + '%');
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleImport() {
        var input = prompt('Dán dữ liệu storage (JSON):');
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
        pickAndReadFile(async function(content, filename) {
            var result;
            if (filename.endsWith('.gz')) {
                result = await importFromData(new Uint8Array(content));
            } else {
                result = await importFromData(content);
            }

            if (result.success) {
                if (confirm('Nhập thành công! ' + result.total + ' items\n\nReload trang?')) {
                    location.reload();
                }
            } else {
                alert('Lỗi: ' + result.error);
            }
        });
    }

    // === LOCALSTORAGE ===

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

    async function handleDownloadLocalStorageGzip() {
        try {
            var jsonData = JSON.stringify(exportLocalStorage(), null, 2);
            var compressed = await compressGzip(jsonData);
            if (!compressed) {
                alert('Trình duyệt không hỗ trợ nén GZIP!');
                return;
            }
            var filename = 'localStorage-' + window.location.hostname + '-' + Date.now() + '.gz';
            downloadFile(compressed, filename, 'application/gzip');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
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
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.gz')) {
                    var jsonStr = await decompressGzip(new Uint8Array(content));
                    data = JSON.parse(jsonStr);
                } else {
                    data = JSON.parse(content);
                }
                var count = importLocalStorage(data);
                if (confirm('Đã nhập ' + count + ' keys!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    // === SESSIONSTORAGE ===

    function handleExportSessionStorage() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File" thay vì "Copy".');
        }
        var data = JSON.stringify(exportSessionStorage(), null, 2);
        GM_setClipboard(data);
        alert('Đã copy sessionStorage (' + Object.keys(JSON.parse(data)).length + ' keys)');
    }

    function handleDownloadSessionStorage() {
        var data = JSON.stringify(exportSessionStorage(), null, 2);
        var filename = 'sessionStorage-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename, 'application/json');
        alert('Đã tải file: ' + filename);
    }

    async function handleDownloadSessionStorageGzip() {
        try {
            var jsonData = JSON.stringify(exportSessionStorage(), null, 2);
            var compressed = await compressGzip(jsonData);
            if (!compressed) {
                alert('Trình duyệt không hỗ trợ nén GZIP!');
                return;
            }
            var filename = 'sessionStorage-' + window.location.hostname + '-' + Date.now() + '.gz';
            downloadFile(compressed, filename, 'application/gzip');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleImportSessionStorage() {
        var input = prompt('Dán dữ liệu sessionStorage (JSON):');
        if (!input) return;

        try {
            var data = JSON.parse(input.trim());
            var count = importSessionStorage(data);
            if (confirm('Đã nhập ' + count + ' keys!\n\nReload trang?')) {
                location.reload();
            }
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleImportSessionStorageFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.gz')) {
                    var jsonStr = await decompressGzip(new Uint8Array(content));
                    data = JSON.parse(jsonStr);
                } else {
                    data = JSON.parse(content);
                }
                var count = importSessionStorage(data);
                if (confirm('Đã nhập ' + count + ' keys!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    // === COOKIES ===

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

    async function handleDownloadCookiesGzip() {
        try {
            var jsonData = JSON.stringify(exportCookies(), null, 2);
            var compressed = await compressGzip(jsonData);
            if (!compressed) {
                alert('Trình duyệt không hỗ trợ nén GZIP!');
                return;
            }
            var filename = 'cookies-' + window.location.hostname + '-' + Date.now() + '.gz';
            downloadFile(compressed, filename, 'application/gzip');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
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
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.gz')) {
                    var jsonStr = await decompressGzip(new Uint8Array(content));
                    data = JSON.parse(jsonStr);
                } else {
                    data = JSON.parse(content);
                }
                var count = importCookies(data);
                if (confirm('Đã nhập ' + count + ' cookies!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    // === INDEXEDDB ===

    async function handleExportIndexedDB() {
        if (isMobile()) {
            alert('⚠️ Bạn đang dùng điện thoại!\n\nNên dùng "Tải File" thay vì "Copy".');
        }
        try {
            var data = await exportIndexedDB();
            var jsonStr = JSON.stringify(data, null, 2);
            GM_setClipboard(jsonStr);
            alert('Đã copy IndexedDB (' + Object.keys(data).length + ' databases)');
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleDownloadIndexedDB() {
        try {
            var data = await exportIndexedDB();
            var jsonStr = JSON.stringify(data, null, 2);
            var filename = 'indexedDB-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(jsonStr, filename, 'application/json');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleDownloadIndexedDBGzip() {
        try {
            var data = await exportIndexedDB();
            var jsonStr = JSON.stringify(data, null, 2);
            var compressed = await compressGzip(jsonStr);
            if (!compressed) {
                alert('Trình duyệt không hỗ trợ nén GZIP!');
                return;
            }
            var filename = 'indexedDB-' + window.location.hostname + '-' + Date.now() + '.gz';
            downloadFile(compressed, filename, 'application/gzip');
            alert('Đã tải file: ' + filename);
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    async function handleImportIndexedDB() {
        var input = prompt('Dán dữ liệu IndexedDB (JSON):');
        if (!input) return;

        try {
            var data = JSON.parse(input.trim());
            var count = await importIndexedDB(data);
            if (confirm('Đã nhập ' + count + ' records!\n\nReload trang?')) {
                location.reload();
            }
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }

    function handleImportIndexedDBFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.gz')) {
                    var jsonStr = await decompressGzip(new Uint8Array(content));
                    data = JSON.parse(jsonStr);
                } else {
                    data = JSON.parse(content);
                }
                var count = await importIndexedDB(data);
                if (confirm('Đã nhập ' + count + ' records!\n\nReload trang?')) {
                    location.reload();
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        });
    }

    // === KHÁC ===

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

    GM_registerMenuCommand('💾 Tải JSON', handleDownloadJSON);
    GM_registerMenuCommand('🗜️ Tải GZIP', handleDownloadGzip);
    GM_registerMenuCommand('📂 Nhập File', handleImportFromFile);
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
                min-width: 240px;\
                max-height: 85vh;\
                overflow-y: auto;\
            }\
            #sb-menu.show {\
                display: block;\
            }\
            #sb-menu button {\
                display: block;\
                width: 100%;\
                padding: 10px 12px;\
                margin: 2px 0;\
                background: #2d2d3d;\
                border: none;\
                border-radius: 8px;\
                color: white;\
                font-size: 12px;\
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
                font-size: 10px;\
                padding: 6px 10px 3px;\
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
            { warning: isMobile() ? '📱 Điện thoại - Nên tải file!' : null },

            { title: '📦 TẤT CẢ STORAGE' },
            { text: '💾 Tải JSON', action: handleDownloadJSON },
            { text: '🗜️ Tải GZIP (nén nhỏ)', action: handleDownloadGzip },
            { text: '📤 Copy JSON (⚠️PC)', action: handleExportJSON, warn: true },
            { text: '📂 Nhập từ File (.json/.gz)', action: handleImportFromFile },
            { text: '📥 Nhập từ Paste', action: handleImport },

            { title: '📦 LOCALSTORAGE' },
            { text: '💾 Tải JSON', action: handleDownloadLocalStorage },
            { text: '🗜️ Tải GZIP', action: handleDownloadLocalStorageGzip },
            { text: '📤 Copy (⚠️PC)', action: handleExportLocalStorage, warn: true },
            { text: '📂 Nhập từ File', action: handleImportLocalStorageFromFile },
            { text: '📥 Nhập từ Paste', action: handleImportLocalStorage },

            { title: '📋 SESSIONSTORAGE' },
            { text: '💾 Tải JSON', action: handleDownloadSessionStorage },
            { text: '🗜️ Tải GZIP', action: handleDownloadSessionStorageGzip },
            { text: '📤 Copy (⚠️PC)', action: handleExportSessionStorage, warn: true },
            { text: '📂 Nhập từ File', action: handleImportSessionStorageFromFile },
            { text: '📥 Nhập từ Paste', action: handleImportSessionStorage },

            { title: '🍪 COOKIES' },
            { text: '💾 Tải JSON', action: handleDownloadCookies },
            { text: '🗜️ Tải GZIP', action: handleDownloadCookiesGzip },
            { text: '📤 Copy (⚠️PC)', action: handleExportCookies, warn: true },
            { text: '📂 Nhập từ File', action: handleImportCookiesFromFile },
            { text: '📥 Nhập từ Paste', action: handleImportCookies },

            { title: '🗄️ INDEXEDDB' },
            { text: '💾 Tải JSON', action: handleDownloadIndexedDB },
            { text: '🗜️ Tải GZIP', action: handleDownloadIndexedDBGzip },
            { text: '📤 Copy (⚠️PC)', action: handleExportIndexedDB, warn: true },
            { text: '📂 Nhập từ File', action: handleImportIndexedDBFromFile },
            { text: '📥 Nhập từ Paste', action: handleImportIndexedDB },

            { title: '⚙️ KHÁC' },
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

            if (left + 240 > window.innerWidth) {
                left = window.innerWidth - 250;
            }
            if (left < 10) {
                left = 10;
            }
            if (top + 550 > window.innerHeight) {
                top = rect.top - 560;
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
            console.log('💾 Storage Backup v2.6 Ready');
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
