/* =========================================================
   全局备份与恢复
   - 导出：IndexedDB + localStorage + sessionStorage + CacheStorage
   - 两种格式：JSON（文本）/ ZIP（含二进制）
   - 导入：完全覆盖当前数据后还原
   ========================================================= */

function $(id) { return document.getElementById(id); }

// ================= 通用工具 =================

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function timestampName(prefix, ext) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const s =
        d.getFullYear() +
        p(d.getMonth() + 1) +
        p(d.getDate()) +
        '-' +
        p(d.getHours()) +
        p(d.getMinutes()) +
        p(d.getSeconds());
    return `${prefix}-${s}.${ext}`;
}

function openDatabase(name, version) {
    return new Promise((resolve, reject) => {
        const req = version ? indexedDB.open(name, version) : indexedDB.open(name);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        // 需要时才创建；已存在的库不会触发
        req.onupgradeneeded = () => {};
    });
}

async function listDatabases() {
    if (!indexedDB || !indexedDB.databases) return [];
    try {
        const dbs = await indexedDB.databases();
        return dbs.map((d) => ({ name: d.name, version: d.version })).filter((d) => d.name);
    } catch {
        return [];
    }
}

function getAllRecords(store) {
    return new Promise((resolve) => {
        const out = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                out.push({ key: cursor.key, value: cursor.value });
                cursor.continue();
            } else resolve(out);
        };
        req.onerror = () => resolve([]);
    });
}

function txDone(tx) {
    return new Promise((resolve) => {
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
}

/** 判断值是否是二进制（Blob / ArrayBuffer / TypedArray） */
function isBinary(v) {
    return (
        v instanceof Blob ||
        v instanceof ArrayBuffer ||
        ArrayBuffer.isView(v)
    );
}

/** 二进制 → base64（用于 JSON 格式） */
async function binaryToBase64(v) {
    let buf;
    if (v instanceof Blob) {
        buf = await v.arrayBuffer();
    } else if (v instanceof ArrayBuffer) {
        buf = v;
    } else if (ArrayBuffer.isView(v)) {
        buf = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
    } else {
        return null;
    }
    const bytes = new Uint8Array(buf);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}

/** base64 → ArrayBuffer */
function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

// ================= 导出 =================

/**
 * 收集全站数据。
 * opts.binary 为 true 时把二进制转成 base64 内嵌（JSON 格式使用）；
 * 为 false 时二进制放到 media 字段（ZIP 单独存储）。
 */
async function collectAllData(opts = { binary: false }) {
    const data = {
        meta: {
            type: 'full-site-backup',
            version: 1,
            exportedAt: new Date().toISOString(),
            origin: location.origin,
            binary: opts.binary
        },
        indexedDB: {},
        localStorage: {},
        sessionStorage: {},
        cacheStorage: {}
    };

    // ---------- IndexedDB ----------
    const dbs = await listDatabases();
    for (const { name, version } of dbs) {
        let db;
        try {
            db = await openDatabase(name, version);
        } catch {
            continue;
        }
        const storeNames = Array.from(db.objectStoreNames);
        if (storeNames.length === 0) { db.close(); continue; }

        data.indexedDB[name] = {
            version,
            schema: {},
            stores: {}
        };

        // 每个 store 单独一个只读事务：避免 await 期间事务自动提交，
        // 再次 tx.objectStore() 时抛 “The transaction finished.”。
        for (const storeName of storeNames) {
            let records = [];
            let storeSchema = { keyPath: null, autoIncrement: false };
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                storeSchema = {
                    keyPath: store.keyPath === undefined ? null : store.keyPath,
                    autoIncrement: !!store.autoIncrement
                };
                records = await getAllRecords(store);
                await txDone(tx);
            } catch (e) {
                console.warn('读取 store 失败:', name, storeName, e);
                records = [];
            }
            data.indexedDB[name].schema[storeName] = storeSchema;

            const out = [];
            for (const rec of records) {
                if (isBinary(rec.value)) {
                    if (opts.binary) {
                        const b64 = await binaryToBase64(rec.value);
                        out.push({
                            key: rec.key,
                            __binary: true,
                            mime: rec.value instanceof Blob ? rec.value.type : '',
                            data: b64
                        });
                    } else {
                        // 非 binary 模式：跳过二进制，仅记录元信息
                        out.push({
                            key: rec.key,
                            __binarySkipped: true,
                            mime: rec.value instanceof Blob ? rec.value.type : ''
                        });
                    }
                } else {
                    out.push({ key: rec.key, value: rec.value });
                }
            }
            data.indexedDB[name].stores[storeName] = out;
        }
        db.close();
    }

    // ---------- localStorage ----------
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        data.localStorage[k] = localStorage.getItem(k);
    }

    // ---------- sessionStorage ----------
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            data.sessionStorage[k] = sessionStorage.getItem(k);
        }
    } catch {}

    // ---------- CacheStorage ----------
    if (window.caches && caches.keys) {
        try {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
                const cache = await caches.open(cacheName);
                const reqs = await cache.keys();
                const entries = [];
                for (const req of reqs) {
                    const res = await cache.match(req);
                    if (!res) continue;
                    const headers = {};
                    res.headers.forEach((v, k) => { headers[k] = v; });
                    const bodyBuf = await res.arrayBuffer();
                    entries.push({
                        url: req.url,
                        method: req.method,
                        headers,
                        status: res.status,
                        statusText: res.statusText,
                        body: opts.binary
                            ? await binaryToBase64(new Blob([bodyBuf]))
                            : null,
                        bodySkipped: !opts.binary
                    });
                }
                data.cacheStorage[cacheName] = entries;
            }
        } catch (e) {
            console.warn('CacheStorage 导出失败:', e);
        }
    }

    return data;
}

