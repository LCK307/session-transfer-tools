// ==UserScript==
// @name         Web Storage Backup & Restore
// @namespace    https://github.com/LCK307/web-storage-backup
// @version      3.0
// @description  Xuất/Nhập localStorage, cookies, sessionStorage, IndexedDB với mã hóa AES-256-GCM
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

    // ==================== COMPRESSION ====================

    async function compress(data) {
        try {
            if (typeof CompressionStream !== 'undefined') {
                var encoder = new TextEncoder();
                var inputData = encoder.encode(data);
                var stream = new CompressionStream('gzip');
                var writer = stream.writable.getWriter();
                writer.write(inputData);
                writer.close();
                var compressedData = await new Response(stream.readable).arrayBuffer();
                return new Uint8Array(compressedData);
            }
        } catch (e) {
            console.warn('Compression not supported:', e);
        }
        var encoder = new TextEncoder();
        return encoder.encode(data);
    }

    async function decompress(compressedData) {
        try {
            if (typeof DecompressionStream !== 'undefined') {
                var stream = new DecompressionStream('gzip');
                var writer = stream.writable.getWriter();
                writer.write(compressedData);
                writer.close();
                var decompressedData = await new Response(stream.readable).arrayBuffer();
                var decoder = new TextDecoder();
                return decoder.decode(decompressedData);
            }
        } catch (e) {
            console.warn('Decompression failed:', e);
        }
        var decoder = new TextDecoder();
        return decoder.decode(compressedData);
    }

    // ==================== AES-256-GCM ENCRYPTION ====================

    async function deriveKey(password, salt) {
        var encoder = new TextEncoder();
        var passwordBuffer = encoder.encode(password);

        var keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        var key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return key;
    }

    async function encrypt(data, password) {
        try {
            var compressed = await compress(data);
            var salt = crypto.getRandomValues(new Uint8Array(16));
            var iv = crypto.getRandomValues(new Uint8Array(12));
            var key = await deriveKey(password, salt);

            var encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                compressed
            );

            var result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            result.set(salt, 0);
            result.set(iv, salt.length);
            result.set(new Uint8Array(encrypted), salt.length + iv.length);

            return result;
        } catch (e) {
            throw new Error('Mã hóa thất bại: ' + e.message);
        }
    }

    async function decrypt(encryptedData, password) {
        try {
            var salt = encryptedData.slice(0, 16);
            var iv = encryptedData.slice(16, 28);
            var data = encryptedData.slice(28);

            var key = await deriveKey(password, salt);

            var decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            var decompressed = await decompress(new Uint8Array(decrypted));
            return decompressed;
        } catch (e) {
            throw new Error('Sai mật khẩu hoặc dữ liệu bị hỏng');
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
                exportedAt: new Date().toISOString(),
                version: '3.0'
            },
            localStorage: exportLocalStorage(),
            sessionStorage: exportSessionStorage(),
            cookies: exportCookies(),
            indexedDB: await exportIndexedDB()
        };

        return JSON.stringify(data);
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

    async function importFromJSON(jsonStr) {
        try {
            var data = JSON.parse(jsonStr);

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
            blob = new Blob([content], { type: type || 'application/octet-stream' });
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

    function pickAndReadFile(callback) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.enc';
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
                if (file.name.endsWith('.enc')) {
                    reader.readAsArrayBuffer(file);
                } else {
                    reader.readAsText(file);
                }
            }
        };
        input.click();
    }

    function promptPassword(title) {
        return prompt(title + '\n\n⚠️ Nhớ mật khẩu này để giải mã!\nTối thiểu 4 ký tự:');
    }

    // ==================== ACTION HANDLERS ====================

    // Tất cả - Mã hóa
    async function handleDownloadEncrypted() {
        var password = promptPassword('🔐 TẠO MẬT KHẨU');
        if (!password || password.length < 4) {
            alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
            return;
        }

        var confirmPass = prompt('🔐 NHẬP LẠI MẬT KHẨU:');
        if (password !== confirmPass) {
            alert('❌ Mật khẩu không khớp!');
            return;
        }

        try {
            var data = await exportAll();
            var originalSize = data.length;
            var encrypted = await encrypt(data, password);
            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + '.enc';
            downloadFile(encrypted, filename);

            var ratio = ((1 - encrypted.length / originalSize) * 100).toFixed(1);
            alert('✅ Đã tải!\n\n📄 ' + filename + '\n📦 Gốc: ' + (originalSize / 1024).toFixed(1) + ' KB\n🔐 Nén+Mã hóa: ' + (encrypted.length / 1024).toFixed(1) + ' KB\n📉 Giảm: ' + ratio + '%');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    async function handleExportEncryptedBase64() {
        if (isMobile()) {
            alert('⚠️ Điện thoại - Nên dùng "Tải File .enc"!');
        }

        var password = promptPassword('🔐 TẠO MẬT KHẨU');
        if (!password || password.length < 4) {
            alert('❌ Mật khẩu phải có ít nhất 4 ký tự!');
            return;
        }

        var confirmPass = prompt('🔐 NHẬP LẠI MẬT KHẨU:');
        if (password !== confirmPass) {
            alert('❌ Mật khẩu không khớp!');
            return;
        }

        try {
            var data = await exportAll();
            var encrypted = await encrypt(data, password);
            var base64 = uint8ArrayToBase64(encrypted);
            GM_setClipboard(base64);
            alert('✅ Đã copy!\n\n📦 ' + (base64.length / 1024).toFixed(1) + ' KB\n\n⚠️ NHỚ MẬT KHẨU!');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    // Tất cả - Không mã hóa
    async function handleDownloadJSON() {
        try {
            var data = await exportAll();
            var filename = 'storage-' + window.location.hostname + '-' + Date.now() + '.json';
            downloadFile(data, filename, 'application/json');
            alert('✅ Đã tải!\n\n📄 ' + filename + '\n📦 ' + (data.length / 1024).toFixed(1) + ' KB\n\n⚠️ File không mã hóa!');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    async function handleExportJSON() {
        if (isMobile()) {
            alert('⚠️ Điện thoại - Nên dùng "Tải File JSON"!');
        }
        try {
            var data = await exportAll();
            GM_setClipboard(data);

            var parsed = JSON.parse(data);
            var ls = Object.keys(parsed.localStorage || {}).length;
            var ss = Object.keys(parsed.sessionStorage || {}).length;
            var ck = Object.keys(parsed.cookies || {}).length;

            alert('✅ Đã copy!\n\nlocalStorage: ' + ls + '\nsessionStorage: ' + ss + '\ncookies: ' + ck + '\n\n⚠️ Không mã hóa!');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    // Nhập
    async function handleImportJSON() {
        var input = prompt('📥 Dán dữ liệu JSON:');
        if (!input) return;

        var result = await importFromJSON(input.trim());
        if (result.success) {
            if (confirm('✅ Nhập thành công!\n\n📊 ' + result.total + ' items\n\n🔄 Reload trang?')) {
                location.reload();
            }
        } else {
            alert('❌ Lỗi: ' + result.error);
        }
    }

    async function handleImportEncryptedBase64() {
        var input = prompt('📥 Dán dữ liệu mã hóa (Base64):');
        if (!input) return;

        var password = prompt('🔐 NHẬP MẬT KHẨU:');
        if (!password) return;

        try {
            var encrypted = base64ToUint8Array(input.trim());
            var decrypted = await decrypt(encrypted, password);
            var result = await importFromJSON(decrypted);

            if (result.success) {
                if (confirm('✅ Giải mã & nhập thành công!\n\n📊 ' + result.total + ' items\n\n🔄 Reload trang?')) {
                    location.reload();
                }
            } else {
                alert('❌ Lỗi: ' + result.error);
            }
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                if (filename.endsWith('.enc')) {
                    var password = prompt('🔐 NHẬP MẬT KHẨU:');
                    if (!password) return;

                    var decrypted = await decrypt(new Uint8Array(content), password);
                    var result = await importFromJSON(decrypted);

                    if (result.success) {
                        if (confirm('✅ Giải mã & nhập thành công!\n\n📊 ' + result.total + ' items\n\n🔄 Reload trang?')) {
                            location.reload();
                        }
                    } else {
                        alert('❌ Lỗi: ' + result.error);
                    }
                } else {
                    var result = await importFromJSON(content);

                    if (result.success) {
                        if (confirm('✅ Nhập thành công!\n\n📊 ' + result.total + ' items\n\n🔄 Reload trang?')) {
                            location.reload();
                        }
                    } else {
                        alert('❌ Lỗi: ' + result.error);
                    }
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    // localStorage
    function handleDownloadLocalStorage() {
        var data = JSON.stringify(exportLocalStorage(), null, 2);
        var filename = 'localStorage-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename);
        alert('✅ Đã tải: ' + filename);
    }

    async function handleDownloadLocalStorageEnc() {
        var password = promptPassword('🔐 MẬT KHẨU');
        if (!password || password.length < 4) return;

        try {
            var data = JSON.stringify(exportLocalStorage());
            var encrypted = await encrypt(data, password);
            var filename = 'localStorage-' + window.location.hostname + '-' + Date.now() + '.enc';
            downloadFile(encrypted, filename);
            alert('✅ Đã tải: ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportLocalStorageFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.enc')) {
                    var password = prompt('🔐 NHẬP MẬT KHẨU:');
                    if (!password) return;
                    var decrypted = await decrypt(new Uint8Array(content), password);
                    data = JSON.parse(decrypted);
                } else {
                    data = JSON.parse(content);
                }
                var count = importLocalStorage(data);
                if (confirm('✅ Đã nhập ' + count + ' keys!\n\n🔄 Reload?')) {
                    location.reload();
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    // sessionStorage
    function handleDownloadSessionStorage() {
        var data = JSON.stringify(exportSessionStorage(), null, 2);
        var filename = 'sessionStorage-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename);
        alert('✅ Đã tải: ' + filename);
    }

    async function handleDownloadSessionStorageEnc() {
        var password = promptPassword('🔐 MẬT KHẨU');
        if (!password || password.length < 4) return;

        try {
            var data = JSON.stringify(exportSessionStorage());
            var encrypted = await encrypt(data, password);
            var filename = 'sessionStorage-' + window.location.hostname + '-' + Date.now() + '.enc';
            downloadFile(encrypted, filename);
            alert('✅ Đã tải: ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportSessionStorageFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.enc')) {
                    var password = prompt('🔐 NHẬP MẬT KHẨU:');
                    if (!password) return;
                    var decrypted = await decrypt(new Uint8Array(content), password);
                    data = JSON.parse(decrypted);
                } else {
                    data = JSON.parse(content);
                }
                var count = importSessionStorage(data);
                if (confirm('✅ Đã nhập ' + count + ' keys!\n\n🔄 Reload?')) {
                    location.reload();
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    // Cookies
    function handleDownloadCookies() {
        var data = JSON.stringify(exportCookies(), null, 2);
        var filename = 'cookies-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(data, filename);
        alert('✅ Đã tải: ' + filename);
    }

    async function handleDownloadCookiesEnc() {
        var password = promptPassword('🔐 MẬT KHẨU');
        if (!password || password.length < 4) return;

        try {
            var data = JSON.stringify(exportCookies());
            var encrypted = await encrypt(data, password);
            var filename = 'cookies-' + window.location.hostname + '-' + Date.now() + '.enc';
            downloadFile(encrypted, filename);
            alert('✅ Đã tải: ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportCookiesFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.enc')) {
                    var password = prompt('🔐 NHẬP MẬT KHẨU:');
                    if (!password) return;
                    var decrypted = await decrypt(new Uint8Array(content), password);
                    data = JSON.parse(decrypted);
                } else {
                    data = JSON.parse(content);
                }
                var count = importCookies(data);
                if (confirm('✅ Đã nhập ' + count + ' cookies!\n\n🔄 Reload?')) {
                    location.reload();
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    // IndexedDB
    async function handleDownloadIndexedDB() {
        var data = await exportIndexedDB();
        var jsonStr = JSON.stringify(data, null, 2);
        var filename = 'indexedDB-' + window.location.hostname + '-' + Date.now() + '.json';
        downloadFile(jsonStr, filename);
        alert('✅ Đã tải: ' + filename);
    }

    async function handleDownloadIndexedDBEnc() {
        var password = promptPassword('🔐 MẬT KHẨU');
        if (!password || password.length < 4) return;

        try {
            var data = JSON.stringify(await exportIndexedDB());
            var encrypted = await encrypt(data, password);
            var filename = 'indexedDB-' + window.location.hostname + '-' + Date.now() + '.enc';
            downloadFile(encrypted, filename);
            alert('✅ Đã tải: ' + filename);
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    }

    function handleImportIndexedDBFromFile() {
        pickAndReadFile(async function(content, filename) {
            try {
                var data;
                if (filename.endsWith('.enc')) {
                    var password = prompt('🔐 NHẬP MẬT KHẨU:');
                    if (!password) return;
                    var decrypted = await decrypt(new Uint8Array(content), password);
                    data = JSON.parse(decrypted);
                } else {
                    data = JSON.parse(content);
                }
                var count = await importIndexedDB(data);
                if (confirm('✅ Đã nhập ' + count + ' records!\n\n🔄 Reload?')) {
                    location.reload();
                }
            } catch (e) {
                alert('❌ Lỗi: ' + e.message);
            }
        });
    }

    // Khác
    function handleView() {
        var ls = localStorage.length;
        var ss = sessionStorage.length;
        var ck = document.cookie.split(';').filter(function(c) { return c.trim(); }).length;
        alert('📊 ' + window.location.hostname + '\n\n📦 localStorage: ' + ls + '\n📋 sessionStorage: ' + ss + '\n🍪 cookies: ' + ck);
    }

    function handleClear() {
        var choice = prompt('🗑️ XÓA\n\n1 - localStorage\n2 - sessionStorage\n3 - cookies\n4 - TẤT CẢ\n0 - Hủy');

        if (choice === '1') {
            localStorage.clear();
            alert('✅ Đã xóa localStorage');
        } else if (choice === '2') {
            sessionStorage.clear();
            alert('✅ Đã xóa sessionStorage');
        } else if (choice === '3') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var name = cookies[i].split('=')[0].trim();
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            }
            alert('✅ Đã xóa cookies');
        } else if (choice === '4') {
            if (confirm('⚠️ Xóa TẤT CẢ?')) {
                localStorage.clear();
                sessionStorage.clear();
                var cookies = document.cookie.split(';');
                for (var i = 0; i < cookies.length; i++) {
                    var name = cookies[i].split('=')[0].trim();
                    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
                }
                alert('✅ Đã xóa!');
            }
        }
    }

    // ==================== MENU COMMANDS ====================

    GM_registerMenuCommand('🔐 Tải File Mã Hóa (.enc)', handleDownloadEncrypted);
    GM_registerMenuCommand('💾 Tải File JSON', handleDownloadJSON);
    GM_registerMenuCommand('📂 Nhập Từ File', handleImportFromFile);

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
                padding: 8px;\
                z-index: 2147483646;\
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);\
                display: none;\
                min-width: 280px;\
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
            #sb-menu button.secure {\
                color: #44ff88;\
            }\
            .sb-menu-title {\
                color: #888;\
                font-size: 10px;\
                padding: 8px 10px 4px;\
                text-transform: uppercase;\
                font-weight: bold;\
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

        // ========== MENU DATA - VIẾT RÕ TỪNG TÍNH NĂNG ==========
        var menuData = [
            { warning: isMobile() ? '📱 Điện thoại - Nên tải file thay vì copy!' : null },

            // TẤT CẢ - MÃ HÓA
            { title: '🔐 XUẤT TẤT CẢ (CÓ MÃ HÓA AES-256)' },
            { text: '🔐 Tải file .enc - Nén + Mã hóa bằng mật khẩu', action: handleDownloadEncrypted, secure: true },
            { text: '🔐 Copy Base64 mã hóa - Dán được qua chat (⚠️PC)', action: handleExportEncryptedBase64, secure: true },

            // TẤT CẢ - KHÔNG MÃ HÓA
            { title: '💾 XUẤT TẤT CẢ (KHÔNG MÃ HÓA)' },
            { text: '💾 Tải file .json - Đọc được, không cần mật khẩu', action: handleDownloadJSON },
            { text: '📤 Copy JSON - Dán được qua chat (⚠️PC)', action: handleExportJSON, warn: true },

            // NHẬP
            { title: '📥 NHẬP DỮ LIỆU TỪ FILE HOẶC TEXT' },
            { text: '📂 Chọn file để nhập (.json hoặc .enc)', action: handleImportFromFile },
            { text: '📥 Dán JSON từ clipboard', action: handleImportJSON },
            { text: '🔐 Dán Base64 mã hóa từ clipboard', action: handleImportEncryptedBase64 },

            // LOCALSTORAGE
            { title: '📦 LOCALSTORAGE (Dữ liệu lưu vĩnh viễn)' },
            { text: '💾 Tải .json - Không mã hóa', action: handleDownloadLocalStorage },
            { text: '🔐 Tải .enc - Có mã hóa', action: handleDownloadLocalStorageEnc, secure: true },
            { text: '📂 Nhập từ file', action: handleImportLocalStorageFromFile },

            // SESSIONSTORAGE
            { title: '📋 SESSIONSTORAGE (Dữ liệu phiên làm việc)' },
            { text: '💾 Tải .json - Không mã hóa', action: handleDownloadSessionStorage },
            { text: '🔐 Tải .enc - Có mã hóa', action: handleDownloadSessionStorageEnc, secure: true },
            { text: '📂 Nhập từ file', action: handleImportSessionStorageFromFile },

            // COOKIES
            { title: '🍪 COOKIES' },
            { text: '💾 Tải .json - Không mã hóa', action: handleDownloadCookies },
            { text: '🔐 Tải .enc - Có mã hóa', action: handleDownloadCookiesEnc, secure: true },
            { text: '📂 Nhập từ file', action: handleImportCookiesFromFile },

            // INDEXEDDB
            { title: '🗄️ INDEXEDDB (Database lớn)' },
            { text: '💾 Tải .json - Không mã hóa', action: handleDownloadIndexedDB },
            { text: '🔐 Tải .enc - Có mã hóa', action: handleDownloadIndexedDBEnc, secure: true },
            { text: '📂 Nhập từ file', action: handleImportIndexedDBFromFile },

            // TIỆN ÍCH
            { title: '⚙️ TIỆN ÍCH' },
            { text: '👁️ Xem số lượng dữ liệu hiện có', action: handleView },
            { text: '🗑️ Xóa dữ liệu (localStorage/session/cookies)', action: handleClear }
        ];

        // Render menu
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
            } else {
                var menuBtn = document.createElement('button');
                menuBtn.textContent = item.text;
                if (item.warn) {
                    menuBtn.className = 'warn';
                } else if (item.secure) {
                    menuBtn.className = 'secure';
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

        // ========== DRAG ==========
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;
        var isDragging = false, hasDragged = false;

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
            if (Math.sqrt(dx * dx + dy * dy) > 10) hasDragged = true;

            var newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth - 44));
            var newTop = Math.max(0, Math.min(startTop + dy, window.innerHeight - 44));

            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
            e.preventDefault();
        }

        function dragEnd() {
            if (!isDragging) return;
            isDragging = false;
            btn.classList.remove('dragging');
            var rect = btn.getBoundingClientRect();
            GM_setValue('sb_btn_pos', { left: rect.left, top: rect.top });
            if (!hasDragged) toggleMenu();
        }

        function toggleMenu() {
            if (menu.classList.contains('show')) {
                menu.classList.remove('show');
                return;
            }
            var rect = btn.getBoundingClientRect();
            var left = Math.max(10, Math.min(rect.left, window.innerWidth - 290));
            var top = rect.bottom + 10;
            if (top + 600 > window.innerHeight) top = Math.max(10, rect.top - 610);

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
            menu.classList.add('show');
        }

        btn.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
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