/** 导出为 JSON（二进制转 base64 内嵌，保证完整） */
async function exportJson() {
    const data = await collectAllData({ binary: true });
    const text = JSON.stringify(data);
    downloadBlob(new Blob([text], { type: 'application/json' }), timestampName('Nano', 'json'));
}

/** 导出为 ZIP（结构清晰，二进制单独存放，体积更小） */
async function exportZip() {
    if (!window.JSZip) throw new Error('JSZip 未加载');

    const zip = new JSZip();
    const meta = {
        type: 'full-site-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        origin: location.origin,
        format: 'zip'
    };

    // ---------- IndexedDB ----------
    const idbRoot = zip.folder('indexedDB');
    const dbs = await listDatabases();

    for (const { name, version } of dbs) {
        let db;
        try {
            db = await openDatabase(name, version);
        } catch {
            continue;
        }
        const storeNames = Array.from(db.objectStoreNames);
        if (storeNames.length === 0) { db.close(); continue; }

        const dbFolder = idbRoot.folder(safeName(name));
        dbFolder.file('__meta__.json', JSON.stringify({ version }));

        // schema（keyPath / autoIncrement），导入时按原样重建 store
        const schemaOut = {};

        // 每个 store 单独一个只读事务（避免事务被提前提交）
        for (const storeName of storeNames) {
            let records = [];
            try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                schemaOut[storeName] = {
                    keyPath: store.keyPath === undefined ? null : store.keyPath,
                    autoIncrement: !!store.autoIncrement
                };
                records = await getAllRecords(store);
                await txDone(tx);
            } catch (e) {
                console.warn('读取 store 失败:', name, storeName, e);
                records = [];
            }
            const storeFolder = dbFolder.folder(safeName(storeName));

            const metaRecords = [];
            let binIndex = 0;

            for (const rec of records) {
                const keyInfo = encodeKey(rec.key);
                if (isBinary(rec.value)) {
                    const binName = `bin_${binIndex++}.bin`;
                    const mime = rec.value instanceof Blob ? rec.value.type : '';
                    let blob;
                    if (rec.value instanceof Blob) blob = rec.value;
                    else if (rec.value instanceof ArrayBuffer) blob = new Blob([rec.value]);
                    else if (ArrayBuffer.isView(rec.value)) {
                        blob = new Blob([rec.value.buffer.slice(
                            rec.value.byteOffset,
                            rec.value.byteOffset + rec.value.byteLength
                        )]);
                    }
                    storeFolder.file(binName, blob);
                    metaRecords.push({
                        key: keyInfo,
                        __binaryFile: binName,
                        mime
                    });
                } else {
                    metaRecords.push({ key: keyInfo, value: rec.value });
                }
            }
            storeFolder.file('records.json', JSON.stringify(metaRecords));
        }
        dbFolder.file('__schema__.json', JSON.stringify(schemaOut));
        db.close();
    }

    // ---------- localStorage ----------
    zip.file('localStorage.json', JSON.stringify(collectStorage(localStorage)));

    // ---------- sessionStorage ----------
    zip.file('sessionStorage.json', JSON.stringify(collectStorage(sessionStorage)));

    // ---------- CacheStorage ----------
    const cacheRoot = zip.folder('cacheStorage');
    if (window.caches && caches.keys) {
        try {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
                const cache = await caches.open(cacheName);
                const reqs = await cache.keys();
                const folder = cacheRoot.folder(safeName(cacheName));
                const entries = [];
                let idx = 0;

                for (const req of reqs) {
                    const res = await cache.match(req);
                    if (!res) continue;
                    const headers = {};
                    res.headers.forEach((v, k) => { headers[k] = v; });
                    const bodyBuf = await res.arrayBuffer();
                    const binName = `body_${idx++}.bin`;
                    folder.file(binName, new Blob([bodyBuf]));
                    entries.push({
                        url: req.url,
                        method: req.method,
                        headers,
                        status: res.status,
                        statusText: res.statusText,
                        __binaryFile: binName
                    });
                }
                folder.file('entries.json', JSON.stringify(entries));
            }
        } catch (e) {
            console.warn('CacheStorage ZIP 导出失败:', e);
        }
    }

    zip.file('meta.json', JSON.stringify(meta));

    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    });
    downloadBlob(blob, timestampName('Nano', 'zip'));
}

function collectStorage(storage) {
    const out = {};
    try {
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            out[k] = storage.getItem(k);
        }
    } catch {}
    return out;
}

function safeName(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, '_');
}

/** 把 IDB 的 key 编码成可 JSON 化的对象 */
function encodeKey(key) {
    if (key instanceof Date) return { __type: 'Date', value: key.toISOString() };
    if (key instanceof ArrayBuffer) return { __type: 'ArrayBuffer', value: Array.from(new Uint8Array(key)) };
    if (ArrayBuffer.isView(key)) return { __type: 'TypedArray', value: Array.from(key) };
    if (Array.isArray(key)) return { __type: 'Array', value: key.map(encodeKey) };
    if (key && typeof key === 'object') return { __type: 'Object', value: JSON.parse(JSON.stringify(key)) };
    return { __type: 'Primitive', value: key };
}

function decodeKey(info) {
    if (!info || typeof info !== 'object') return info;
    switch (info.__type) {
        case 'Date': return new Date(info.value);
        case 'ArrayBuffer': return new Uint8Array(info.value).buffer;
        case 'TypedArray': return new Uint8Array(info.value);
        case 'Array': return info.value.map(decodeKey);
        case 'Object': return info.value;
        case 'Primitive': return info.value;
        default: return info;
    }
}

// ================= 导入 =================

/** 清空全站数据 */
async function clearAllData() {
    // localStorage
    try { localStorage.clear(); } catch {}

    // sessionStorage
    try { sessionStorage.clear(); } catch {}

    // IndexedDB：删除所有数据库
    const dbs = await listDatabases();
    for (const { name } of dbs) {
        await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
    }

    // CacheStorage：删除所有缓存
    if (window.caches && caches.keys) {
        try {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
        } catch {}
    }
}

/** 从 JSON 对象还原 */
async function importFromJson(data) {
    if (!data || data.meta?.type !== 'full-site-backup') {
        throw new Error('不是有效的全站备份文件');
    }

    await clearAllData();

    // ---------- IndexedDB ----------
    if (data.indexedDB) {
        for (const dbName of Object.keys(data.indexedDB)) {
            const dbInfo = data.indexedDB[dbName];
            const stores = dbInfo.stores || {};
            const storeNames = Object.keys(stores);
            const schemaIn = dbInfo.schema || {};

            // 依据备份里的 schema 重建；旧备份没有 schema 时按记录推断 keyPath
            const schema = {};
            for (const storeName of storeNames) {
                const sc = schemaIn[storeName];
                if (sc && (sc.keyPath !== undefined || sc.autoIncrement)) {
                    schema[storeName] = {
                        keyPath: sc.keyPath === undefined ? null : sc.keyPath,
                        autoIncrement: !!sc.autoIncrement
                    };
                } else {
                    schema[storeName] = {
                        keyPath: inferKeyPathFromRecords(stores[storeName]),
                        autoIncrement: false
                    };
                }
            }

            const db = await openDatabaseWithSchema(dbName, dbInfo.version, schema);
            if (!db) continue;

            const existingStores = Array.from(db.objectStoreNames);
            const usableStores = storeNames.filter((s) => existingStores.includes(s));
            if (usableStores.length === 0) { db.close(); continue; }

            // 每个 store 一个事务，事务内绝不 await（避免 “The transaction finished.”）
            for (const storeName of usableStores) {
                const records = stores[storeName] || [];
                const outOfLine = !schema[storeName].keyPath;
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    for (const rec of records) {
                        let value;
                        if (rec.__binary) {
                            value = new Blob([base64ToArrayBuffer(rec.data)], { type: rec.mime || '' });
                        } else if (rec.__binarySkipped) {
                            continue;
                        } else {
                            value = rec.value;
                        }
                        try {
                            if (outOfLine) {
                                const key = decodeKey(rec.key);
                                if (key === undefined || key === null) store.put(value);
                                else store.put(value, key);
                            } else {
                                store.put(value);
                            }
                        } catch (e) {
                            console.warn('写入记录失败', dbName, storeName, e);
                        }
                    }
                    await txDone(tx);
                } catch (e) {
                    console.warn('写入 store 失败', dbName, storeName, e);
                }
            }
            db.close();
        }
    }

    // ---------- localStorage ----------
    if (data.localStorage) {
        for (const k of Object.keys(data.localStorage)) {
            try { localStorage.setItem(k, data.localStorage[k]); } catch {}
        }
    }

    // ---------- sessionStorage ----------
    if (data.sessionStorage) {
        for (const k of Object.keys(data.sessionStorage)) {
            try { sessionStorage.setItem(k, data.sessionStorage[k]); } catch {}
        }
    }

    // ---------- CacheStorage ----------
    if (data.cacheStorage && window.caches) {
        for (const cacheName of Object.keys(data.cacheStorage)) {
            try {
                const cache = await caches.open(cacheName);
                const entries = data.cacheStorage[cacheName] || [];
                for (const entry of entries) {
                    if (!entry.body) continue;
                    const body = base64ToArrayBuffer(entry.body);
                    const res = new Response(body, {
                        status: entry.status || 200,
                        statusText: entry.statusText || '',
                        headers: entry.headers || {}
                    });
                    const req = new Request(entry.url, { method: entry.method || 'GET' });
                    await cache.put(req, res);
                }
            } catch (e) {
                console.warn('恢复缓存失败:', cacheName, e);
            }
        }
    }
}

/** 旧备份没有 schema 时：从记录里推断 keyPath（值里与 key 相等的字段） */
function inferKeyPathFromRecords(records) {
    for (const rec of records || []) {
        if (!rec || rec.__binary || rec.__binarySkipped) continue;
        const v = rec.value;
        const k = decodeKey(rec.key);
        if (v && typeof v === 'object' && k !== undefined && k !== null) {
            for (const prop in v) {
                if (v[prop] === k) return prop;
            }
        }
    }
    return null;
}

/** 打开数据库并确保 schema 存在（schema: { storeName: { keyPath, autoIncrement } }） */
function openDatabaseWithSchema(name, version, schema) {
    return new Promise((resolve) => {
        const req = indexedDB.open(name, version || undefined);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            for (const storeName of Object.keys(schema || {})) {
                if (!db.objectStoreNames.contains(storeName)) {
                    const sc = schema[storeName] || {};
                    const opts = {};
                    if (sc.keyPath !== undefined && sc.keyPath !== null) opts.keyPath = sc.keyPath;
                    if (sc.autoIncrement) opts.autoIncrement = true;
                    db.createObjectStore(storeName, opts);
                }
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
}

/** 从 ZIP 还原 */
async function importFromZip(file) {
    if (!window.JSZip) throw new Error('JSZip 未加载');
    const zip = await JSZip.loadAsync(file);

    // ---------- 解析 meta ----------
    const metaFile = zip.file('meta.json');
    if (!metaFile) throw new Error('ZIP 中缺少 meta.json');
    const meta = JSON.parse(await metaFile.async('string'));
    if (meta.type !== 'full-site-backup') throw new Error('不是有效的全站备份文件');

    await clearAllData();

    // ---------- IndexedDB ----------
    const idbFolder = zip.folder('indexedDB');
    if (idbFolder) {
        const dbNames = new Set();
        idbFolder.forEach((path, entry) => {
            if (entry.dir) {
                const seg = path.split('/').filter(Boolean);
                if (seg.length >= 1) dbNames.add(seg[0]);
            }
        });

        for (const dbName of dbNames) {
            const dbFolder = idbFolder.folder(dbName);
            const dbMetaFile = dbFolder.file('__meta__.json');
            let version;
            if (dbMetaFile) {
                try {
                    const m = JSON.parse(await dbMetaFile.async('string'));
                    version = m.version;
                } catch {}
            }
            let schemaIn = {};
            const schemaFile = dbFolder.file('__schema__.json');
            if (schemaFile) {
                try { schemaIn = JSON.parse(await schemaFile.async('string')) || {}; } catch {}
            }

            // 收集 stores
            const storeNames = new Set();
            dbFolder.forEach((path, entry) => {
                if (entry.dir) {
                    const seg = path.split('/').filter(Boolean);
                    if (seg.length >= 1) storeNames.add(seg[0]);
                }
            });
            const storeList = Array.from(storeNames);
            if (storeList.length === 0) continue;

            // 第一步：先把所有记录（含二进制）读进内存，期间不持有事务
            const payload = {}; // storeName -> [{ key, value }]
            for (const storeName of storeList) {
                const storeFolder = dbFolder.folder(storeName);
                const recordsFile = storeFolder.file('records.json');
                if (!recordsFile) continue;

                const records = JSON.parse(await recordsFile.async('string'));
                const arr = [];
                for (const rec of records) {
                    const key = decodeKey(rec.key);
                    let value;
                    if (rec.__binaryFile) {
                        const binFile = storeFolder.file(rec.__binaryFile);
                        if (!binFile) continue;
                        const ab = await binFile.async('arraybuffer');
                        value = new Blob([ab], { type: rec.mime || '' });
                    } else {
                        value = rec.value;
                    }
                    arr.push({ key, value });
                }
                payload[storeName] = arr;
            }

            // 依据 schema（旧备份按记录推断）创建库
            const schema = {};
            for (const s of storeList) {
                const sc = schemaIn[s];
                if (sc && (sc.keyPath !== undefined || sc.autoIncrement)) {
                    schema[s] = {
                        keyPath: sc.keyPath === undefined ? null : sc.keyPath,
                        autoIncrement: !!sc.autoIncrement
                    };
                } else {
                    schema[s] = { keyPath: inferKeyPathFromRecords(payload[s]), autoIncrement: false };
                }
            }

            const db = await openDatabaseWithSchema(dbName, version, schema);
            if (!db) continue;

            const existing = Array.from(db.objectStoreNames);
            const usable = storeList.filter((s) => existing.includes(s) && payload[s]);
            if (usable.length === 0) { db.close(); continue; }

            // 第二步：每个 store 一个事务，事务内绝不 await
            for (const storeName of usable) {
                const outOfLine = !schema[storeName].keyPath;
                try {
                    const tx = db.transaction(storeName, 'readwrite');
                    const store = tx.objectStore(storeName);
                    for (const item of payload[storeName]) {
                        try {
                            if (outOfLine) {
                                if (item.key === undefined || item.key === null) store.put(item.value);
                                else store.put(item.value, item.key);
                            } else {
                                store.put(item.value);
                            }
                        } catch (e) {
                            console.warn('写入失败', dbName, storeName, e);
                        }
                    }
                    await txDone(tx);
                } catch (e) {
                    console.warn('写入 store 失败', dbName, storeName, e);
                }
            }
            db.close();
        }
    }

    // ---------- localStorage ----------
    const lsFile = zip.file('localStorage.json');
    if (lsFile) {
        const obj = JSON.parse(await lsFile.async('string'));
        for (const k of Object.keys(obj)) {
            try { localStorage.setItem(k, obj[k]); } catch {}
        }
    }

    // ---------- sessionStorage ----------
    const ssFile = zip.file('sessionStorage.json');
    if (ssFile) {
        const obj = JSON.parse(await ssFile.async('string'));
        for (const k of Object.keys(obj)) {
            try { sessionStorage.setItem(k, obj[k]); } catch {}
        }
    }

    // ---------- CacheStorage ----------
    const cacheRoot = zip.folder('cacheStorage');
    if (cacheRoot && window.caches) {
        const cacheNames = new Set();
        cacheRoot.forEach((path, entry) => {
            if (entry.dir) {
                const seg = path.split('/').filter(Boolean);
                if (seg.length >= 1) cacheNames.add(seg[0]);
            }
        });

        for (const cacheName of cacheNames) {
            const folder = cacheRoot.folder(cacheName);
            const entriesFile = folder.file('entries.json');
            if (!entriesFile) continue;
            let entries = [];
            try { entries = JSON.parse(await entriesFile.async('string')); } catch {}
            if (!Array.isArray(entries)) continue;

            try {
                const cache = await caches.open(cacheName);
                for (const entry of entries) {
                    if (!entry.__binaryFile) continue;
                    const binFile = folder.file(entry.__binaryFile);
                    if (!binFile) continue;
                    const ab = await binFile.async('arraybuffer');
                    const res = new Response(ab, {
                        status: entry.status || 200,
                        statusText: entry.statusText || '',
                        headers: entry.headers || {}
                    });
                    const req = new Request(entry.url, { method: entry.method || 'GET' });
                    await cache.put(req, res);
                }
            } catch (e) {
                console.warn('恢复缓存失败:', cacheName, e);
            }
        }
    }
}

// ================= 页面交互 =================

function goBack() {
    // 在 iframe 中：关闭全屏遮罩（回到 more 页面）
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'closeFullscreen' }, '*');
            return;
        }
    } catch (e) {}
    window.location.href = 'more.html';
}

function refreshPage(btn) {
    const icon = document.getElementById('refresh-icon');
    if (!icon || icon.classList.contains('spin')) return;
    icon.classList.add('spin');
    setTimeout(() => icon.classList.remove('spin'), 800);
}

// 弹窗
const alertOverlay = $('iosAlert');
const alertTitle = $('alertTitle');
const alertMessage = $('alertMessage');
const alertConfirmBtn = $('alertConfirmBtn');
let currentAction = null;
let pendingFile = null;

function openAlert(actionType, extra = null) {
    currentAction = actionType;
    alertConfirmBtn.classList.remove('danger');

    if (actionType === 'exportJson') {
        alertTitle.textContent = '导出为 JSON';
        alertMessage.textContent = '将打包全站数据（含二进制，base64 内嵌）。文件可能较大，是否继续？';
    } else if (actionType === 'exportZip') {
        alertTitle.textContent = '导出为 ZIP';
        alertMessage.textContent = '将打包全站数据，二进制单独存放，体积更小。是否继续？';
    } else if (actionType === 'importConfirm') {
        alertTitle.textContent = '导入并覆盖';
        alertMessage.textContent = `即将导入「${extra}」。\n警告：当前所有数据将被清空并覆盖，且不可恢复！`;
        alertConfirmBtn.classList.add('danger');
    }

    alertOverlay.classList.add('active');
}

function closeAlert() {
    alertOverlay.classList.remove('active');
    currentAction = null;
}

async function executeAction() {
    const action = currentAction;
    closeAlert();

    try {
        if (action === 'exportJson') {
            await withLoading('btnExportJson', '导出中', exportJson);
        } else if (action === 'exportZip') {
            await withLoading('btnExportZip', '导出中', exportZip);
        } else if (action === 'importConfirm' && pendingFile) {
            await withLoading('btnImport', '导入中', async () => {
                const name = pendingFile.name.toLowerCase();
                if (name.endsWith('.zip')) {
                    await importFromZip(pendingFile);
                } else {
                    const text = await pendingFile.text();
                    const data = JSON.parse(text);
                    await importFromJson(data);
                }
            });
        }
        pendingFile = null;
    } catch (e) {
        pendingFile = null;
        setTimeout(() => alert('操作失败：' + (e.message || e)), 100);
    }
}

async function withLoading(btnId, loadingText, task) {
    const btn = $(btnId);
    if (!btn) return task();
    const status = btn.querySelector('.item-text-status');
    const original = status ? status.textContent : '';
    btn.classList.add('loading');
    if (status) status.textContent = loadingText;
    try {
        await task();
        if (status) status.textContent = '完成';
        setTimeout(() => {
            if (status) status.textContent = original;
            btn.classList.remove('loading');
        }, 1200);
    } catch (e) {
        btn.classList.remove('loading');
        if (status) status.textContent = original;
        throw e;
    }
}

// 文件选择
const fileInput = $('fileInput');

function triggerFileInput() {
    fileInput.accept = '.json,.zip';
    fileInput.click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    pendingFile = file;
    openAlert('importConfirm', file.name);
    event.target.value = '';
}

// ================= 单个角色 导出 / 导入 =================
const CHAR_BACKUP_TYPE = 'nano-single-char-backup';

function charLocalStorageKeys(charId) {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (
                k === 'chat_messages_' + charId ||
                k === 'chat_reply_pending_' + charId ||
                k === 'chat_req_' + charId ||
                k === 'chat_cleared_' + charId ||
                k === 'nano_moment_img_round_' + charId ||
                k === 'voice_call_seconds_' + charId
            ) { out.push(k); continue; }
            if (k.indexOf('chat_setting_') === 0 && k.slice(-(charId.length + 1)) === '_' + charId) out.push(k);
        }
    } catch (e) {}
    return out;
}

function idbReadAll(dbName, storeName) {
    return openDatabase(dbName).then((db) => new Promise((resolve) => {
        try {
            if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve([]); return; }
            const tx = db.transaction(storeName, 'readonly');
            getAllRecords(tx.objectStore(storeName)).then((rows) => { db.close(); resolve(rows || []); });
        } catch (e) { try { db.close(); } catch (e2) {} resolve([]); }
    })).catch(() => []);
}

function idbPutRecord(dbName, storeName, key, value) {
    return openDatabase(dbName).then((db) => new Promise((resolve) => {
        try {
            if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(false); return; }
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            if (store.keyPath) store.put(value); else store.put(value, key);
            txDone(tx).then(() => { db.close(); resolve(true); });
        } catch (e) { try { db.close(); } catch (e2) {} resolve(false); }
    })).catch(() => false);
}

async function listCharactersForBackup() {
    const rows = await idbReadAll('nano_characters_db', 'characters');
    return rows.map((r) => r.value).filter((v) => v && v.id);
}

async function collectCharBackup(charId) {
    const character = (await listCharactersForBackup()).find((c) => c.id === charId) || null;

    const localStorageData = {};
    charLocalStorageKeys(charId).forEach((k) => { try { localStorageData[k] = localStorage.getItem(k); } catch (e) {} });

    const indexedDBData = {};

    const chars = await idbReadAll('nano_characters_db', 'characters');
    const charRow = chars.find((r) => (r.value && r.value.id === charId) || r.key === charId);
    if (charRow) indexedDBData['nano_characters_db'] = { characters: [charRow] };

    const vmem = {};
    const configRows = (await idbReadAll('nano_vector_memory_db', 'config')).filter((r) =>
        ['memlist_' + charId, 'auxchat_' + charId, 'auxmeta_' + charId, 'auxstate_' + charId].indexOf(r.key) !== -1);
    if (configRows.length) vmem.config = configRows;
    const stateRows = (await idbReadAll('nano_vector_memory_db', 'chat_state')).filter((r) =>
        r.key === charId || (r.value && r.value.chatId === charId));
    if (stateRows.length) vmem.chat_state = stateRows;
    const cmRows = (await idbReadAll('nano_vector_memory_db', 'chat_messages')).filter((r) =>
        r.key === charId || (r.value && r.value.chatId === charId));
    if (cmRows.length) vmem.chat_messages = cmRows;
    const memRows = (await idbReadAll('nano_vector_memory_db', 'memories')).filter((r) =>
        r.value && r.value.chatId === charId);
    if (memRows.length) vmem.memories = memRows;
    if (Object.keys(vmem).length) indexedDBData['nano_vector_memory_db'] = vmem;

    const phoneRows = (await idbReadAll('check_phone_db', 'app_data')).filter((r) =>
        typeof r.key === 'string' && (r.key === 'wallpaper_' + charId || r.key.indexOf('icon_' + charId + '_') === 0));
    if (phoneRows.length) indexedDBData['check_phone_db'] = { app_data: phoneRows };

    const vcRows = await idbReadAll('voice_call_' + charId, 'messages');
    if (vcRows.length) indexedDBData['voice_call_' + charId] = { messages: vcRows };

    let mask = null, maskAvatar = null;
    const bindUser = character && character.bindUser;
    if (bindUser) {
        const maskRows = await idbReadAll('nano_mask_db', 'mask_data');
        const maskRec = maskRows.find((r) => r.value && Array.isArray(r.value.masks));
        if (maskRec) mask = maskRec.value.masks.find((m) => m.id === bindUser) || null;
        const avRows = await idbReadAll('MaskAvatarDB', 'avatars');
        const avRow = avRows.find((r) => r.key === bindUser || (r.value && r.value.id === bindUser));
        if (avRow) maskAvatar = avRow.value;
    }

    let worldbookFiles = [];
    const wbRows = await idbReadAll('nano_worldbook_db', 'worldbook_data');
    const wbRec = wbRows.find((r) => r.value && Array.isArray(r.value.files));
    if (wbRec) {
        worldbookFiles = wbRec.value.files.filter((f) =>
            f && Array.isArray(f.boundCharacters) && f.boundCharacters.indexOf(charId) !== -1);
    }

    return {
        meta: { type: CHAR_BACKUP_TYPE, version: 1, charId: charId, name: (character && character.name) || '', exportedAt: new Date().toISOString() },
        character: character,
        localStorage: localStorageData,
        indexedDB: indexedDBData,
        mask: mask,
        maskAvatar: maskAvatar,
        worldbookFiles: worldbookFiles
    };
}

async function exportSelectedChar() {
    const sel = $('charSelect');
    const charId = sel && sel.value;
    if (!charId) { alert('请先选择一个角色'); return; }
    const data = await collectCharBackup(charId);
    const name = (data.meta && data.meta.name) || charId;
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), timestampName('Nano-Char-' + name, 'json'));
}

async function mergeWorldbookFiles(files) {
    if (!files || !files.length) return;
    const rows = await idbReadAll('nano_worldbook_db', 'worldbook_data');
    const rec = rows.find((r) => r.value && Array.isArray(r.value.files));
    const data = rec ? rec.value : { groups: [], files: [] };
    data.groups = Array.isArray(data.groups) ? data.groups : [];
    data.files = Array.isArray(data.files) ? data.files : [];
    files.forEach((f) => {
        if (!f) return;
        const idx = data.files.findIndex((x) => x && x.id === f.id);
        if (idx >= 0) data.files[idx] = f; else data.files.push(f);
    });
    await idbPutRecord('nano_worldbook_db', 'worldbook_data', 'data', data);
    try { localStorage.setItem('nano_worldbook_data_v5', JSON.stringify(data)); } catch (e) {}
}

async function mergeMask(mask, avatar) {
    if (mask) {
        const rows = await idbReadAll('nano_mask_db', 'mask_data');
        const rec = rows.find((r) => r.value && Array.isArray(r.value.masks));
        const data = rec ? rec.value : { masks: [], currentMaskId: mask.id };
        data.masks = Array.isArray(data.masks) ? data.masks : [];
        const idx = data.masks.findIndex((m) => m && m.id === mask.id);
        if (idx >= 0) data.masks[idx] = mask; else data.masks.push(mask);
        if (!data.currentMaskId) data.currentMaskId = mask.id;
        await idbPutRecord('nano_mask_db', 'mask_data', 'data', data);
        try { localStorage.setItem('nano_mask_data', JSON.stringify(data)); } catch (e) {}
    }
    if (avatar && avatar.id) {
        await idbPutRecord('MaskAvatarDB', 'avatars', avatar.id, avatar);
    }
}

async function refreshCharSelect() {
    const sel = $('charSelect');
    if (!sel) return;
    const prev = sel.value;
    const chars = await listCharactersForBackup();
    sel.innerHTML = '';
    chars.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        sel.appendChild(opt);
    });
    if (prev) { try { sel.value = prev; } catch (e) {} }
}

async function importCharBackup(data) {
    if (!data || !data.meta || data.meta.type !== CHAR_BACKUP_TYPE) throw new Error('不是「单个角色」备份文件');
    const ls = data.localStorage || {};
    Object.keys(ls).forEach((k) => { try { localStorage.setItem(k, ls[k]); } catch (e) {} });
    const idb = data.indexedDB || {};
    for (const dbName in idb) {
        for (const storeName in idb[dbName]) {
            const rows = idb[dbName][storeName] || [];
            for (const row of rows) {
                try { await idbPutRecord(dbName, storeName, row.key, row.value); } catch (e) {}
            }
        }
    }
    await mergeWorldbookFiles(data.worldbookFiles);
    await mergeMask(data.mask, data.maskAvatar);
    await refreshCharSelect();
    return data.meta;
}

function triggerCharImport() {
    const inp = $('charFileInput');
    if (inp) inp.click();
}

async function handleCharImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const meta = await importCharBackup(data);
        alert('已导入角色「' + ((meta && meta.name) || (meta && meta.charId) || '') + '」的数据');
    } catch (e) {
        alert('导入失败：' + (e && e.message ? e.message : e));
    }
}

// ================= 初始化 =================
document.addEventListener('DOMContentLoaded', () => {
    refreshCharSelect();
});