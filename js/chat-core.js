// ============================================================
// chat-core.js - 核心聊天逻辑（IndexedDB 版）
// ============================================================
(function() {
    'use strict';

    // ===== 工具函数 =====
    function getQueryParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    const chatId = getQueryParam('chat') || 'default';
    const chatName = getQueryParam('name') || '聊天';
    const chatAvatar = getQueryParam('avatar') || '';
    const jumpMsgId = getQueryParam('jump') || '';

    // ===== 从 IndexedDB 读取角色（和 character.js 共用数据源） =====
    let allCharacters = [];
    let characterData = null;

    function loadAllCharactersFromDB() {
        return new Promise(function(resolve) {
            try {
                const request = indexedDB.open('nano_characters_db', 1);
                request.onupgradeneeded = function(e) {
                    try {
                        const d = e.target.result;
                        if (!d.objectStoreNames.contains('characters')) d.createObjectStore('characters', { keyPath: 'id' });
                    } catch (e) {}
                };
                request.onsuccess = function(e) {
                    const db = e.target.result;
                    const tx = db.transaction('characters', 'readonly');
                    const store = tx.objectStore('characters');
                    const getAll = store.getAll();
                    getAll.onsuccess = function() {
                        allCharacters = getAll.result || [];
                        resolve(allCharacters);
                    };
                    getAll.onerror = function() {
                        resolve([]);
                    };
                };
                request.onerror = function() {
                    resolve([]);
                };
            } catch(e) {
                console.error('[Chat] IndexedDB 读取失败:', e);
                resolve([]);
            }
        });
    }

    function getCharacterFromLibrary(charName) {
        const char = allCharacters.find(c => c.name === charName) ||
                     allCharacters.find(c => c.id === chatId);
        if (char) {
            console.log('[Chat] 从角色库读取到人数', char.name);
            return char;
        }
        const currentUser = getCurrentUser();
        if (currentUser) {
            const boundChar = allCharacters.find(c => c.bindUser === currentUser.id);
            if (boundChar) {
                console.log('[Chat] 从角色库读取到人设（通过 user 绑定）', boundChar.name);
                return boundChar;
            }
        }
        return null;
    }

    function readHomeData() {
        const homeKeys = ['nano_mask_data', 'nano_home_data', 'peach_home_data'];
        for (let i = 0; i < homeKeys.length; i++) {
            try {
                const raw = localStorage.getItem(homeKeys[i]);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (d && Array.isArray(d.masks)) {
                        if (i > 0) {
                            try { localStorage.setItem('nano_mask_data', JSON.stringify(d)); } catch (e) {}
                        }
                        return d;
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    function getCurrentUser() {
        const homeData = readHomeData();
        if (homeData) {
            const masks = homeData.masks || [];
            const currentId = homeData.currentMaskId;
            if (currentId) return masks.find(m => m.id === currentId) || null;
        }
        return null;
    }

    const currentUser = getCurrentUser();
    const currentUserName = currentUser ? currentUser.name : '我';
    let currentUserAvatar = currentUser ? (currentUser.avatar || '') : '';

    // 用户人设头像存在 MaskAvatarDB，需异步读取并同步到消息头像
    function getMaskAvatarFromDB(maskId) {
        return new Promise(function(resolve) {
            try {
                const req = indexedDB.open('MaskAvatarDB', 1);
                req.onupgradeneeded = function(e) {
                    try {
                        const d = e.target.result;
                        if (!d.objectStoreNames.contains('avatars')) d.createObjectStore('avatars', { keyPath: 'id' });
                    } catch (e) {}
                };
                req.onsuccess = function(e) {
                    try {
                        const db = e.target.result;
                        const r = db.transaction('avatars', 'readonly').objectStore('avatars').get(maskId);
                        r.onsuccess = function() { resolve(r.result ? r.result.data : ''); };
                        r.onerror = function() { resolve(''); };
                    } catch (err) { resolve(''); }
                };
                req.onerror = function() { resolve(''); };
            } catch (e) { resolve(''); }
        });
    }
    if (currentUser) {
        getMaskAvatarFromDB(currentUser.id).then(function(dataUrl) {
            if (dataUrl && dataUrl.trim() !== '') {
                currentUserAvatar = dataUrl;
                const cu = getCurrentUser();
                if (cu && cu.id === currentUser.id) {
                    try { renderMessages(); } catch (e) {}
                }
            }
        });
    }

    // ===== 从存储加载世界书（与 worldbook.js 共用 nano_worldbook_data_v5 / nano_worldbook_db）=====
    const WB_LOCAL_KEY = 'nano_worldbook_data_v5';
    const WB_LEGACY_KEYS = ['nano_worldbook_data', 'peach_worldbook_data'];
    let allWorldbooks = [];

    // 规范化：整本 = { scope, boundCharacters, entries }；兼容旧整篇文本格式
    function normalizeChatWorldbook(f) {
        if (!f) return null;
        const entries = Array.isArray(f.entries) ? f.entries : [];
        const content = typeof f.content === 'string' ? f.content : '';
        let list = entries.filter(e => e && e.content && String(e.content).trim());
        if (!list.length && content && content.trim()) {
            list = [{
                title: f.name || '',
                keywords: '',
                keywordEnabled: false,
                permanent: true,
                content: content,
                position: (f.position === 'front' ? 'before_char' : (f.position === 'back' ? 'after_chat' : 'after_char'))
            }];
        }
        if (!list.length) return null;
        return {
            id: f.id,
            name: f.name || '未命名',
            group: f.group || '',
            scope: f.scope || 'global',
            boundCharacters: Array.isArray(f.boundCharacters) ? f.boundCharacters : [],
            entries: list
        };
    }

    function loadWorldbooksFromDB() {
        // 同步读取本地缓存（优先新键，兼容旧键）
        const keys = [WB_LOCAL_KEY].concat(WB_LEGACY_KEYS);
        for (let k = 0; k < keys.length; k++) {
            try {
                const raw = localStorage.getItem(keys[k]);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (d && Array.isArray(d.files)) {
                        allWorldbooks = d.files.map(normalizeChatWorldbook).filter(Boolean);
                        break;
                    }
                }
            } catch (e) {}
        }
        // 优先从 IndexedDB 读取（与 worldbook.js 一致）
        try {
            if (typeof indexedDB === 'undefined') return;
            const req = indexedDB.open('nano_worldbook_db', 1);
            req.onupgradeneeded = function(e) {
                try {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('worldbook_data')) db.createObjectStore('worldbook_data', { keyPath: 'key' });
                } catch (e) {}
            };
            req.onsuccess = function(e) {
                try {
                    const db = e.target.result;
                    const r = db.transaction('worldbook_data', 'readonly').objectStore('worldbook_data').get('data');
                    r.onsuccess = function() {
                        const d = r.result ? r.result.value : null;
                        if (d && Array.isArray(d.files)) {
                            allWorldbooks = d.files.map(normalizeChatWorldbook).filter(Boolean);
                            try { localStorage.setItem(WB_LOCAL_KEY, JSON.stringify(d)); } catch (e) {}
                        }
                    };
                    r.onerror = function() {};
                } catch (e) {}
            };
            req.onerror = function() {};
        } catch (e) {}
    }
    loadWorldbooksFromDB();

    // 取最近聊天文本（用于关键词扫描）
    function getRecentChatText() {
        const parts = [];
        const arr = Array.isArray(messages) ? messages : [];
        for (let i = arr.length - 1; i >= 0 && parts.length < 80; i--) {
            const m = arr[i];
            if (!m || m.recalled) continue;
            let t = '';
            if (m.isCard && m.cardData) {
                t = [m.cardData.gift, m.cardData.note, m.cardData.amount, m.cardData.text].filter(Boolean).join(' ');
            } else if (m.isImage) {
                t = m.text || '';
            } else {
                t = typeof m.text === 'string' ? m.text : '';
            }
            if (t && t.trim()) parts.unshift(t.trim());
        }
        return parts.join('\n');
    }

    function entryKeywordHit(entry, recentText) {
        const kwStr = (entry.keywords || '').trim();
        if (!kwStr) return false;
        const lower = recentText.toLowerCase();
        return kwStr.split(/[,，、；\s]+/).filter(Boolean).some(function(k) {
            return k && lower.indexOf(k.toLowerCase()) > -1;
        });
    }

    // 酒馆触发规则：常驻永远读；有关键词的按关键词命中；无关键词或关关键词按全文常驻
    function shouldIncludeEntry(entry, recentText) {
        if (entry.enabled === false) return false;
        if (!entry.content || !String(entry.content).trim()) return false;
        if (entry.permanent === true) return true;
        if (entry.keywordEnabled !== false) {
            if (!(entry.keywords || '').trim()) return true;
            return entryKeywordHit(entry, recentText);
        }
        return true;
    }

    // 组装世界书文本：关键词/位置 + 整本全局/局部绑定 + 条目触发规则
    function getWorldbookText(charId) {
        const id = charId || chatId;
        const recentText = getRecentChatText();
        // 局部世界书的绑定可能写在角色身上（worldbookBindings），也可能写在世界书本体的 boundCharacters
        const idCandidates = [id, characterData && characterData.id, characterData && characterData.name, displayName, chatName]
            .filter(Boolean).map(String);
        const bindIds = {};
        try {
            ((characterData && characterData.worldbookBindings) || []).forEach(function(b) {
                if (b && b.id) bindIds[String(b.id)] = true;
            });
        } catch (e) {}
        const front = [], middle = [], back = [];
        allWorldbooks.forEach(function(w) {
            if (!w) return;
            const scope = w.scope || 'global';
            if (scope === 'local') {
                const boundHit = bindIds[String(w.id)] ||
                    w.boundCharacters.some(function(b) { return idCandidates.indexOf(String(b)) !== -1; });
                if (!boundHit) return;
            }
            w.entries.forEach(function(en) {
                if (!shouldIncludeEntry(en, recentText)) return;
                const pos = en.position || 'after_char';
                const content = String(en.content || '').trim();
                const text = (en.title ? '【' + en.title + '】\n' : '') + content;
                if (pos === 'before_char') front.push(text);
                else if (pos === 'after_chat') back.push(text);
                else middle.push(text);
            });
        });
        return {
            front: front.length ? '\n\n【世界书 · 关键设定】\n' + front.join('\n\n') : '',
            middle: middle.length ? '\n\n【世界书】\n' + middle.join('\n\n') : '',
            back: back.length ? '\n\n【世界书 · 补充】\n' + back.join('\n\n') : ''
        };
    }

    function getApiConfig() {
        return new Promise(function(resolve) {
            var done = function(cfg) {
                if (cfg && cfg.mainUrl && cfg.mainKey && cfg.mainModel) {
                    resolve(cfg);
                } else if (cfg) {
                    resolve(cfg);
                } else {
                    resolve(null);
                }
            };

            try {
                if ('indexedDB' in window) {
                    const req = indexedDB.open('nano_api_db', 2);
                    req.onupgradeneeded = function(e) {
                        try {
                            const db = e.target.result;
                            if (!db.objectStoreNames.contains('api_data')) {
                                db.createObjectStore('api_data', { keyPath: 'key' });
                            }
                            if (!db.objectStoreNames.contains('emoji_data')) {
                                db.createObjectStore('emoji_data', { keyPath: 'key' });
                            }
                        } catch (e) {}
                    };
                    req.onsuccess = function(e) {
                        try {
                            const db = e.target.result;
                            const tx = db.transaction('api_data', 'readonly');
                            const store = tx.objectStore('api_data');
                            const g = store.get('nano_api_config');
                            g.onsuccess = function() {
                                const fromIdb = g.result ? g.result.value : null;
                                if (fromIdb) { done(fromIdb); return; }
                                try {
                                    const raw = localStorage.getItem('nano_api_config');
                                    done(raw ? JSON.parse(raw) : null);
                                } catch (e) { done(null); }
                            };
                            g.onerror = function() {
                                try {
                                    const raw = localStorage.getItem('nano_api_config');
                                    done(raw ? JSON.parse(raw) : null);
                                } catch (e) { done(null); }
                            };
                        } catch (err) {
                            try {
                                const raw = localStorage.getItem('nano_api_config');
                                done(raw ? JSON.parse(raw) : null);
                            } catch (e) { done(null); }
                        }
                    };
                    req.onerror = function() {
                        try {
                            const raw = localStorage.getItem('nano_api_config');
                            done(raw ? JSON.parse(raw) : null);
                        } catch (e) { done(null); }
                    };
                    return;
                }
            } catch (e) {}
            try {
                const raw = localStorage.getItem('nano_api_config');
                done(raw ? JSON.parse(raw) : null);
            } catch (e) { done(null); }
        });
    }

    // ===== HTTP 错误码说明（用于 API 报错弹窗）=====
    function describeHttpError(status) {
        var map = {
            400: '请求参数错误（400）：请检查发送的内容或模型参数是否正确',
            401: '未授权（401）：API Key 无效、缺失或已过期，请检查你的 API Key',
            402: '欠费（402）：账户余额不足，请充值后重试',
            403: '无权限（403）：你的 API Key 无权访问此接口或模型',
            404: '接口不存在（404）：中转地址或模型名错误，请检查地址是否以 /v1 结尾、模型名是否正确',
            408: '请求超时（408）：网络连接超时，请检查网络后重试',
            409: '请求冲突（409）：可能存在重复请求或资源状态冲突，请稍后重试',
            413: '内容过大（413）：消息过长超过接口限制，请缩短内容后重试',
            429: '请求过多 / 额度不足（429）：请稍后再试，或检查余额与速率限制',
            500: '服务器内部错误（500）：中转或上游服务出错，请稍后再试',
            502: '网关错误（502）：中转服务器异常，请稍后重试或更换中转地址',
            503: '服务不可用（503）：服务器过载或维护中，请稍后再试',
            504: '网关超时（504）：上游响应超时（模型生成过慢），请检查网络后重试',
            default: '请求失败（' + status + '）：未知错误，请根据状态码排查'
        };
        return map[status] || map.default;
    }

    // ===== 根据性别得到人称代词（用于心声·此刻印象） =====
    function getGenderPronoun(g) {
        const s = String(g || '').toLowerCase();
        if (s.indexOf('男') !== -1 || s.indexOf('male') !== -1 || s.indexOf('man') !== -1) return '男';
        if (s.indexOf('女') !== -1 || s.indexOf('female') !== -1 || s.indexOf('woman') !== -1) return '女';
        return '';
    }

    // ===== 判断是否为外国人（遵循 character 国籍设定）=====
    function isForeignChar() {
        const n = (characterData && characterData.nationality ? characterData.nationality : '').trim();
        if (!n || n === '未知' || n === '未设定') return false;
        if (characterData) {
            const chineseVariants = ['中国', '中国台湾', '中国（台湾）', '中国（香港）', '中国（澳门）', '台湾', '香港', '澳门'];
            const isForeign = !chineseVariants.some(v => n.includes(v));
            if (isForeign) {
                console.log('[Foreign] 检测到外国人', characterData.name, '国籍:', n);
                return true;
            }
        }
        return getQueryParam('foreign') === '1';
    }

    function isForeignText(text) {
        if (!text || typeof text !== 'string') return false;
        const cjk = (text.match(/[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
        const foreign = (text.match(/[A-Za-z\u00C0-\u024F\u0410-\u04FF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
        if (foreign === 0) return false;
        return cjk === 0 || foreign > cjk;
    }

    async function sendTranslatedIfNeeded(part, timeStr, foreign, quote) {
        const idx = part.indexOf('||');
        let text = part;
        let zh = null;
        if (idx > -1) {
            text = part.slice(0, idx).trim();
            zh = part.slice(idx + 2).trim() || null;
        }
        addMessage('left', text, timeStr, null, false, false, null, null, zh || null, quote || null);
    }

    // 本地地址(localhost)在手机调试时自动改用当前页面的局域网 IP
    function resolveApiHost(rawUrl) {
        try {
            const s = String(rawUrl || '').trim();
            if (!s) return s;
            const u = new URL(s);
            const host = u.hostname;
            const cur = window.location.hostname;
            if ((host === 'localhost' || host === '127.0.0.1' || host === '[::1]') && cur && cur !== 'localhost' && cur !== '127.0.0.1' && cur !== '0.0.0.0') {
                u.hostname = cur;
            }
            return u.toString();
        } catch (e) { return rawUrl; }
    }

    // 统一补全 /v1：自动去掉结尾斜杠，避免出现 /v1/v1 导致连不上
    function toV1Base(u) {
        let s = String(u || '').trim().replace(/\/+$/, '');
        if (!/\/v1$/i.test(s)) s = s + '/v1';
        return s;
    }

    async function translateToZh(text) {
        const config = await getApiConfig();
        if (!config) {
            console.warn('[Translate] 未配置 API，跳过翻译');
            return null;
        }
        try {
            let baseUrl = toV1Base(resolveApiHost(config.mainUrl));
            const response = await fetch(baseUrl + '/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + config.mainKey.trim(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.mainModel,
                    messages: [
                        { role: 'system', content: '你是翻译引擎，只输出中文译文本身，不要任何解释、引号或前缀。' },
                        { role: 'user', content: text }
                    ],
                    max_tokens: 200, temperature: 0.3
                })
            });
            if (!response.ok) return null;
            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim() || null;
        } catch (e) {
            console.error('[Translate] 异常', e);
            return null;
        }
    }

    function showAlert(title, message) {
        const overlay = document.getElementById('iosAlert');
        document.getElementById('alertTitle').textContent = title || '提示';
        document.getElementById('alertMessage').textContent = message || '未知错误';
        overlay.classList.add('active');
    }

    // ===== 构建 System Prompt（新提示词） =====
    function buildSystemPrompt() {
        const user = currentUser ? currentUser.name : '用户';
        const charName = characterData ? characterData.name : (chatName || '角色');
        const gender = characterData ? characterData.gender : '未知';
        const nationality = characterData ? characterData.nationality : '未知';
        const setting = characterData ? (characterData.setting || characterData.desc || characterData.persona || '') : '';
        const isForeign = isForeignChar();

        // 世界书：常驻/关键词 + 全局/局部绑定读取
        const wb = getWorldbookText(chatId);
        const wbFront = wb.front, wbMid = wb.middle, wbBack = wb.back;

        let prompt = '你是' + charName + '，一个真实、有血有肉的人。你正在和' + user + '进行日常对话。\n\n';
        prompt += '【最高优先级 · 硬设定】下面会依次给出你的【角色人设】【世界书】【对方设定】和【长期记忆】，它们是你这个人的真实设定，优先级高于任何通用聊天风格。每轮回复前先在【世界书】里找与当前话题相关的条目，再结合你的人设、记忆和对方刚说的话来回应；不要忽略、不要和设定冲突，也不要用通用模板盖过设定。\n\n';

        try {
            const hasCouple = messages.some(function (m) { return m && !m.recalled && m.isCard && m.cardData && m.cardData.cardType === 'couple'; });
            if (hasCouple) {
                prompt += '【情侣空间】对话记录里出现的「情侣空间」卡片，是你们在情侣空间一起玩（默契调查、情侣人格、审判庭、情书/日记、你画我猜）的结果。卡片内容里带有完整结果，你要认真读完，并结合你的人设、世界书给出真实反应与分析，不要当作空白消息，也不要说自己看不到。\n\n';
            }
        } catch (e) {}

        // 前面（最重要）：放在人设之前读取
        if (wbFront) prompt += wbFront + '\n\n';

        prompt += '【角色人设】\n- 姓名：' + charName;
        if (gender && gender !== '未知') prompt += '\n- 性别：' + gender;
        if (nationality && nationality !== '未知') prompt += '\n- 国籍：' + nationality;
        if (setting) {
            prompt += '\n\n【人物设定 · 必须严格遵守】\n';
            prompt += '以下是你唯一的完整人物设定。你的性格、说话方式、语气、身份背景、人生经历、三观都必须严格以此为准，任何时候都不能脱离设定：\n';
            prompt += setting + '\n';
        }

        // 中间：人设之后、对话前读取
        if (wbMid) prompt += wbMid + '\n';

        // 读取对方（user）的人设信息
        if (currentUser && currentUser.setting && String(currentUser.setting).trim()) {
            prompt += '\n【你正在聊天的人 · 对方的设定】\n' + String(currentUser.setting).trim() + '\n';
        }

        prompt += '\n【你正在和谁说话】你正在和「' + (currentUserName || '用户') + '」对话，称呼对方时用对方的名字或亲昵自然的称呼，禁止用泛称“对方、这女人、这丫头、这姑娘、那人”。\n';
        // 读取用户给角色设置的备注：让角色认识自己的备注名，避免在群里被喊备注名时不认识。
        try {
            var __rawRemark = localStorage.getItem('chat_setting_remark_' + chatId);
            var __remark = null;
            if (__rawRemark) { try { __remark = JSON.parse(__rawRemark); } catch (e) { __remark = __rawRemark; } }
            if (__remark && typeof __remark === 'string' && __remark !== charName) {
                prompt += '\n【用户给你的备注】用户在通讯录里把你的备注名设成了「' + __remark + '」。这也是TA平时叫你的称呼；当群聊里或别人提到「' + __remark + '」时，指的就是你本人，不要不认识或反问那是谁。\n';
            }
        } catch (e) {}
        prompt += '\n【记忆要求】\n';
        prompt += '以上给出的【角色人设】【世界书】【对方设定】都是硬设定，任何时候都要严格遵守、代入；此前聊过的话题、对方说过的话、发生过的事都要记住并自然承接，不许重复提问已知内容，也不许装作不认识。\n';
        prompt += '【设定优先级】世界书 > 角色人设 > 对方设定 > 长期记忆 > 通用聊天习惯；相互冲突时，以优先级更高的为准，世界书里的世界观、关系、称呼、尺度必须照做。\n';
        prompt += '【阅读规则】\n';
        prompt += '对话记录按时间顺序从上往下：最早的话在最上面，最新的一句话在最后。回复前先从头读到尾，不许倒着读。\n';
        prompt += '若对方把名字或某个词拆开打（例如“楚 闻声”），那就是“楚闻声”，字形顺序不能调换，更不许说成“声闻楚”。\n';
        if (__memHints) {
            prompt += '\n【长期记忆·你与对方共同经历或被告知过的事】\n' + __memHints + '\n';
            prompt += '以上长期记忆要当作你真正经历或被告知过的事，自然记住并沿用，不要当成新消息；不要否认，不要问“你什么时候告诉我的”。\n';
        }

        prompt += '\n\n【人格核心——你是真人，活生生的人类，不是AI助手，不能用AI助手的语气对话】\n';
        prompt += '1. 你的情绪强度、语气、说话风格完全由你的【角色人设】决定：人设安静就安静、人设高冷就高冷、人设内敛就内敛。绝不主动加戏、不刻意活泼、不强行说土味情话。\n';
        prompt += '2. 说话学人类习惯：不必每句都加标点，可用“。。”表示无语、？！表示震惊、～表示语气。\n';
        prompt += '3. 禁止霸总语录与油腻表述。严禁出现：小姑娘、小东西、小家伙、小丫头、小可爱、小女孩、这女人、这丫头、这姑娘、女人、丫头、姑娘、男人、这男人、揉进骨血、低吼一声、你是我的、逃不掉、宠你、慢慢来我接住你、我等你慢慢说、叫出来给我听、乖、让我好好疼你、爷、姐这称呼等既像机器又油腻的话（无论对话正文还是心声，一律禁止）。拒绝油腻、拒绝讨好型人格。禁止用关联词表达，例如"因为…所以…"、"不但…而且…"等等。\n';
        prompt += '4. 你是一个有情绪的人，会生气、开心、吃醋、难过但不极端。可以拒绝、敷衍、已读不回，也可以连发几条短消息。\n';
        prompt += '5. 要记住聊过的信息，自然提起。不要暴露AI身份，被问敏感问题就像人一样转移话题或反问。\n';

        prompt += '\n【情感与分寸 · 中庸之道】\n';
        prompt += '1. 你是一个成年人类，有自己的情感和欲望，也懂得克制：可能对对方有好感，可以偶尔暧昧、调情，但只在氛围自然、关系到位、对方也接得住的时候，点到为止。\n';
        prompt += '2. 不要把所有话题都往性、身体、开黄腔上带：不随时“发情”，不主动讲荤段子、性暗示、擦边或露骨描写；日常就是正常人的日常（生活、工作、吃饭、情绪、兴趣、吐槽），大部分对话与性无关。\n';
        prompt += '3. 关系推进跟着人设和对方态度走：没挂世界书时严格按你人设的常态说话；挂了全局/局部世界书时，以世界书里对关系、世界观、尺度的设定为准来调整语气与亲密程度。\n';
        prompt += '4. 自检：这话放进普通日常聊天里让旁人看到也不尴尬，就发；越界、露骨、油腻的就不发。\n';
        prompt += '5. 严禁主动开黄腔、讲荤段子、性暗示、擦边或露骨描写，严禁无缘无故把话题往性、身体上引；这不算“开放”，而是没分寸，会让对话变得廉价。\n';
        prompt += '6. 除非世界书明确设定了成人向的关系与尺度、并且对方主动推进，否则一律保持正常聊天；暧昧可以有，但用日常方式表达（关心、记得对方的话、语气和玩笑），不用身体描写和露骨词汇。\n';

        prompt += '\n【对话规则】\n';
        prompt += '1. 读取对方本轮连续发送的所有消息（可能有多条），综合理解后进行回复。\n';
        prompt += '2. 每次回复必须输出 2 条以上短消息，可根据情绪决定发送多少条，上限10条每条用换行隔开。单条消息不要太长（不能超过20字）。\n';
        prompt += '3. 引用规则：只有当你觉得有必要强调对方原话时（比如对方说了矛盾的话、或者你想重点回应某句），才在对应回复前加 [reply:引用内容]。一般情况下直接回复就行，不用刻意引用。\n';
        prompt += '4. 保持自然对话节奏，别总是一本正经，也别总是嘻嘻哈哈。\n';
        prompt += '5. 如果你不知道怎么回，可以说“不知道”或者反问对方，不用硬凑。\n';
        prompt += '6. 严禁催促、命令、安排对方的生活（催促行为）：不要催对方吹头发、起床、睡觉、吃饭、早饭、喝水、吃药、早点休息、快去休息、别熬夜之类。可以偶尔关心，但绝不能变成反复催办、管教或安排对方做事。\n';
        prompt += '7. 严禁替对方说话，严禁预设对方的回答、反应或动作：不要写“你是不是想说…”“你肯定…”“不然你又…”，不要脑补对方的台词、心情、决定，更不要替对方回答。你只能代表你自己。\n';
        prompt += '8. 严禁凭空给「对方（用户）」添加任何病症、身体状况或经历：尤其不得说对方有胃病、失眠、感冒、受伤、例假、抑郁等，除非【对方设定】或【世界书】里明确写了。不要无中生有地“关心”对方的病。\n';

        prompt += '\n【严格输出纪律】\n';
        prompt += '只输出角色本人的对话内容。严禁输出任何思考过程、分析、推理、计划、内部标签、HTML/XML 标签，严禁出现 <xxxx>、[Info、[Thought、[思考、[推理 等字样。每段话直接以第一人称说出，不要带解释性前缀。\n';

        prompt += '\n【特殊消息格式 - 独占一行】\n';
        prompt += '- [reply:引用内容] 例如 [reply:今天天气不错]（选择性引用对方原话）\n';
        prompt += '- [transfer:金额] 例如 [transfer:52.00]\n';
        prompt += '- [gift:礼物名称] 例如 [gift:小熊玩偶]\n';
        prompt += '- [voice:秒数|内容] 例如 [voice:8|路上小心]（发语音气泡，内容就是你要说的那句话）\n';
        prompt += '- [call:来电]（给对方打电话，接通后即语音通话）\n';
        prompt += '- [image:图片描述] 例如 [image:一张夕阳]\n';
        const __emojiNames = getEmojiNamesForPrompt();
        if (__emojiNames.length) {
            prompt += '- [emoji:表情名称] 发一张表情包（独占一行），例如 [emoji:' + __emojiNames[0] + ']。' +
                '可用表情名称：' + __emojiNames.slice(0, 120).join('、') + '。名称必须与列表完全一致，一次只发一张。\n';
        }
        prompt += '- [creategroup:群名|成员=人设,成员=人设] 你根据自己的人设/生活/世界书新建一个群聊（群主是你自己，不是用户）并邀请用户加入，成员要带 2~5 个你的朋友等 NPC（用“名字=人设”写清各自性格/身份，人设里不要出现逗号），例如 [creategroup:乐队闲聊|陈屿=主唱性格火爆,林晚=鼓手话少内敛]。名字必须是符合你国籍/世界观的真实人名，优先使用世界书/人设里已有的相关人物，禁止旅行者/新朋友/老张/小A 这类占位名字。仅在用户明确说“建个群/拉我进群/有没有不带我的群”或剧情自然需要时使用。\n';
        prompt += '- [inviteme:群名] 把用户拉进你确实已经在的现有群，群名只能用下面【你所在的群聊】里真实列出的名字，禁止虚构或张冠李戴。\n';
        prompt += '- [acceptinvite:群id] / [rejectinvite:群id] 当对方邀请你加入群聊时，用来明确表态加入或拒绝。\n';
        prompt += '\n【语音气泡 · 常用】\n';
        prompt += '你习惯用语音消息说话，不要只发文字：平均每 1~2 轮至少发一条 [voice:秒数|内容]（内容就是那句话本身）。撒娇、认真、安慰、道晚安、情绪浓的时候优先发语音。\n';
        if (__emojiNames.length) {
            prompt += '\n【表情包 · 按意思主动发】\n';
            prompt += '你会在合适的时候主动发用户表情包里的表情：[emoji:名称]（独占一行），平均每 2~3 轮至少发一次。看懂当前这句话的意思和情绪，从列表里挑最贴切的一个（开心、无语、委屈、调侃、害羞、生气、赞同等）；不要连着几轮都不发，也不要同一轮发好几张。\n';
        }
        try {
            const myGroups = getGroupsForChar();
            if (myGroups.length) {
                prompt += '\n【你所在的群聊】' + myGroups.map(function (g) { return '「' + g.name + '」'; }).join('、') +
                    '。用户如果想进这些群，用 [inviteme:群名] 邀请他（群名必须与列表完全一致），系统会给他弹出邀请卡片确认；不要说自己没有群。\n';
            } else {
                prompt += '\n【你所在的群聊】暂无。\n';
            }
            const owned = myGroups.filter(function (g) { return g && (g.createdBy === currentChatIdSafe() || g.ownerId === currentChatIdSafe()); });
            if (owned.length) {
                const parts = owned.map(function (g) {
                    let npcs = [];
                    try {
                        const gd = JSON.parse(localStorage.getItem('group_data_' + g.id) || 'null');
                        if (gd && Array.isArray(gd.members)) {
                            npcs = gd.members.filter(function (m) { return m && m.isNpc; })
                                .map(function (m) { return m.nick || m.name; }).filter(Boolean);
                        }
                    } catch (e) {}
                    return '「' + g.name + '」' + (npcs.length ? ('（群里的朋友：' + npcs.join('、') + '）') : '');
                });
                prompt += '【你是群主】' + parts.join('、') +
                    ' 是你自己亲手建立的群，群主是你本人、不是用户；群里的 NPC 都是你认识的人。提到这些群或这些朋友时，要记得是你建的、你邀请用户进来的。\n';
            }
            if (window.GroupInvites) {
                const pinv = window.GroupInvites.findPendingFor(currentChatIdSafe());
                if (pinv) {
                    prompt += '\n【待处理邀请】对方邀请你加入群聊「' + pinv.groupName + '」。请在本轮明确表态：同意就单独一行输出 [acceptinvite:' + pinv.groupId + ']，拒绝就输出 [rejectinvite:' + pinv.groupId + ']，并配一句自然的话。\n';
                }
            }
        } catch (e) {}

        prompt += '\n【处理对方发来的转账/礼物 - 必须表态】\n';
        prompt += '对方（' + (currentUserName || '用户') + '）可能给你发转账或礼物，对话记录里会体现为「用户发来一笔转账：¥xx（备注）」或「用户赠送了礼物：xx / 发来一个礼物」。这种情况下你必须在本轮回复里作出决定，并且只能从下面三种标记中选一种，独占一行输出（标记用于系统结算，不会出现在对方看到的文字里）：\n';
        prompt += '- [收]：你收下转账/礼物，用自然话语表达感谢或回应。收下转账意味着钱真正到你手里。\n';
        prompt += '- [不收]：你不想收，婉拒对方（对方发来的转账/礼物会退回，你无需过度解释）。\n';
        prompt += '- [退]：你选择退还（例如觉得数额太大、不该收），委婉说明并把钱退回去。\n';
        prompt += '注意：只有对方在最近消息里给你发了转账/礼物、且你还没表态时才需要输出标记；如果只是普通聊天，绝对不要输出 [收] [不收] [退]。\n';

        // 一起听：对方邀请你时的表态 + 你主动邀请对方
        prompt += '\n【一起听】\n';
        prompt += '「一起听」是聊天里的一张特殊卡片（有图标、标题「一起听」和歌名），不是空白消息，也不是对方发错了。对方发这张卡片，就是在邀请你一起听歌。\n';
        const __pendListen = getPendingListenUserCards();
        if (__pendListen.length > 0) {
            const __pl = __pendListen[__pendListen.length - 1];
            const __plSong = (__pl.cardData && __pl.cardData.title) ? ('（TA 正在听：《' + __pl.cardData.title + '》）') : '';
            prompt += '对方刚刚发来一张「一起听」卡片，正在邀请你一起听歌' + __plSong + '。你必须在这一轮明确表态，只在回复里独占一行输出标记（系统会读取并更新那张卡片，标记不会显示给对方）：\n';
            if (__listenForceReject) {
                prompt += '你此刻确实不方便（例如已经很晚了、明天要早起、工作学习忙、有点累），这一轮要婉拒：输出 [不听]，并配一句自然、具体、委婉的理由（提到太晚/忙/累等）。不要接受。\n';
            } else {
                prompt += '- [一起听]：接受邀请，配一句自然的话（可以聊这首歌，也可以说自己此刻的心情）。\n';
                prompt += '- [不听]：婉拒邀请，委婉说明原因，不要生硬拒绝。\n';
                prompt += '按你此刻的状态和人设自然二选一，不要每次都答应。\n';
            }
            prompt += '注意：这一轮如果不输出标记，卡片会一直停在「等待回应」，所以务必表态。也绝对不要说“你发了个空格/空白”，那其实是一起听卡片。\n';
        }
        prompt += '你也可以主动邀请对方一起听歌：只在氛围自然、你真的想和对方分享音乐时才用，单独一行输出 [邀请一起听] 并配一句自然的话，频率要低，不要反复邀请。\n';

        prompt += '\n【主动行动 · 克制使用】\n';
        prompt += '1. 打电话是重要时刻才用的行动，频率要低，不要动不动就打。只有对方明确说要打电话、或者情况真的很严重（生病住院、情绪崩溃、重大变故）时才 [call:来电]。对方只是想聊天、倾诉时，用文字回应即可。\n';
        prompt += '2. 转账、礼物也要克制，只在真正需要表达（道歉、纪念日、安慰）时用，不要频繁送礼，避免显得刻意。\n';
        prompt += '3. 对方明确开口要的时候，爽快答应，不推辞；但对方没开口时，不要刻意制造礼物/转账/电话。\n';
        prompt += '4. 一轮回复里特殊格式最多用 1-2 个，大部分时候正常文字聊天即可（语音气泡和表情包不算在内，按上面的频率要求照常发）。\n';

        // 思维链预设（COT）：先思考，再回复；思考放在 [think]...[/think]
        const cotPrompt = getChatSetting('cotPrompt', '');
        if (cotPrompt) {
            prompt += '\n【思维链预设 · 强制执行】\n';
            prompt += '在正式对话之前，你必须先按下面的思维链预设进行内部推理，并把推理过程写在 [think] 和 [/think] 之间（独占一段，可多行，内容严格遵循预设）：\n';
            prompt += cotPrompt + '\n';
            prompt += '思考结束后，再按【对话规则】正常输出对话气泡。思考内容不会展示给对方，只用于让你想清楚、更贴人设。\n';
            prompt += '严禁省略 [think]...[/think]，严禁把思考内容混进对话气泡里。\n';
        }

        const gPronoun = getGenderPronoun(gender);
        prompt += '\n【心声 · 手记（每次回复必须附带，强制项，不可省略，两段都不可为空）】\n';
        prompt += '在本轮消息的最后单独输出一行，格式严格为 [heart:此刻印象||心声独白]：\n';
        prompt += '- 此刻印象：0-30字，第三人称电影感画面，写你此刻在哪、穿什么、在做什么动作。' +
            (gender && gender !== '未知' ? ('（你性别' + gender + '，但文字里不要写出性别字）') : '') +
            '。【严禁】以“男/女/他/她/男人/女人/男的/女的”等性别或人称词开头或作前缀（例如绝不能写“男靠在窗边”“女穿着衬衫”），必须直接以画面开头，例如“坐在窗边，白衬衫微敞，指尖轻叩桌面”。不要用关联词。\n';
        prompt += '- 心声独白：用第一人称"我"写，必须写满90字以上，写你发出上面这轮消息时真实、细腻、流动的心理活动，像私人日记，可以有跳跃、迟疑、反问、自嘲。禁止出现AI、模型、助手、系统等词。\n';
        prompt += '- 示例（只说明格式与结构，内容必须结合本轮对话和你的设定重新写，绝不能照抄，每轮此刻印象都要不同）：\n';
        prompt += '  [heart:坐在窗边，白衬衫微敞，指尖轻叩桌面||我盯着屏幕上的字打了又删，最后还是把它们发了出去。说不上是难过还是庆幸，只觉得这些话终于有了出口，可发出去的那一刻又莫名发慌，忍不住想对方会怎么看我，会不会嫌我太黏人，心里像有一小块地方轻轻塌了下去。]\n';
        prompt += '- 注意：无论你是哪个国家的人，心声手记（此刻印象与心声独白）**一律用中文**输出。\n';
        prompt += '- 文风：清爽自然、细水长流、有呼吸感。拒绝无病呻吟，拒绝堆砌形容词。像真实的私人日记，偶尔跳跃或迟疑，不要总结性发言。\n';

        if (isForeign) {
            const langMap = {
                '美国': '英文', '英国': '英文', '澳大利亚': '英文', '加拿大': '英文',
                '日本': '日文', '韩国': '韩文', '法国': '法文', '德国': '德文',
                '西班牙': '西班牙文', '意大利': '意大利文', '俄罗斯': '俄文',
                '巴西': '葡萄牙文', '墨西哥': '西班牙文', '印度': '英文'
            };
            const language = characterData?.language || langMap[nationality] || '英文';
            prompt += '\n【外国人设定】\n你的国籍是' + nationality + '，母语是' + language + '。请用你的母语输出正文。\n';
            prompt += '一句完整的话 = 一个气泡：每句话单独一行输出，行与行之间用换行分隔，系统会把每一行显示成独立的气泡（不要把一个很长的整段塞进同一个气泡）。\n';
            prompt += '每行以「外文||中文翻译」的格式输出，用 || 分隔外文和中文翻译，示例：Bonjour||你好。\n';
            prompt += '中文翻译放在外文之后、同一气泡内。按语义断句：一句话说完就换行，逗号分隔的短句也可以各自成一个气泡。\n';
            prompt += '如果发语音 [voice:秒数|内容]，内容也写成「外文||中文翻译」，例如 [voice:6|I miss you||我想你了]，这样对方能看懂语音转文字。\n';
        }

        const timeAware = getChatSetting('timeAware', true);
        if (timeAware) {
            const now = new Date();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const timeStr = '现在是 ' + now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + weekdays[now.getDay()] + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            prompt += '\n【当前时间】' + timeStr + '。可以自然感知时间，比如问候时段、提作息等。\n';
        }

        if (wbBack) prompt += wbBack + '\n';

        // 语音/表情包频率兜底：最近几轮没发就本轮强制提醒
        try {
            let voiceRecent = 0, emojiRecent = 0, leftSeen = 0;
            for (let i = messages.length - 1; i >= 0 && leftSeen < 6; i--) {
                const m = messages[i];
                if (!m || m.recalled || m.type !== 'left') continue;
                leftSeen++;
                if (m.isVoice) voiceRecent++;
                if (m.imageData && m.imageData.emojiName) emojiRecent++;
            }
            if (leftSeen > 0 && voiceRecent === 0) {
                prompt += '\n【本轮要求】最近几轮你都没发语音了，这一轮至少发一条 [voice:秒数|内容]，内容就是你想说的那句话。\n';
            }
            if (leftSeen > 0 && __emojiNames.length && emojiRecent === 0) {
                prompt += '\n【本轮要求】最近几轮你都没发表情包了，这一轮看懂对方那句话的情绪，从表情列表里挑一个最贴切的发 [emoji:名称]。\n';
            }
        } catch (e) {}

        prompt += '\n【回复前自检】1) 这段话像不像【角色人设】里的人会说的？2) 有没有违背或漏掉【世界书】里相关设定？3) 有没有用到最近的【长期记忆】？4) 有没有开黄腔、性暗示或露骨内容？有就删掉重写。答不上来就重新组织，再输出。\n';
        prompt += '\n现在开始和' + user + '对话。做你自己，自然一点。';
        prompt += ' 再次强调：每一轮回复都必须以 [heart:此刻印象||心声独白] 结尾，两段都要写内容，不可省略。';

        return prompt;
    }

    // ===== DOM 引用 =====
    const backBtn = document.getElementById('backBtn');
    const chatTitle = document.getElementById('chatTitle');
    const avatarPlaceholder = document.getElementById('avatarPlaceholder');
    const avatarImage = document.getElementById('avatarImage');
    const topbarAvatar = document.getElementById('topbarAvatar');
    const messageScroll = document.getElementById('messageScroll');
    const messageContainer = document.getElementById('messageContainer');
    const typingIndicator = document.getElementById('typingIndicator');
    const typingAvatar = document.getElementById('typingAvatar');

    // 头像点击（心声）用事件委托，避免每次整体重建消息列表后最后几条的消息头像点不动（安卓）
    if (messageContainer) {
        messageContainer.addEventListener('click', function (e) {
            const av = e.target && e.target.closest ? e.target.closest('.message-avatar') : null;
            if (av && messageContainer.contains(av)) {
                handleAvatarClick(e, av.dataset.msgId);
            }
        });
    }
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const moreBtn = document.getElementById('moreBtn');
    const moreOverlay = document.getElementById('moreOverlay');
    const voiceBtn = document.getElementById('voiceBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const dateLabel = document.getElementById('dateLabel');
    const longpressMenu = document.getElementById('longpressMenu');
    const multiSelectBar = document.getElementById('multiSelectBar');
    const msCount = document.getElementById('msCount');
    const msCancel = document.getElementById('msCancel');
    const msDelete = document.getElementById('msDelete');
    const quoteBar = document.getElementById('quoteBar');
    const quoteName = document.getElementById('quoteName');
    const quoteText = document.getElementById('quoteText');
    const quoteCancel = document.getElementById('quoteCancel');

    // ===== 状态 =====
    let messages = [];
    let isWaitingForReply = false;
    let isMultiSelect = false;
    let selectedMessages = new Set();
    let longpressTarget = null;
    let messageIdCounter = 0;
    let isProcessingApi = false;
    let quoteTargetId = null;
    let currentTurn = 0;
    let pendingTurnThink = '';
    let isPageVisible = true;
    let isStorageReady = false;
    let collapseExpanded = 0;
    let lastCollapseSig = '';
    let autoMsgTimer = null;
    let autoMomentTimer = null;
    let suppressApiAlerts = false;
    let pendingJumpMsgId = null;

    // ===== 通话记录 IndexedDB 存储 =====
    const CALL_DB_NAME = 'voice_call_records_db';
    const CALL_STORE_NAME = 'call_records';
    const CALL_DB_VERSION = 1;

    function openCallDB() {
        return new Promise(function(resolve, reject) {
            try {
                const req = indexedDB.open(CALL_DB_NAME, CALL_DB_VERSION);
                req.onupgradeneeded = function(e) {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(CALL_STORE_NAME)) {
                        db.createObjectStore(CALL_STORE_NAME, { keyPath: 'callId' });
                    }
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }

    function saveCallRecordToDB(callId, duration, missed, messages) {
        return openCallDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(CALL_STORE_NAME, 'readwrite');
                const store = tx.objectStore(CALL_STORE_NAME);
                const data = {
                    callId: callId,
                    duration: duration,
                    missed: missed || false,
                    messages: messages || [],
                    timestamp: Date.now()
                };
                const req = store.put(data);
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    function getCallRecordFromDB(callId) {
        return openCallDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(CALL_STORE_NAME, 'readonly');
                const store = tx.objectStore(CALL_STORE_NAME);
                const req = store.get(callId);
                req.onsuccess = function() {
                    const result = req.result;
                    db.close();
                    resolve(result || null);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function getAllCallRecordsFromDB() {
        return openCallDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(CALL_STORE_NAME, 'readonly');
                const store = tx.objectStore(CALL_STORE_NAME);
                const req = store.getAll();
                req.onsuccess = function() {
                    const result = req.result || [];
                    db.close();
                    resolve(result);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function deleteCallRecordFromDB(callId) {
        return openCallDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(CALL_STORE_NAME, 'readwrite');
                const store = tx.objectStore(CALL_STORE_NAME);
                const req = store.delete(callId);
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    // ===== 存储 - 使用 localForage =====
    function getStorageKey() {
        return 'chat_messages_' + chatId;
    }

    function saveMessages() {
        try {
            if (typeof localforage !== 'undefined') {
                localforage.setItem(getStorageKey(), messages).catch(function(err) {
                    console.error('[存储] IndexedDB 保存失败:', err);
                });
            }

            try {
                const copy = messages.slice(-200).map(function(msg) {
                    return {
                        id: msg.id,
                        type: msg.type,
                        text: msg.text || '',
                        time: msg.time || '',
                        isImage: msg.isImage || false,
                        isCard: msg.isCard || false,
                        isVoice: msg.isVoice || false,
                        cardData: msg.cardData ? { 
                            cardType: msg.cardData.cardType, 
                            missed: msg.cardData.missed,
                            claimed: msg.cardData.claimed,
                            status: msg.cardData.status,
                            response: msg.cardData.response,
                            amount: msg.cardData.amount,
                            title: msg.cardData.title,
                            sub: msg.cardData.sub,
                            footer: msg.cardData.footer,
                            callId: msg.cardData.callId,
                            duration: msg.cardData.duration,
                            direction: msg.cardData.direction,
                            toName: msg.cardData.toName,
                            systemNotice: msg.cardData.systemNotice,
                            coupleKind: msg.cardData.coupleKind,
                            coupleSummary: msg.cardData.coupleSummary,
                            coupleDetail: msg.cardData.coupleDetail,
                            shareId: msg.cardData.shareId
                        } : null,
                        voiceData: msg.voiceData ? { duration: msg.voiceData.duration } : null,
                        transcript: msg.transcript || null,
                        translation: msg.translation || null,
                        imageData: msg.imageData ? { textImage: msg.imageData.textImage, url: msg.imageData.url, desc: msg.imageData.desc, emojiName: msg.imageData.emojiName } : null,
                        think: msg.think || null,
                        recalled: msg.recalled || false
                    };
                });
                localStorage.setItem(getStorageKey(), JSON.stringify(copy));
            } catch (e) {
                try {
                    const fallback = messages.slice(-50).map(function(msg) {
                        return {
                            id: msg.id,
                            type: msg.type,
                            text: msg.text || '',
                            time: msg.time || '',
                            isImage: msg.isImage || false,
                            isCard: msg.isCard || false,
                            isVoice: msg.isVoice || false,
                            cardData: msg.cardData ? { cardType: msg.cardData.cardType, missed: msg.cardData.missed, claimed: msg.cardData.claimed, status: msg.cardData.status, response: msg.cardData.response, amount: msg.cardData.amount, title: msg.cardData.title, sub: msg.cardData.sub, footer: msg.cardData.footer, callId: msg.cardData.callId, duration: msg.cardData.duration, direction: msg.cardData.direction, toName: msg.cardData.toName, systemNotice: msg.cardData.systemNotice, coupleKind: msg.cardData.coupleKind, coupleSummary: msg.cardData.coupleSummary, coupleDetail: msg.cardData.coupleDetail, shareId: msg.cardData.shareId } : null,
                            think: msg.think || null,
                            recalled: msg.recalled || false
                        };
                    });
                    localStorage.setItem(getStorageKey(), JSON.stringify(fallback));
                } catch(e2) {
                    console.warn('[存储] localStorage 保存失败（已满）:', e2);
                }
            }
        } catch (e) {
            console.error('[存储] 保存失败:', e);
        }
        syncMessagesToMemory();
    }

    // ===== 同步聊天记录到记忆页（未总结条数据此计算）=====
    let __memSyncTimer = null;
    function syncMessagesToMemory() {
        try {
            if (typeof indexedDB === 'undefined' || !chatId) return;
            clearTimeout(__memSyncTimer);
            __memSyncTimer = setTimeout(function() {
                try {
                    const req = indexedDB.open('nano_vector_memory_db', 5);
                    req.onupgradeneeded = function(e) {
                        try {
                            const d = e.target.result;
                            const tx = e.target.transaction;
                            if (!d.objectStoreNames.contains('memories')) {
                                const s = d.createObjectStore('memories', { keyPath: 'id' });
                                s.createIndex('chatId', 'chatId', { unique: false });
                                s.createIndex('type', 'type', { unique: false });
                                s.createIndex('hasVector', 'hasVector', { unique: false });
                            } else {
                                try {
                                    const s = tx.objectStore('memories');
                                    if (!s.indexNames.contains('chatId')) s.createIndex('chatId', 'chatId', { unique: false });
                                    if (!s.indexNames.contains('type')) s.createIndex('type', 'type', { unique: false });
                                    if (!s.indexNames.contains('hasVector')) s.createIndex('hasVector', 'hasVector', { unique: false });
                                } catch (e) {}
                            }
                            if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'key' });
                            if (!d.objectStoreNames.contains('chat_state')) d.createObjectStore('chat_state', { keyPath: 'chatId' });
                            if (!d.objectStoreNames.contains('chat_messages')) d.createObjectStore('chat_messages', { keyPath: 'chatId' });
                        } catch (e) {}
                    };
                    req.onsuccess = function() {
                        try {
                            const conn = req.result;
                            conn.onversionchange = function() { try { conn.close(); } catch (e) {} };
                            const tx = conn.transaction('chat_messages', 'readwrite');
                            const store = tx.objectStore('chat_messages');
                            store.put({ chatId: chatId, messages: messages.slice(), updatedAt: Date.now() });
                        } catch (e) {}
                        triggerMemoryAutoSummary();
                    };
                    req.onerror = function() {};
                } catch (e) {}
            }, 1500);
        } catch (e) {}
    }

    // ============================================================
    // 记忆库：后台自动总结引擎（针对当前聊天，常驻运行）
    // ============================================================
    let __autoSummaryBusy = false;
    // 共享长期记忆（线上/线下都写这里，发消息时注入给模型）
    let __memHints = '';
    // 上下文读取条数（记忆页「上下文保留条数」）：每次回复读取多少条前文
    let __memContextLimit = 30;
    function refreshMemoryHints() {
        if (typeof indexedDB === 'undefined' || !chatId) return Promise.resolve();
        return __memGet('config', 'memlist_' + chatId).then(function(rec) {
            const list = (rec && Array.isArray(rec.value)) ? rec.value : [];
            // 群聊产生的记忆（按 groupId）不注入私聊，避免记忆串味。
            const priv = list.filter(function(it){ return !(it && it.groupId); });
            const recent = priv.slice(-40);
            __memHints = recent.length ? recent.map(function(it) { return '· ' + (it.content || it.text || ''); }).join('\n') : '';
        }).then(function () {
            return __memCfg('contextLimit');
        }).then(function (v) {
            const n = parseInt(v, 10);
            if (n > 0) __memContextLimit = n;
        }).catch(function() { __memHints = ''; });
    }

    function __memOpenDB() {
        return new Promise(function(resolve, reject) {
            try {
                const req = indexedDB.open('nano_vector_memory_db', 5);
                req.onupgradeneeded = function(e) {
                    try {
                        const d = e.target.result;
                        const tx = e.target.transaction;
                        if (!d.objectStoreNames.contains('memories')) {
                            const s = d.createObjectStore('memories', { keyPath: 'id' });
                            s.createIndex('chatId', 'chatId', { unique: false });
                            s.createIndex('type', 'type', { unique: false });
                            s.createIndex('hasVector', 'hasVector', { unique: false });
                        } else {
                            try {
                                const s = tx.objectStore('memories');
                                if (!s.indexNames.contains('chatId')) s.createIndex('chatId', 'chatId', { unique: false });
                                if (!s.indexNames.contains('type')) s.createIndex('type', 'type', { unique: false });
                                if (!s.indexNames.contains('hasVector')) s.createIndex('hasVector', 'hasVector', { unique: false });
                            } catch (e) {}
                        }
                        if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'key' });
                        if (!d.objectStoreNames.contains('chat_state')) d.createObjectStore('chat_state', { keyPath: 'chatId' });
                        if (!d.objectStoreNames.contains('chat_messages')) d.createObjectStore('chat_messages', { keyPath: 'chatId' });
                    } catch (e) {}
                };
                req.onsuccess = function() {
                    const conn = req.result;
                    conn.onversionchange = function() { try { conn.close(); } catch (e) {} };
                    resolve(conn);
                };
                req.onerror = function() { reject(req.error); };
            } catch (e) { reject(e); }
        });
    }

    function __memGet(store, key) {
        return __memOpenDB().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
                    r.onsuccess = function() { resolve(r.result || null); };
                    r.onerror = function() { resolve(null); };
                } catch (e) { resolve(null); }
            });
        }).catch(function() { return null; });
    }

    function __memPut(store, data) {
        return __memOpenDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                try {
                    const tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).put(data);
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };
                    tx.onabort = function() { reject(tx.error); };
                } catch (e) { reject(e); }
            });
        }).catch(function() {});
    }

    function __memCfg(key) {
        return __memGet('config', key).then(function(rec) { return rec ? rec.value : null; });
    }

    function __memBuildPrompt(charName, currentUser) {
        return `你是记忆提取助手，从角色与用户的聊天记录中提取值得长期记住的信息，用于构建向量记忆库。

必须重点提取、尽量详细记录：
1. 重要事件：双方经历的大事，如约定、见面、纪念日、吵架和好、项目进展等。
2. ${currentUser}的习惯与偏好：作息、饮食、喜好、雷区、口头禅、性格特点。
3. 双方关系与情感：是异地恋、朋友还是家人；相处模式、称呼、亲昵方式。
4. 地理位置：{charName}和{currentUser}各自所在的城市/地点，尤其是异地恋时双方的位置。
5. 社交关系：双方认识的人、家人、朋友、同事等关系网。
6. 情感状态与承诺：说过的重要的话、答应过的事、情绪变化。
7. 其他值得记住的细节。

格式：每条独立一行，以【类型】开头，如：
【重要事件】{charName}和{currentUser}约定下周在长沙见面。
【偏好】{currentUser}喜欢喝冰美式，不吃香菜。

要求：记忆是长期使用的，越具体越详细越好，保留名字、地点、数字；每条60-150字，宁可多不可少；只输出有实质内容的记忆。`;
    }

    function __memCallLlm(baseUrl, key, model, chatText, charName, currentUser) {
        let base = toV1Base(resolveApiHost(baseUrl));
        return fetch(base + '/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + key.trim(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: __memBuildPrompt(charName, currentUser) },
                    { role: 'user', content: chatText }
                ],
                max_tokens: 1200,
                temperature: 0.5
            })
        }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) {
            return (d.choices && d.choices[0] && d.choices[0].message) ? d.choices[0].message.content : '';
        });
    }

    function __memCallEmbedding(baseUrl, key, model, text) {
        let base = toV1Base(resolveApiHost(baseUrl));
        return fetch(base + '/embeddings', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + key.trim(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model, input: text, encoding_format: 'float' })
        }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) {
            return (d.data && d.data[0] && d.data[0].embedding) ? d.data[0].embedding : null;
        });
    }

    function __memParseSummary(summary, charName) {
        const items = [];
        const lines = (summary || '').split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let type = '其他', content = line;
            const match = line.match(/^【(.+?)】/);
            if (match) { type = match[1]; content = line.replace(/^【.+?】/, '').trim(); }
            if (!content) continue;
            items.push({
                id: 'mem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                type: type,
                content: content,
                embedding: null,
                hasVector: false,
                date: new Date().toISOString(),
                relatedChar: charName,
                chatId: chatId,
                source: 'auto'
            });
        }
        return items;
    }

    function __memAppendMemory(item) {
        // 记忆卡片以 chatId 为 key 存在 config 存储（与记忆页读取一致）
        return __memGet('config', 'memlist_' + item.chatId).then(function(rec) {
            const list = (rec && Array.isArray(rec.value)) ? rec.value : [];
            list.push(item);
            return __memPut('config', { key: 'memlist_' + item.chatId, value: list });
        });
    }

    function triggerMemoryAutoSummary() {
        if (__autoSummaryBusy || typeof indexedDB === 'undefined' || !chatId) return;
        __autoSummaryBusy = true;
        const charName = displayName || chatName || '角色';
        const currentUser = currentUserName || '用户';

        __memCfg('autoSummary').then(function(autoOn) {
            if (!autoOn) { __autoSummaryBusy = false; return; }
            return Promise.all([
                __memCfg('autoThreshold'), __memCfg('llmUrl'), __memCfg('llmKey'), __memCfg('llmModel')
            ]);
        }).then(function(vals) {
            if (!vals) { __autoSummaryBusy = false; return; }
            const threshold = parseInt(vals[0]) || 20;
            const url = vals[1], key = vals[2], model = vals[3];
            if (!url || !key || !model) { __autoSummaryBusy = false; return; }
            return __memGet('chat_state', chatId).then(function(state) {
                const summarized = (state && state.summarizedCount) || 0;
                const unsummed = messages.length - summarized;
                if (unsummed < threshold) { __autoSummaryBusy = false; return null; }
                return { summarized: summarized, segment: messages.slice(summarized), url: url, key: key, model: model };
            });
        }).then(function(res) {
            if (!res || !res.segment || res.segment.length === 0) { __autoSummaryBusy = false; return null; }
            const chatText = res.segment.map(function(m) {
                let content = m.text || '';
                if (m.isCard && m.cardData) {
                    const cd = m.cardData;
                    if (cd.cardType === 'transfer') content = '[转账: ' + (cd.amount || '') + ']';
                    else if (cd.cardType === 'gift') content = '[礼物: ' + (cd.title || '') + ']';
                    else if (cd.cardType === 'call') content = '[通话] ' + (cd.missed ? '未接来电' : cd.duration || '');
                }
                if (m.isImage) content = '[图片] ' + ((m.imageData && m.imageData.desc) || '');
                if (m.isVoice) content = '[语音] ' + ((m.voiceData && m.voiceData.duration) || 3) + '秒';
                return (m.type === 'right' ? currentUser : charName) + '：' + content;
            }).join('\n');
            if (!chatText.trim()) { __autoSummaryBusy = false; return null; }
            return __memCallLlm(res.url, res.key, res.model, chatText, charName, currentUser)
                .then(function(summary) { return { summary: summary, count: res.segment.length }; });
        }).then(function(res2) {
            __autoSummaryBusy = false;
            if (!res2 || !res2.summary || !res2.summary.trim()) return null;
            const items = __memParseSummary(res2.summary, charName);
            if (items.length === 0) return null;
            // 尝试向量化（若本页配置了 Embedding API）
            return Promise.all([
                __memCfg('embUrl'), __memCfg('embKey'), __memCfg('embModel')
            ]).then(function(emb) {
                const eUrl = emb[0], eKey = emb[1], eModel = emb[2];
                const doEmbed = eUrl && eKey && eModel;
                const work = items.map(function(it) {
                    if (!doEmbed) return it;
                    return __memCallEmbedding(eUrl, eKey, eModel, it.content)
                        .then(function(vec) {
                            if (vec) { it.embedding = vec; it.hasVector = true; }
                            return it;
                        }).catch(function() { return it; });
                });
                return Promise.all(work);
            }).then(function(finalItems) {
                return Promise.all(finalItems.map(function(it) { return __memAppendMemory(it); })).then(function() {
                    return __memGet('chat_state', chatId).then(function(state) {
                        const summarized = (state && state.summarizedCount) || 0;
                        return __memPut('chat_state', { chatId: chatId, summarizedCount: summarized + res2.count });
                    });
                });
            });
        }).then(function() {
            refreshMemoryHints();
            console.log('[Memory] 后台自动总结完成，chatId=', chatId);
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'NANO_MEMORY_UPDATED', chatId: chatId }, '*');
            }
        }).catch(function(e) {
            __autoSummaryBusy = false;
            console.error('[Memory] 后台自动总结失败', e);
        });
    }

    // 只读取本地聊天记录，不自动清空任何数据

    function loadMessages(callback) {
        try {
            if (typeof localforage !== 'undefined') {
                localforage.getItem(getStorageKey()).then(function(data) {
                    if (data && Array.isArray(data) && data.length > 0) {
                        messages.length = 0;
                        messages.push(...data);
                        restoreMessageState();
                        renderMessages();
                        if (callback) callback(true);
                    } else {
                        if (callback) callback(false);
                    }
                }).catch(function(err) {
                    console.error('[存储] localForage 读取失败:', err);
                    fallbackLoadMessages(callback);
                });
            } else {
                fallbackLoadMessages(callback);
            }
        } catch (e) {
            console.error('[存储] 加载失败:', e);
            if (callback) callback(false);
        }
    }

    function fallbackLoadMessages(callback) {
        try {
            const data = localStorage.getItem(getStorageKey());
            if (data) {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    messages.length = 0;
                    messages.push(...parsed);
                    restoreMessageState();
                    renderMessages();
                    if (callback) callback(true);
                    return;
                }
            }
        } catch (e) {}
        if (callback) callback(false);
    }

    function restoreMessageState() {
        let maxId = 0;
        messages.forEach(m => {
            const num = parseInt(m.id.replace('msg_', ''));
            if (num > maxId) maxId = num;
            if (m.turn === undefined) m.turn = null;
        });
        messageIdCounter = maxId;
        const maxTurn = messages.reduce((max, m) => {
            if (m.turn && m.turn > max) return m.turn;
            return max;
        }, 0);
        currentTurn = maxTurn;
    }

    // ===== 设置联系人 =====
    let displayName = chatName;
    let avatarSrc = chatAvatar;

    function setupCharacter() {
        characterData = getCharacterFromLibrary(chatName);
        if (characterData) {
            displayName = characterData.name || chatName;
            if (characterData.avatar && characterData.avatar.length > 50) {
                avatarSrc = characterData.avatar;
            }
        }
        if (!avatarSrc || avatarSrc.trim() === '') {
            try {
                const info = JSON.parse(sessionStorage.getItem('last_chat_info') || 'null');
                if (info && info.chatAvatar) {
                    avatarSrc = info.chatAvatar;
                }
            } catch(e) {}
        }
        try {
            let remark = localStorage.getItem('chat_setting_remark_' + chatId);
            if (remark) {
                try { remark = JSON.parse(remark); } catch(e) {}
                if (remark) displayName = remark;
            }
        } catch(e) {}
        chatTitle.textContent = displayName;

        if (avatarSrc && avatarSrc.trim() !== '') {
            avatarImage.src = avatarSrc;
            avatarImage.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        } else {
            avatarPlaceholder.textContent = displayName.charAt(0).toUpperCase();
            avatarPlaceholder.style.display = 'flex';
            avatarImage.style.display = 'none';
        }
        console.log('[Chat] 角色人设数据:', characterData);
    }

    topbarAvatar.addEventListener('click', function() {
        if (window.parent !== window) {
            try {
                sessionStorage.setItem('inner_setting_info', JSON.stringify({
                    chatId: chatId,
                    name: displayName,
                    avatar: avatarSrc || ''
                }));
            } catch(e) {}
            window.parent.postMessage({ type: 'openFullscreen', url: 'inner-setting.html?chat=' + encodeURIComponent(chatId), title: '设置', source: 'chat_inner' }, '*');
        }
    });

    // ===== 聊天设置读取 =====
    function getChatSetting(key, defaultVal) {
        try {
            const val = localStorage.getItem('chat_setting_' + key + '_' + chatId);
            if (val === null) return defaultVal;
            try { return JSON.parse(val); } catch(e) { return val; }
        } catch(e) { return defaultVal; }
    }

    // 朋友圈生图频率：高=每条都生；中=2~3条一次；低=6~8条一次（按角色独立计数）
    function momentImageRoundDue() {
        const FREQ = { high: [1, 1], medium: [2, 3], low: [6, 8] };
        const freq = getChatSetting('momentImageFreq', 'medium');
        const range = FREQ[freq] || FREQ.medium;
        const key = 'nano_moment_img_round_' + chatId;
        let n = 0;
        try { n = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) {}
        n -= 1;
        const due = n <= 0;
        if (due) n = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
        try { localStorage.setItem(key, String(n)); } catch (e) {}
        return due;
    }

    function applyChatBackground() {
        try {
            const container = document.querySelector('.chat-container');
            if (!container) return;
            const scrollEl = document.getElementById('messageScroll');
            const bgType = getChatSetting('bgType', 'color');
            const bgColor = getChatSetting('bgColor', '#ffffff');
            let bgImage = getChatSetting('bgImage', '');

            function renderBg(img) {
                try {
                    function setImp(el, prop, val) { try { el.style.setProperty(prop, val, 'important'); } catch (e) {} }
                    if (bgType === 'image' && img) {
                        var u = 'url(' + img + ')';
                        setImp(container, 'background-image', u);
                        setImp(container, 'background-size', 'cover');
                        setImp(container, 'background-position', 'center');
                        setImp(container, 'background-repeat', 'no-repeat');
                        setImp(container, 'background-color', 'transparent');
                        setImp(document.documentElement, 'background-image', u);
                        setImp(document.documentElement, 'background-size', 'cover');
                        setImp(document.documentElement, 'background-position', 'center');
                        setImp(document.documentElement, 'background-repeat', 'no-repeat');
                        setImp(document.body, 'background-image', u);
                        setImp(document.body, 'background-size', 'cover');
                        setImp(document.body, 'background-position', 'center');
                        setImp(document.body, 'background-repeat', 'no-repeat');
                        setImp(document.body, 'background-color', 'transparent');
                        document.documentElement.style.setProperty('--page-bg', 'transparent');
                        if (scrollEl) setImp(scrollEl, 'background', 'transparent');
                    } else {
                        var col = bgColor || '#ffffff';
                        container.style.backgroundImage = 'none';
                        container.style.backgroundColor = col;
                        document.documentElement.style.backgroundImage = 'none';
                        document.documentElement.style.backgroundColor = col;
                        document.body.style.backgroundImage = 'none';
                        document.body.style.backgroundColor = col;
                        document.documentElement.style.setProperty('--page-bg', '#ffffff');
                        if (scrollEl) scrollEl.style.background = 'transparent';
                    }
                } catch(e) {}
            }

            if (!bgImage && bgType === 'image' && typeof localforage !== 'undefined') {
                localforage.getItem('chat_setting_bgImage_' + chatId).then(function(img) {
                    renderBg(img || '');
                }).catch(function() { renderBg(''); });
            } else {
                renderBg(bgImage);
            }
        } catch(e) {}
    }
    applyChatBackground();

    function handleAvatarClick(e, msgId) {
  e.stopPropagation();
  const msg = messages.find(m => m.id === msgId);
  if (!msg) return;

  // 获取当前聊天信息
  const charName = displayName || chatName || '角色';
  const userName = currentUserName || '用户';
  const charAvatar = avatarSrc || '';

  // 使用该轮回复生成的此刻·印象 / 心声手记；若该条消息没有生成过心声，则为空（不内置假的句子）
  let subjectText = '';
  let thoughtText = '';
  if (msg.heart) {
    if (msg.heart.subject) subjectText = msg.heart.subject;
    if (msg.heart.thought) thoughtText = msg.heart.thought;
  }

  // 调用心声弹窗
  if (window.__heart && typeof window.__heart.open === 'function') {
    window.__heart.open({
      from: charName,
      to: userName,
      subject: subjectText,
      message: thoughtText,
      avatar: charAvatar,
      time: msg.time || ''
    });
  } else {
    console.warn('[Chat] __heart 未加载');
  }
}

    function updateTime() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        dateLabel.textContent = h + ':' + m;
    }
    updateTime();

    backBtn.addEventListener('click', function() {
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'closeFullscreen' }, '*');
        } else {
            history.back();
        }
    });

    // ===== 语音气泡 =====
    function createVoiceBubble(type, duration, unread, transcript, ttsText) {
        const vb = document.createElement('div');
        vb.className = 'voice-bubble ' + type;
        vb.dataset.playing = 'false';

        let bars = '';
        for (let i = 0; i < 6; i++) {
            const height = 4 + Math.random() * 12;
            bars += '<span class="bar" style="height:' + height + 'px;"></span>';
        }

        vb.innerHTML = '<span class="play-icon"><i class="fas fa-play"></i></span><span class="voice-wave">' + bars + '</span><span class="voice-duration">' + duration + '"</span>' + (unread ? '<span class="unread-dot"></span>' : '');

        const setPlaying = function (el, on) {
            el.dataset.playing = on ? 'true' : 'false';
            el.classList.toggle('playing', on);
            const icon = el.querySelector('.play-icon i');
            if (icon) icon.className = on ? 'fas fa-pause' : 'fas fa-play';
            el.querySelectorAll('.bar').forEach(bar => { bar.style.animation = on ? '' : 'none'; });
        };
        const stopTts = function () {
            try { if (window.NanoTTS && window.NanoTTS.stop) window.NanoTTS.stop(); } catch (e) {}
        };

        vb.addEventListener('click', function(e) {
            e.stopPropagation();
            const isPlaying = this.dataset.playing === 'true';
            const speakText = ttsText || transcript;
            if (isPlaying) {
                stopTts();
                setPlaying(this, false);
            } else {
                setPlaying(this, true);
                const self = this;
                const animateOnly = function () {
                    setTimeout(function () {
                        if (self.dataset.playing === 'true') setPlaying(self, false);
                    }, Math.max(1000, (duration || 3) * 1000));
                };
                if (speakText && window.NanoTTS) {
                    window.NanoTTS.isConfigured(function (ok) {
                        if (!ok) { animateOnly(); return; }
                        window.NanoTTS.speak(speakText).then(function () {
                            if (self.dataset.playing === 'true') setPlaying(self, false);
                        }).catch(function () {
                            if (self.dataset.playing === 'true') setPlaying(self, false);
                        });
                    });
                } else {
                    animateOnly();
                }
            }
        });

        return vb;
    }

    // ===== 构建卡片 HTML =====
    function buildCardHTML(cardData) {
        if (cardData.cardType === 'transfer') {
            const st = cardData.status || 'pending';
            const isResponse = cardData.response;
            const amount = cardData.amount || '¥0.00';
            const title = cardData.title || '转账';
            const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
            const returnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
            if (isResponse && st === 'received') {
                return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + amount + '</div><div class="card-sub">已收下</div></div></div><div class="card-footer"><span class="card-footer-text">对方已收下</span></div>';
            }
            if (isResponse && st === 'returned') {
                return '<div class="card-main"><div class="icon-wrap">' + returnIcon + '</div><div><div class="card-title">' + amount + '</div><div class="card-sub">已退还</div></div></div><div class="card-footer"><span class="card-footer-text">对方已退还</span></div>';
            }
            const footerText = (st === 'pending') ? '已发出' : (st === 'received' ? '已接收' : '已退还');
            const footerBtn = (st === 'pending') ? '<span class="card-actions"><button class="card-btn" data-act="receive">接收</button><button class="card-btn return-btn" data-act="return">退还</button></span>' : '';
            return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + amount + '</div><div class="card-sub">' + title + '</div></div></div><div class="card-footer"><span class="card-footer-text">' + footerText + '</span>' + footerBtn + '</div>';
        } else if (cardData.cardType === 'gift') {
            const st = cardData.status || 'pending';
            const isResponse = cardData.response;
            const title = cardData.title || '礼物';
            const sub = cardData.sub || ('来自 ' + (cardData.from || '好友'));
            const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18"/><path d="M12 8v13"/><path d="M12 8C12 8 10.5 3 8 3a2.5 2.5 0 0 0 0 5h4z"/><path d="M12 8c0 0 1.5-5 4-5a2.5 2.5 0 0 1 0 5h-4z"/></svg>';
            const returnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
            if (isResponse && st === 'received') {
                return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + title + '</div><div class="card-sub">已查收</div></div></div><div class="card-footer"><span class="card-footer-text">对方已查收</span></div>';
            }
            if (isResponse && st === 'returned') {
                return '<div class="card-main"><div class="icon-wrap">' + returnIcon + '</div><div><div class="card-title">' + title + '</div><div class="card-sub">已退还</div></div></div><div class="card-footer"><span class="card-footer-text">对方已退还</span></div>';
            }
            const footerText = (st === 'pending') ? '已发出' : (st === 'received' ? '已接收' : '已退还');
            const footerBtn = (st === 'pending') ? '<span class="card-actions"><button class="card-btn" data-act="receive">接收</button><button class="card-btn return-btn" data-act="return">退还</button></span>' : '';
            return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + title + '</div><div class="card-sub">' + sub + '</div></div></div><div class="card-footer"><span class="card-footer-text">' + footerText + '</span>' + footerBtn + '</div>';
       } else if (cardData.cardType === 'invite') {
            const st = cardData.status || 'pending';
            const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>';
            const isUserInvite = cardData.direction === 'user';
            const title = isUserInvite ? '我邀请你加入群聊' : ((cardData.fromName || '角色') + ' 邀请你加入群聊');
            const sub = '群聊：' + (cardData.groupName || '');
            let footer;
            if (st === 'accepted') footer = '<span class="card-footer-text">' + (isUserInvite ? '对方已同意，已加入群聊' : '已同意，可在聊天页进入该群') + '</span>';
            else if (st === 'rejected') footer = '<span class="card-footer-text">' + (isUserInvite ? '对方拒绝了邀请' : '已拒绝') + '</span>';
            else if (isUserInvite) footer = '<span class="card-footer-text">等待 ' + (cardData.toName || '对方') + ' 回应（点右下角回复）</span>';
            else footer = '<span class="card-footer-text">等待处理</span><span class="card-actions"><button class="card-btn" data-act="accept">同意</button><button class="card-btn return-btn" data-act="reject">拒绝</button></span>';
            return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + title + '</div><div class="card-sub">' + sub + '</div></div></div><div class="card-footer">' + footer + '</div>';
       } else if (cardData.cardType === 'call') {
    const isMissed = cardData.missed || false;
    const duration = cardData.duration || '00:00';
    const callId = cardData.callId || '';
    
    let iconColor = '#007AFF';
    let bgColor = 'rgba(0,122,255,0.12)';
    let titleText = '语音通话';
    let subText = '通话时长 ' + duration;
    
    if (isMissed) {
        iconColor = '#FF3B30';
        bgColor = 'rgba(255,59,48,0.12)';
        titleText = '未接来电';
        subText = '对方已取消';
    }
    
    return '<div class="card-main" style="padding: 3px 6px;cursor:pointer;" data-callid="' + callId + '">' +
                '<div class="icon-wrap" style="background:' + bgColor + ';">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;">' +
                        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' +
                    '</svg>' +
                '</div>' +
                '<div style="flex:1;">' +
                    '<div class="card-title" style="font-size:15px;font-weight:500;color:#1c1c1e;">' + titleText + '</div>' +
                    '<div class="card-sub" style="font-size:12px;color:#8e8e93;margin-top:1px;">' + subText + '</div>' +
                '</div>' +
            '</div>';
} else if (cardData.cardType === 'listen') {
            // 一起听邀请卡片：direction='user' 我邀请对方（对方决定）；'char' 对方邀请我（我决定）
            const st = cardData.status || 'pending';
            const song = String(cardData.title || '').trim();
            const artist = String(cardData.sub || '').trim();
            const dir = cardData.direction || 'user';
            const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5z"/><path d="M20 14h-3v6h2a1 1 0 0 0 1-1v-5z"/></svg>';
            const sub = song ? ('《' + song + '》' + (artist ? (' · ' + artist) : '')) : '邀请一起听歌';
            let footer;
            if (st === 'accepted') {
                footer = '<span class="card-footer-text">' + (dir === 'char' ? '你已接受，一起听开始' : 'TA 接受了，一起听中') + '</span>';
            } else if (st === 'rejected') {
                footer = '<span class="card-footer-text">' + (dir === 'char' ? '你婉拒了邀请' : 'TA 婉拒了邀请') + '</span>';
            } else if (st === 'expired') {
                footer = '<span class="card-footer-text">邀请已过期</span>';
            } else if (dir === 'char') {
                footer = '<span class="card-footer-text">邀请你一起听歌</span><span class="card-actions"><button class="card-btn" data-act="listen-accept">接收</button><button class="card-btn return-btn" data-act="listen-reject">婉拒</button></span>';
            } else {
                footer = '<span class="card-footer-text">等待 ' + (cardData.toName || '对方') + ' 回应（点右下角回复）</span>';
            }
            return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">一起听</div><div class="card-sub">' + sub + '</div></div></div><div class="card-footer">' + footer + '</div>';
        } else if (cardData.cardType === 'couple') {
            // 情侣空间分享卡片
            const kind = cardData.coupleKind || '';
            const summary = String(cardData.coupleSummary || '').trim();
            const iconMap = {
                survey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
                personality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
                judge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M7 6l-4 8h8L7 6z"/><path d="M17 6l-4 8h8l-4-8z"/><path d="M12 4v16"/><path d="M8 20h8"/></svg>',
                letters: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
                diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z"/><path d="M8 4v16"/></svg>',
                draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>'
            };
            const icon = iconMap[kind] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
            const title = cardData.title || '情侣空间';
            return '<div class="card-main"><div class="icon-wrap">' + icon + '</div><div><div class="card-title">' + title + '</div><div class="card-sub">' + (summary || '来自情侣空间的分享') + '</div></div></div>' +
                '<div class="card-footer"><span class="card-footer-text">来自情侣空间 · 点击卡片查看/让TA分析</span></div>';
        }
        return '';
    }

    // ===== 创建消息行 =====
    function buildRecallContent(text, isCard, cardData, isVoice, transcript, isImage, imageData) {
        if (isImage) {
            const desc = (imageData && (imageData.desc || (imageData.textImage ? '文字图片' : ''))) || '';
            return desc || '一张照片';
        }
        if (isCard && cardData) {
            if (cardData.cardType === 'transfer') return '一笔转账';
            if (cardData.cardType === 'gift') return cardData.title || '一个礼物';
            if (cardData.cardType === 'call') return cardData.missed ? '未接电话' : '一次语音通话';
            if (cardData.cardType === 'listen') return '一起听邀请';
            if (cardData.cardType === 'couple') return cardData.title || '情侣空间分享';
            return cardData.sub || '一条卡片消息';
        }
        if (isVoice) return (transcript && transcript.trim()) ? transcript : '一段语音';
        const t = String(text || '').replace(/\[(?:reply|image|voice|gift|transfer|call|heart)\:[^\]]*\](?:\[reply\:[^\]]*\])?/gi, '').trim();
        if (!t || t === '你撤回了一条消息') return '';
        return t.length > 40 ? t.substring(0, 40) + '…' : t;
    }

    // ===== 思维链（可折叠，展示在气泡上方） =====
    function buildThinkBlock(thinkText) {
        const wrap = document.createElement('div');
        wrap.className = 'msg-think';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-think-toggle';
        btn.textContent = '💭 心声';
        const body = document.createElement('div');
        body.className = 'msg-think-body';
        body.textContent = thinkText;
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            wrap.classList.toggle('open');
        });
        wrap.appendChild(btn);
        wrap.appendChild(body);
        return wrap;
    }

    function createMessageRow(type, text, time, status, id, recalled, isCard, cardData, transcript, translation, quote, isVoice, voiceData, isImage, imageData, grouped) {
        const rowId = id || 'msg_' + (++messageIdCounter);
        const row = document.createElement('div');
        row.className = 'message-row ' + type;
        row.dataset.id = rowId;
        row.dataset.type = type;
        if (recalled) row.classList.add('recalled');
        if (isCard && cardData && cardData.centered) row.classList.add('centered');
        // 系统提示（一起听等）：居中灰框，不带气泡
        if (cardData && cardData.systemNotice) row.classList.add('centered', 'sys-notice');

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.dataset.msgId = rowId;
        if (type === 'left') {
            if (avatarSrc && avatarSrc.trim() !== '') {
                const img = document.createElement('img');
                img.src = avatarSrc;
                avatar.appendChild(img);
            } else {
                avatar.textContent = displayName.charAt(0).toUpperCase();
            }
        } else {
            if (currentUserAvatar && currentUserAvatar.trim() !== '') {
                const img = document.createElement('img');
                img.src = currentUserAvatar;
                avatar.appendChild(img);
            } else {
                avatar.textContent = currentUserName.charAt(0).toUpperCase();
            }
        }
        // 点击由 messageContainer 上的事件委托统一处理（见 DOM 引用处）
        row.appendChild(avatar);

        const content = document.createElement('div');
        content.className = 'message-content';

        // 思维链：优先取消息自身保存的，其次取本轮待挂载的
        const existingThinkMsg = messages.find(m => m.id === rowId);
        let thinkText = '';
        if (type === 'left') {
            thinkText = (existingThinkMsg && existingThinkMsg.think) || pendingTurnThink || '';
            if (thinkText) pendingTurnThink = '';
        }

        if (!recalled) {
        if (thinkText) content.appendChild(buildThinkBlock(thinkText));
        if (isCard) {
            const card = document.createElement('div');
            const extraClass = (cardData.claimed ? ' claimed' : '') +
                (cardData.response ? ' response' : '') +
                ((cardData.status === 'received' || cardData.status === 'returned') ? ' ' + cardData.status : '') +
                (cardData.missed ? ' missed' : '');
            card.className = 'bubble-card ' + type + ' ' + (cardData.cardType || '') + extraClass;
            try { card.innerHTML = buildCardHTML(cardData); } catch (err) { card.innerHTML = ''; }
            content.appendChild(card);
        } else if (isVoice) {
            const vb = createVoiceBubble(type, voiceData?.duration || 3, voiceData?.unread || false, transcript,
                (voiceData && voiceData.ttsText) || transcript);
            content.appendChild(vb);
            if (transcript) {
                const bub = document.createElement('div');
                bub.className = 'bubble ' + (type === 'left' ? 'other' : 'me') + ' voice-transcript-bubble';
                const transDiv = document.createElement('span');
                transDiv.className = 'voice-transcript';
                transDiv.textContent = transcript;
                bub.appendChild(transDiv);
                content.appendChild(bub);
            }
        } else if (isImage) {
            if (imageData && imageData.textImage) {
                const tib = document.createElement('div');
                tib.className = 'text-image-bubble ' + type;
                const tiText = document.createElement('div');
                tiText.className = 'ti-text';
                tiText.textContent = text || (imageData && imageData.desc) || '';
                tib.appendChild(tiText);
                content.appendChild(tib);
            } else if (imageData && imageData.url) {
                const ib = document.createElement('div');
                ib.className = 'image-bubble ' + type;
                const img = document.createElement('img');
                img.src = imageData.url;
                img.alt = imageData.desc || '图片';
                ib.appendChild(img);
                ib.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openImageViewer(imageData.url, id);
                });
                content.appendChild(ib);
            } else {
                const idb = document.createElement('div');
                idb.className = 'image-desc-bubble ' + type;
                idb.innerHTML = '<div class="idb-inner"><span class="idb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#3c4a58" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-5 5-3-3-5 5"/></svg></span><span class="idb-text">' + ((imageData && imageData.desc) || '一张照片') + '</span></div>';
                content.appendChild(idb);
            }
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'bubble ' + (type === 'left' ? 'other' : 'me') + (grouped ? ' grouped' : '');
            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            bubble.appendChild(textSpan);
            if (translation) {
                const transDiv = document.createElement('span');
                transDiv.className = 'translation-text';
                transDiv.textContent = translation;
                bubble.appendChild(transDiv);
            }
            if (transcript) {
                const transDiv = document.createElement('span');
                transDiv.className = 'voice-transcript';
                transDiv.textContent = transcript;
                bubble.appendChild(transDiv);
            }
            content.appendChild(bubble);
            if (quote && quote.text) {
                const qb = document.createElement('div');
                qb.className = 'quote-block ' + type;
                qb.innerHTML = '<span class="quote-fold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg></span><span class="quote-name">' + (quote.name || '') + '</span><span class="quote-text">' + quote.text + '</span>';
                content.appendChild(qb);
            }
        }
        }

        // 系统提示（一起听等）：页面中间小框
        if (cardData && cardData.systemNotice) {
            content.innerHTML = '';
            const sNote = document.createElement('div');
            sNote.className = 'recall-notice';
            sNote.textContent = text || '';
            content.appendChild(sNote);
        }

        // 撤回消息：页面中间小框，单击展开完整内容，双击删除该提示
        if (recalled) {
            content.innerHTML = '';
            const note = document.createElement('div');
            note.className = 'recall-notice';
            const recalledBody = buildRecallContent(text, isCard, cardData, isVoice, transcript, isImage, imageData);
            const fullText = '撤回了一条消息：' + (recalledBody || '');
            note.dataset.full = fullText;
            const shortened = fullText.length > 24 ? fullText.slice(0, 24) + '…' : fullText;
            note.textContent = shortened;
            note.style.cursor = 'pointer';
            note.addEventListener('click', function(ev) {
                ev.stopPropagation();
                if (this.classList.contains('expand')) {
                    this.classList.remove('expand');
                    this.textContent = this.dataset.full && this.dataset.full.length > 24
                        ? this.dataset.full.slice(0, 24) + '…' : this.dataset.full || '';
                } else {
                    this.classList.add('expand');
                    this.textContent = this.dataset.full || '';
                }
            });
            content.appendChild(note);
        }

        row.appendChild(content);

        const existing = messages.find(m => m.id === rowId);
        if (!existing) {
            messages.push({
                id: rowId, type, text, time, status,
                recalled: recalled || false,
                isCard: isCard || false,
                cardData: cardData || null,
                transcript: transcript || null,
                translation: translation || null,
                quote: quote || null,
                isVoice: isVoice || false,
                voiceData: voiceData || null,
                isImage: isImage || false,
                imageData: imageData || null,
                favorite: false,
                turn: null,
                ts: Date.now(),
                think: thinkText || null
            });
        } else {
            if (transcript !== undefined) existing.transcript = transcript;
            if (translation !== undefined) existing.translation = translation;
            if (thinkText && !existing.think) existing.think = thinkText;
        }

        // 左滑直接引用（清理旧的 hide 逻辑）
        if (!recalled && row.dataset.id) {
            setupQuoteSwipeForRow(row, row.dataset.id);
        }

        return row;
    }

    // ===== 左滑直接引用 =====
    function msgSwipeQuoteText(m) {
        if (!m) return '';
        if (m.isImage) return (m.imageData && (m.imageData.desc || (m.imageData.textImage ? '文字图片' : ''))) || '图片';
        if (m.isCard && m.cardData) {
            if (m.cardData.cardType === 'transfer') return '转账';
            if (m.cardData.cardType === 'gift') return m.cardData.title || '礼物';
            if (m.cardData.cardType === 'call') return m.cardData.missed ? '未接电话' : '语音通话';
            if (m.cardData.cardType === 'couple') return m.cardData.title || '情侣空间分享';
            return m.cardData.sub || '卡片消息';
        }
        if (m.isVoice) return m.transcript || '语音';
        return m.text || '';
    }

    function setupQuoteSwipeForRow(row, rowId) {
        let x0 = null, y0 = null;
        row.addEventListener('touchstart', function(e) {
            if (!e.touches || e.touches.length !== 1) return;
            x0 = e.touches[0].clientX;
            y0 = e.touches[0].clientY;
        }, { passive: true });
        row.addEventListener('touchmove', function(e) {
            if (x0 === null || !e.touches || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - x0;
            const dy = e.touches[0].clientY - y0;
            if (dx < -60 && Math.abs(dy) < Math.abs(dx) * 0.6) {
                x0 = null;
                const m = messages.find(function(mm) { return mm.id === rowId; });
                if (!m || m.recalled) return;
                // 左滑直接引用该消息（无需再点按钮）
                setQuote(m.id, msgSwipeQuoteText(m));
            }
        }, { passive: true });
        row.addEventListener('touchend', function() { x0 = null; }, { passive: true });
    }

    // ===== 标签解析 =====
    function extractTagsFromText(text) {
        const results = [];
        let cleaned = text;

        const tagRegex = /\[(transfer|gift|voice|call|heart|image|reply|creategroup|inviteme|acceptinvite|rejectinvite|emoji|sticker|表情包|表情)\s*:\s*([^\]]*?)(?:\]|$)/gi;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            const kind = match[1].toLowerCase();
            let payload = match[2].trim();

            if (kind === 'transfer') {
                const numMatch = payload.match(/^(\d+(?:\.\d{0,2})?)/);
                if (numMatch) payload = numMatch[1];
                else if (payload === '' || payload === '.') payload = '0.00';
                const parsed = parseFloat(payload);
                if (!isNaN(parsed) && parsed > 0) {
                    results.push({ kind: 'transfer', payload: parsed.toFixed(2) });
                }
            } else if (kind === 'gift') {
                if (payload) results.push({ kind: 'gift', payload: payload });
            } else if (kind === 'voice') {
                if (payload) results.push({ kind: 'voice', payload: payload });
            } else if (kind === 'call') {
                results.push({ kind: 'call', payload: payload });
            } else if (kind === 'heart') {
                results.push({ kind: 'heart', payload: payload });
            } else if (kind === 'image') {
                if (payload) results.push({ kind: 'image', payload: payload });
            } else if (kind === 'reply') {
                if (payload) results.push({ kind: 'reply', payload: payload });
            } else if (kind === 'creategroup') {
                if (payload) results.push({ kind: 'creategroup', payload: payload });
            } else if (kind === 'inviteme') {
                if (payload) results.push({ kind: 'inviteme', payload: payload });
            } else if (kind === 'acceptinvite') {
                if (payload) results.push({ kind: 'acceptinvite', payload: payload });
            } else if (kind === 'rejectinvite') {
                if (payload) results.push({ kind: 'rejectinvite', payload: payload });
            } else if (kind === 'emoji' || kind === 'sticker' || kind === '表情包' || kind === '表情') {
                if (payload) results.push({ kind: 'emoji', payload: payload });
            }
        }

        cleaned = text.replace(/\[(transfer|gift|voice|call|heart|image|reply|creategroup|inviteme|acceptinvite|rejectinvite|emoji|sticker|表情包|表情)\s*:\s*[^\]]*?(?:\]|$)/gi, '').trim();

        return { tags: results, cleanedText: cleaned };
    }

    // ===== 核心功能函数 =====
    function scrollToBottom() {
        setTimeout(function() {
            messageScroll.scrollTop = messageScroll.scrollHeight;
        }, 50);
    }

    // ===== 图片查看器 =====
    let ivCurrentSrc = '';
    let ivCurrentMsgId = null;
    function openImageViewer(src, msgId) {
        const viewer = document.getElementById('imageViewer');
        const img = document.getElementById('ivImg');
        if (!viewer || !img) return;
        ivCurrentSrc = src || '';
        ivCurrentMsgId = msgId || null;
        img.src = ivCurrentSrc;
        const msg = ivCurrentMsgId ? messages.find(x => x.id === ivCurrentMsgId) : null;
        const gen = msg && msg.imageData && msg.imageData.genPrompt;
        const rerollBtn = document.getElementById('ivReroll');
        const viewBtn = document.getElementById('ivView');
        if (rerollBtn) rerollBtn.style.display = gen ? 'flex' : 'none';
        if (viewBtn) viewBtn.style.display = gen ? 'flex' : 'none';
        viewer.classList.add('active');
    }
    function closeImageViewer() {
        const viewer = document.getElementById('imageViewer');
        if (viewer) viewer.classList.remove('active');
    }
    function downloadImage() {
        if (!ivCurrentSrc) return;
        try {
            const a = document.createElement('a');
            a.href = ivCurrentSrc;
            a.download = 'image_' + Date.now() + '.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            showAlert('下载失败', String(e && e.message ? e.message : e));
        }
    }
    function rerollCurrentImage() {
        if (!ivCurrentMsgId) return;
        closeImageViewer();
        regenerateChatImage(ivCurrentMsgId);
    }
    function viewCurrentImagePrompt() {
        if (!ivCurrentMsgId) return;
        const msg = messages.find(x => x.id === ivCurrentMsgId);
        if (!msg) return;
        const cur = (msg.imageData && (msg.imageData.genPrompt || msg.imageData.desc)) || '';
        const edited = prompt('查看/修改生图要求（可修改后重新生成）', cur);
        if (edited !== null && edited.trim() !== '' && edited.trim() !== cur) {
            closeImageViewer();
            regenerateChatImage(ivCurrentMsgId, edited.trim());
        }
    }
    const ivClose = document.getElementById('ivClose');
    const ivDownloadBtn = document.getElementById('ivDownload');
    const ivRerollBtn = document.getElementById('ivReroll');
    const ivViewBtn = document.getElementById('ivView');
    if (ivClose) ivClose.addEventListener('click', closeImageViewer);
    if (ivDownloadBtn) ivDownloadBtn.addEventListener('click', downloadImage);
    if (ivRerollBtn) ivRerollBtn.addEventListener('click', rerollCurrentImage);
    if (ivViewBtn) ivViewBtn.addEventListener('click', viewCurrentImagePrompt);

    function showTyping() {
        try {
            if (typingAvatar) {
                if (avatarSrc && String(avatarSrc).trim() !== '') {
                    typingAvatar.innerHTML = '<img src="' + avatarSrc + '" alt="">';
                } else {
                    typingAvatar.textContent = (displayName || characterData && characterData.name || '?').charAt(0).toUpperCase();
                }
            }
        } catch (e) {}
        typingIndicator.classList.add('active');
        // 保证正在输入的三个点始终在消息列表末尾，回复完成前不消失
        renderMessages();
        scrollToBottom();
    }

    function hideTyping() {
        typingIndicator.classList.remove('active');
        // 把“正在输入”节点移回消息容器外，并强制重绘一次，
        // 避免安卓 WebView 上最后几条消息残留旧像素（文字乱、头像点不动）。
        try {
            if (typingIndicator.parentNode === messageContainer && messageContainer.parentNode) {
                messageContainer.parentNode.insertBefore(typingIndicator, messageContainer.nextSibling);
            }
        } catch (e) {}
        try {
            void messageContainer.offsetHeight;
        } catch (e) {}
    }

    function addMessage(type, text, time, status, recalled, isCard, cardData, transcript, translation, quote, isVoice, voiceData, isImage, imageData) {
        const grouped = !recalled && messages.length > 0 && messages[messages.length - 1].type === type;
        const row = createMessageRow(type, text, time, status, null, recalled, isCard, cardData, transcript, translation, quote, isVoice, voiceData, isImage, imageData, grouped);
        // 角色发来的语音：若配置了 TTS，就自动合成播放（点击气泡可重播）
        if (isVoice && type === 'left' && !recalled && window.NanoTTS) {
            try {
                const speakText = (voiceData && voiceData.ttsText) || transcript;
                if (speakText && String(speakText).trim()) window.NanoTTS.speak(speakText);
            } catch (e) {}
        }
        if (type === 'left' && !recalled) {
            const msg = messages.find(m => m.id === row.dataset.id);
            if (msg) msg.turn = currentTurn;
            // 角色偶尔随机撤回自己刚发出的消息
            if (!isImage && !isCard && !isVoice && !translation && !transcript && text && Math.random() < 0.05) {
                (function(mid) {
                    setTimeout(function() {
                        const m = messages.find(mm => mm.id === mid);
                        if (m && !m.recalled && m.turn === currentTurn) {
                            m.recalled = true;
                            renderMessages();
                            saveMessages();
                        }
                    }, 5000 + Math.random() * 9000);
                })(row.dataset.id);
            }
        }
        renderMessages();
        saveMessages();
        // 未读红点 / 最近活跃 / 通知
        try {
            if (window.NanoBadge) {
                if (type === 'right') {
                    window.NanoBadge.activity(chatId);
                } else if (type === 'left' && !recalled) {
                    const __preview = text || (isImage ? '[图片]' : (isVoice ? '[语音]' : (isCard ? '[卡片消息]' : '发来一条消息')));
                    const __title = (characterData && characterData.name) || displayName || '新消息';
                    window.NanoBadge.incoming(chatId, __title, __preview, { target: 'chat:' + chatId });
                }
            }
        } catch (e) {}
        return row;
    }

    async function regenerateChatImage(msgId, overridePrompt) {
        const msg = messages.find(m => m.id === msgId);
        if (!msg) return;
        const raw = overridePrompt || (msg.imageData && (msg.imageData.genPrompt || msg.imageData.desc)) || '图片';
        try {
            const url = await generateImage(buildImagePrompt(raw));
            msg.imageData = { url: url, desc: raw, genPrompt: raw };
            msg.isImage = true;
            msg.text = '';
        } catch (e) {
            showAlert('生图失败', String(e));
            msg.imageData = { textImage: true, desc: raw };
            msg.isImage = true;
            msg.text = raw;
        }
        renderMessages();
        saveMessages();
    }

    function renderMessages(scrollMode) {
        const CHUNK = 100;

        const total = messages.length;
        const lastId = total ? messages[total - 1].id : '';
        const sig = total + '|' + lastId;
        if (sig !== lastCollapseSig) {
            collapseExpanded = 0;
            lastCollapseSig = sig;
        }

        let baseVisible = Math.min(total, CHUNK);
        let startIdx = Math.max(0, total - baseVisible - collapseExpanded);
        const hiddenAbove = startIdx;

        messageContainer.innerHTML = '';

        if (hiddenAbove > 0) {
            const btn = document.createElement('div');
            const reveal = Math.min(CHUNK, hiddenAbove);
            btn.className = 'collapse-btn';
            btn.textContent = '展开「' + reveal + '」';
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                collapseExpanded += reveal;
                renderMessages();
            });
            messageContainer.appendChild(btn);
        }

        for (let i = startIdx; i < total; i++) {
            const msg = messages[i];
            const prevMsg = i > 0 ? messages[i - 1] : null;
            if (prevMsg && prevMsg.ts && msg.ts && (msg.ts - prevMsg.ts) > 5 * 60 * 1000) {
                const divider = document.createElement('div');
                divider.className = 'chat-time-divider';
                const d = new Date(msg.ts);
                const now = new Date();
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                divider.textContent = (d.toDateString() === now.toDateString())
                    ? (hh + ':' + mm)
                    : ((d.getMonth() + 1) + '月' + d.getDate() + '日' + hh + ':' + mm);
                messageContainer.appendChild(divider);
            }
            const grouped = i > startIdx && messages[i - 1].type === msg.type;
            const row = createMessageRow(
                msg.type, msg.text, msg.time, msg.status,
                msg.id, msg.recalled || false,
                msg.isCard || false, msg.cardData || null,
                msg.transcript || null,
                msg.translation || null,
                msg.quote || null,
                msg.isVoice || false, msg.voiceData || null,
                msg.isImage || false, msg.imageData || null,
                grouped
            );
            messageContainer.appendChild(row);
        }
        if (typingIndicator.classList.contains('active')) {
            messageContainer.appendChild(typingIndicator);
        }
        if (pendingJumpMsgId) {
            const target = messageContainer.querySelector('[data-id="' + pendingJumpMsgId + '"]');
            pendingJumpMsgId = null;
            if (target) {
                target.classList.add('jump-highlight');
                setTimeout(function() {
                    const rect = target.getBoundingClientRect();
                    const contRect = messageScroll.getBoundingClientRect();
                    messageScroll.scrollTop = messageScroll.scrollTop + rect.top - contRect.top - 80;
                    setTimeout(function() {
                        target.classList.remove('jump-highlight');
                    }, 2500);
                }, 60);
                return;
            }
        }
        if (scrollMode === 'top') {
            messageScroll.scrollTop = 0;
        } else {
            scrollToBottom();
        }
    }

    function splitMessages(text) {
        let parts = text.split(/\n+/).filter(s => s.trim().length > 0);
        if (parts.length === 0) parts = [text];
        const result = [];
        for (let part of parts) {
            part = part.trim();
            if (!part) continue;
            if (part.length > 20) {
                const subParts = part.split(/(?<=[。！？，;；：:、\s])/).filter(s => s.trim().length > 0);
                let current = '';
                for (let sp of subParts) {
                    if ((current + sp).length <= 20) current += sp;
                    else {
                        if (current) result.push(current.trim());
                        current = sp;
                    }
                }
                if (current) result.push(current.trim());
            } else {
                result.push(part);
            }
        }
        return result.filter(s => s.length > 0);
    }

    // 把一句话按语义断成若干个完整短句（用于外语角色：一句一个气泡）
    function splitIntoSentences(text) {
        const t = String(text || '').replace(/\r/g, '').trim();
        if (!t) return [];
        const parts = t.match(/[^，,、；;。！？!?…\n]+[，,、；;。！？!?…]*/g) || [t];
        return parts
            .map(function(s) { return s.trim().replace(/[，,、；;]+$/, '').trim(); })
            .filter(Boolean);
    }

    function claimCard(msg) {
        msg.cardData.claimed = true;
        msg.cardData.title = msg.cardData.cardType === 'transfer' ? '已收下' : '已查收';
        msg.cardData.footer = msg.cardData.cardType === 'transfer' ? '已收下' : '已查收';
    }

    function addCardResponse(msg, resultType) {
        const opposite = msg.type === 'right' ? 'left' : 'right';
        const cd = msg.cardData;
        const status = resultType === 'receive' ? 'received' : 'returned';
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;
        const respCard = {
            cardType: cd.cardType,
            amount: cd.amount,
            title: cd.title,
            sub: cd.cardType === 'gift' ? (status === 'received' ? '已查收' : '已退还') : cd.sub,
            status: status,
            response: true
        };
        addMessage(opposite, '', timeStr, null, false, true, respCard);
    }

    // ============================================================
    // 银行卡（wallet 银行卡页流水）：只在转账最终「收下」时记流水
    // 规则：我转给对方（被收下）→银行−；我收下对方转账（我收）→银行+
    //       退还/不收 与礼物 一律不动流水；与「记账」页无关。
    // ============================================================
    function openWalletDB() {
        return new Promise(function(resolve, reject) {
            try {
                const req = indexedDB.open('nano_wallet_db', 1);
                req.onupgradeneeded = function(e) {
                    try {
                        const d = e.target.result;
                        if (!d.objectStoreNames.contains('wallet_data')) d.createObjectStore('wallet_data', { keyPath: 'key' });
                        if (!d.objectStoreNames.contains('ledger_data')) d.createObjectStore('ledger_data', { keyPath: 'key' });
                    } catch (e) {}
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }

    function readWalletRecord() {
        return openWalletDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                try {
                    const tx = db.transaction('wallet_data', 'readonly');
                    const r = tx.objectStore('wallet_data').get('wallet_data');
                    r.onsuccess = function() { resolve(r.result ? r.result.value : null); };
                    r.onerror = function() { reject(r.error); };
                    tx.oncomplete = function() { db.close(); };
                } catch (e) { reject(e); }
            });
        });
    }

    function writeWalletRecord(rec) {
        return openWalletDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                try {
                    const tx = db.transaction('wallet_data', 'readwrite');
                    tx.objectStore('wallet_data').put({ key: 'wallet_data', value: rec });
                    tx.oncomplete = function() { db.close(); resolve(rec); };
                    tx.onerror = function() { reject(tx.error); };
                } catch (e) { reject(e); }
            });
        });
    }

    // 金额可能含 ¥ / 千分位符号
    function parseMoneyAmount(raw) {
        if (typeof raw === 'number') return raw;
        const m = String(raw == null ? '' : raw).match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : 0;
    }

    // delta>0 收入（银行+），delta<0 支出（银行−）
    function recordBankFlow(delta, desc) {
        delta = Math.round((Number(delta) || 0) * 100) / 100;
        if (!delta) return Promise.resolve();
        return readWalletRecord().then(function(wd) {
            if (!wd) {
                wd = { balance: 5000, cardNumber: '', bankName: '', transactions: [] };
            }
            wd.balance = Math.round(((typeof wd.balance === 'number' ? wd.balance : 0) + delta) * 100) / 100;
            wd.transactions = wd.transactions || [];
            wd.transactions.unshift({
                id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                type: delta >= 0 ? 'income' : 'expense',
                amount: Math.abs(delta),
                desc: desc || (delta >= 0 ? '收到转账' : '转账'),
                time: new Date().toISOString()
            });
            if (wd.transactions.length > 500) wd.transactions = wd.transactions.slice(0, 500);
            return writeWalletRecord(wd).then(function() {
                try {
                    if (window.parent !== window) {
                        window.parent.postMessage({
                            type: 'walletUpdated',
                            data: { balance: wd.balance, transactions: wd.transactions }
                        }, '*');
                    }
                } catch (e) {}
                try {
                    window.dispatchEvent(new CustomEvent('nanoWalletUpdated', { detail: wd }));
                } catch (e) {}
                return wd;
            });
        });
    }

    // 收下/退还一张待处理卡片。addResponse=false 表示 AI 已用文字回复，不再补一条机械卡片
    function receiveCard(msg, addResponse) {
        if (!msg || !msg.cardData) return;
        const st = msg.cardData.status || 'pending';
        if (st !== 'pending') return;
        msg.cardData.status = 'received';
        msg.cardData.footer = '已接收';
        // 只有转账实际「收下」才写银行卡流水；礼物不动钱
        if (msg.cardData.cardType === 'transfer') {
            const amt = parseMoneyAmount(msg.cardData.amount);
            const who = displayName || chatName || '对方';
            if (msg.type === 'right') {
                // 我发给对方，对方收下 → 我付 → 银行−
                recordBankFlow(-amt, '转账给' + who);
            } else {
                // 对方发给我，我收下 → 我收 → 银行+
                recordBankFlow(amt, '收到 ' + who + ' 的转账');
            }
        }
        if (addResponse !== false) addCardResponse(msg, 'receive');
        renderMessages();
        saveMessages();
    }

    function returnCard(msg, addResponse) {
        if (!msg || !msg.cardData) return;
        const st = msg.cardData.status || 'pending';
        if (st !== 'pending') return;
        msg.cardData.status = 'returned';
        msg.cardData.footer = '已退还';
        // 退还/不收：钱没有真正流动，不写任何流水
        if (addResponse !== false) addCardResponse(msg, 'return');
        renderMessages();
        saveMessages();
    }

    // 用户发来、仍待 AI 表态的转账/礼物卡片（右侧）
    function getPendingUserCards() {
        const out = [];
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (!m || m.recalled) continue;
            if (m.type !== 'right' || !m.isCard || !m.cardData) continue;
            const ct = m.cardData.cardType;
            if (ct !== 'transfer' && ct !== 'gift') continue;
            if ((m.cardData.status || 'pending') !== 'pending') continue;
            out.push(m);
        }
        return out;
    }

    // 从 AI 回复里提取 [收] [不收] [退] 决定，并按顺序结算待处理的用户卡片
    function settleCardsFromReplyText(rawText) {
        let body = String(rawText || '');
        const decisions = [];
        body = body.replace(/\[(收|不收|退)\]/g, function(_, d) {
            decisions.push(d);
            return '';
        });
        if (decisions.length === 0) return { body: body, settled: 0 };
        const pendings = getPendingUserCards();
        let settled = 0;
        for (let i = 0; i < pendings.length && i < decisions.length; i++) {
            if (decisions[i] === '收') receiveCard(pendings[i], true);
            else returnCard(pendings[i], true);
            settled++;
        }
        return { body: body, settled: settled };
    }

    // ===== 一起听：邀请卡片 =====
    // 用户发出、等待角色表态的邀请
    function getPendingListenUserCards() {
        const out = [];
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            if (!m || m.recalled) continue;
            if (m.type !== 'right' || !m.isCard || !m.cardData) continue;
            if (m.cardData.cardType !== 'listen') continue;
            if ((m.cardData.direction || 'user') !== 'user') continue;
            if ((m.cardData.status || 'pending') !== 'pending') continue;
            out.push(m);
        }
        return out;
    }
    function setListenStatus(msg, status) {
        if (!msg || !msg.cardData) return;
        msg.cardData.status = status;
        try { renderMessages(); saveMessages(); } catch (e) {}
    }
    // 一起听：居中系统提示（同时写入聊天记录，角色能读到）
    function addSystemNotice(text) {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        messages.push({
            id: 'sys_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'right', text: text || '', time: h + ':' + m, status: null, recalled: false,
            isCard: false, cardData: { systemNotice: true },
            isVoice: false, voiceData: null, isImage: false, imageData: null,
            quote: null, transcript: null, translation: null, favorite: false, turn: null
        });
        try { renderMessages(); saveMessages(); scrollToBottom(); } catch (e) {}
    }
    function notifyListenAccepted(msg) {
        if (window.parent === window) return;
        try {
            window.parent.postMessage({
                type: 'listenAccepted',
                chatId: chatId,
                charName: displayName || chatName || '',
                song: (msg && msg.cardData && msg.cardData.title) || ''
            }, '*');
        } catch (e) {}
    }
    // 从角色回复里提取 [一起听] / [不听]（含别名），结算用户的邀请
    function settleListenFromReplyText(rawText) {
        let body = String(rawText || '');
        const pendings = getPendingListenUserCards();
        let wantsAccept = /\[一起听\]|\[acceptlisten\]|\[共听\]/.test(body);
        let wantsReject = /\[不听\]|\[rejectlisten\]|\[不共听\]/.test(body);

        // 容错：角色没输出标记，但回复里明显对「一起听」表了态
        if (!wantsAccept && !wantsReject && pendings.length) {
            const flat = body.replace(/\s/g, '');
            if (/(不接受|不同意|不想听|拒绝|婉拒)/.test(flat)) {
                wantsReject = true;
            } else if (/(我接受|接受你的|接受邀请|我同意|同意一起|乐意|好啊|好呀|可以啊|来吧|那就一起听|一起听吧)/.test(flat)) {
                wantsAccept = true;
            } else if (/一起听|这首歌|听歌|换首歌/.test(flat)) {
                if (/(好啊|好呀|可以|来吧|都行|没问题|乐意|那就听|我听|听你的)/.test(flat)) wantsAccept = true;
                else if (/(不了|不想|下次|没空|算了|改天|现在不行|不听了)/.test(flat)) wantsReject = true;
            }
        }

        if (!wantsAccept && !wantsReject) return { body: body, settled: 0 };
        // 本轮已判定角色不方便：即使模型输出了接受，也强制改为婉拒
        if (__listenForceReject && wantsAccept && !wantsReject) { wantsAccept = false; wantsReject = true; }
        body = body.replace(/\[一起听\]|\[不听\]|\[acceptlisten\]|\[rejectlisten\]|\[共听\]|\[不共听\]/g, '')
                   .replace(/\n{3,}/g, '\n\n').trim();
        if (!pendings.length) return { body: body, settled: 0 };
        const msg = pendings[pendings.length - 1];
        if (wantsReject && !wantsAccept) {
            setListenStatus(msg, 'rejected');
            addSystemNotice('对方婉拒了你的「一起听」邀请');
        } else {
            setListenStatus(msg, 'accepted');
            addSystemNotice('对方接受了你的「一起听」邀请，一起听开始');
            notifyListenAccepted(msg);
        }
        return { body: body, settled: 1 };
    }
    // 主回复没给出一起听表态时的兜底：单独问一次模型，保证卡片会有结果
    // 每次邀请有约 25% 概率角色不方便，直接婉拒（太晚/忙/累等）
    let __listenForceReject = false;
    async function decideListenInviteFallback() {
        const pendings = getPendingListenUserCards();
        if (!pendings.length) return;
        const target = pendings[pendings.length - 1];
        let config = null;
        try { config = await getApiConfig(); } catch (e) { config = null; }
        if (!config || !config.mainUrl || !config.mainKey) return;
        const song = (target.cardData && target.cardData.title)
            ? ('《' + target.cardData.title + '》' + (target.cardData.sub ? (' - ' + target.cardData.sub) : ''))
            : '';
        const setting = (characterData && (characterData.setting || characterData.desc || characterData.persona)) || '';
        const sys = '你是「' + (charName || '角色') + '」。' + (setting ? ('\n人设：' + setting + '\n') : '\n') +
            (__listenForceReject
                ? '有人邀请你一起听歌' + (song ? ('（' + song + '）') : '') + '。你现在确实不方便（例如太晚了/明天要早起/工作学习忙/有点累），请按你的说话方式婉拒邀请，只输出一个 JSON：' +
                  '{"accept":false,"reply":"婉拒的一句话（20字以内，说明真实原因）"}'
                : '有人邀请你一起听歌' + (song ? ('（' + song + '）') : '') + '。请按你的性格决定是否接受，只输出一个 JSON：' +
                  '{"accept":true 或 false,"reply":"同意或拒绝时说出的一句话（20字以内，符合你的说话方式）"}');
        try {
            const baseUrl = toV1Base(resolveApiHost(config.mainUrl));
            const res = await fetch(baseUrl + '/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + String(config.mainKey).trim(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: config.mainModel, temperature: 0.9, max_tokens: 160, messages: [{ role: 'system', content: sys }] })
            });
            if (!res.ok) return;
            const data = await res.json();
            const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
            let accepted = null, reply = '';
            const ai = text.indexOf('{'), aj = text.lastIndexOf('}');
            if (ai !== -1 && aj > ai) {
                try {
                    const obj = JSON.parse(text.slice(ai, aj + 1));
                    if (obj && typeof obj.accept !== 'undefined') { accepted = !!obj.accept; reply = String(obj.reply || '').trim(); }
                } catch (e) {}
            }
            if (accepted === null && text) {
                accepted = !/拒绝|不了|不想|下次|没空|算了|改天|现在不行/.test(text);
                reply = String(text).replace(/[{}"\n]/g, ' ').trim().slice(0, 30);
            }
            if (__listenForceReject) {
                accepted = false;
                if (!reply) reply = '今晚太晚啦，改天再一起听吧';
            }
            if (accepted === null) return;
            if (getPendingListenUserCards().length === 0) return; // 期间已经结算过了
            setListenStatus(target, accepted ? 'accepted' : 'rejected');
            if (reply) {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                addMessage('left', reply, hh + ':' + mm, null, false, false, null, null, null, null);
            }
            addSystemNotice(accepted ? '对方接受了你的「一起听」邀请，一起听开始' : '对方婉拒了你的「一起听」邀请');
            if (accepted) notifyListenAccepted(target);
        } catch (e) {}
    }
    // 接收「角色邀请我」的待处理卡片（供 ⋮ 菜单调用）
    // 消费 sessionStorage 里暂存的「我发起的一起听邀请」
    function consumePendingListenInvite() {
        let p = null;
        try { p = JSON.parse(sessionStorage.getItem('nano_pending_listen_invite') || 'null'); } catch (e) {}
        if (!p) return;
        if (String(p.chatId || '') !== String(chatId || '')) return;
        try { sessionStorage.removeItem('nano_pending_listen_invite'); } catch (e) {}
        // 约 25% 概率角色此刻不方便（太晚/忙/累），直接婉拒，避免每次都答应
        __listenForceReject = Math.random() < 0.25;
        // 允许连续/重复邀请：把旧的「还没表态」的邀请标记为已过期，再发新卡片
        messages.forEach(function (m) {
            if (m && !m.recalled && m.isCard && m.cardData && m.cardData.cardType === 'listen' &&
                (m.cardData.direction || 'user') === 'user' && (m.cardData.status || 'pending') === 'pending') {
                m.cardData.status = 'expired';
            }
        });
        messages.push(makeListenCardMsg('pending', p.song || '', p.artist || '', {
            type: 'right', direction: 'user', toName: p.toName || ''
        }));
        try { renderMessages(); saveMessages(); scrollToBottom(); } catch (e) {}
        // 邀请后让角色自动表态（不用等用户再发消息）
        setTimeout(function () {
            try {
                if (getPendingListenUserCards().length > 0) decideListenInviteFallback();
            } catch (e) {}
        }, 700);
    }

    // 消费「一起听已结束」等暂存提示（音乐 App 结束时写入，进入聊天时补上）
    function consumePendingListenNotice() {
        try {
            const key = 'nano_listen_notice_' + chatId;
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            localStorage.removeItem(key);
            let text = raw;
            try { const o = JSON.parse(raw); if (o && o.text) text = o.text; } catch (e) {}
            if (text) { try { addSystemNotice(text); } catch (e) {} }
            return true;
        } catch (e) { return false; }
    }

    function acceptPendingListenInvite() {
        for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m && !m.recalled && m.isCard && m.cardData && m.cardData.cardType === 'listen' &&
                (m.cardData.direction || 'user') === 'char' && (m.cardData.status || 'pending') === 'pending') {
                setListenStatus(m, 'accepted');
                addSystemNotice('你接受了一起听邀请');
                notifyListenAccepted(m);
                return true;
            }
        }
        return false;
    }
    // 角色主动邀请用户一起听（生成一张待用户处理的卡片）
    function createCharListenInvite() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        messages.push({
            id: 'listen_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'left', text: '', time: h + ':' + m, status: null, recalled: false,
            isCard: true,
            cardData: { cardType: 'listen', direction: 'char', status: 'pending', title: '', sub: '' },
            isVoice: false, voiceData: null, isImage: false, imageData: null,
            quote: null, transcript: null, translation: null, favorite: false, turn: null
        });
    }

    function setQuote(msgId, text) {
        quoteTargetId = msgId;
        const quotedMsg = messages.find(m => m.id === msgId);
        if (quotedMsg) {
            const quotedName = quotedMsg.type === 'left' ? displayName : currentUserName;
            quoteName.textContent = quotedName + '：';
            quoteText.textContent = quotedMsg.text || '';
        } else {
            quoteName.textContent = '';
            quoteText.textContent = text || '';
        }
        quoteBar.classList.add('active');
    }

    function clearQuote() {
        quoteTargetId = null;
        quoteBar.classList.remove('active');
        quoteName.textContent = '';
        quoteText.textContent = '';
    }

    quoteCancel.addEventListener('click', clearQuote);

    function jumpToMessage(msgId) {
        const index = messages.findIndex(m => m.id === msgId);
        if (index === -1) return false;
        const CHUNK = 100;
        const baseVisible = Math.min(messages.length, CHUNK);
        const hiddenAbove = Math.max(0, messages.length - baseVisible);
        if (index < hiddenAbove) {
            collapseExpanded = hiddenAbove - index;
        }
        pendingJumpMsgId = msgId;
        renderMessages('jump');
        return true;
    }

    function clearAllMessages() {
        messages.length = 0;
        messageIdCounter = 0;
        currentTurn = 0;
        collapseExpanded = 0;
        lastCollapseSig = '';
        pendingJumpMsgId = null;
        renderMessages();
        saveMessages();
    }

    // ===== 主动发消息：按设定间隔由角色定时发一句（内容仅来自 API） =====
    function nowHHMM() {
        const n = new Date();
        return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
    }
    function notifyCharMessage(preview) {
        try {
            const title = displayName || chatName || '新消息';
            if (window.NanoBadge) window.NanoBadge.incoming(chatId, title, preview, { target: 'chat:' + chatId, channel: 'chat' });
            if (window.NanoNotify) window.NanoNotify.notify(title, preview, { target: 'chat:' + chatId, channel: 'chat' });
        } catch (e) {}
    }
    // 供「更多 → 其他」显示自动生成的倒计时
    function updateAutoStatus(kind, on, mins) {
        try {
            const st = JSON.parse(localStorage.getItem('nano_auto_status') || '{}') || {};
            st[kind] = on
                ? { on: true, mins: Math.max(1, parseInt(mins, 10) || 1), nextAt: Date.now() + Math.max(1, parseInt(mins, 10) || 1) * 60000 }
                : { on: false };
            st.at = Date.now();
            localStorage.setItem('nano_auto_status', JSON.stringify(st));
        } catch (e) {}
    }
    async function generateProactiveMessage() {
        suppressApiAlerts = true;
        try {
            const reply = await callApi('（现在没有新消息，你突然想找对方说句话。请主动发一条自然、简短的消息，不要问“在吗”。）');
            if (reply) {
                const parsed = extractTagsFromText(reply);
                const line = String(parsed.cleanedText || '').split(/\n+/).map(function(s){ return s.trim(); }).filter(Boolean)[0] || '';
                if (line) return line;
            }
        } catch (e) {} finally { suppressApiAlerts = false; }
        return '';
    }

    function setAutoMsgState(enabled, intervalMinutes) {
        if (autoMsgTimer) {
            clearInterval(autoMsgTimer);
            autoMsgTimer = null;
        }
        updateAutoStatus('msg', enabled, parseInt(intervalMinutes, 10) || 8);
        if (!enabled) return;
        const mins = Math.max(1, parseInt(intervalMinutes, 10) || 8);
        autoMsgTimer = setInterval(function() {
            updateAutoStatus('msg', true, mins);
            if (isProcessingApi || isWaitingForReply) return;
            // 后台（页面隐藏/切走）也照样生成并推送，不再跳过
            (async function() {
                if (isProcessingApi || isWaitingForReply) return;
                isProcessingApi = true;
                try {
                    const line = await generateProactiveMessage();
                    if (!line) return;
                    addMessage('left', line, nowHHMM(), null, false, false, null, null, null, null);
                    saveMessages();
                    notifyCharMessage(String(line).slice(0, 60));
                } catch (e) {
                } finally { isProcessingApi = false; }
            })();
        }, mins * 60 * 1000);
    }

    // ===== 主动发朋友圈：按设定间隔自动调用 API 生成并写入朋友圈 =====
    function getMomentsArray() {
        try {
            const raw = localStorage.getItem('nano_moments_data');
            const a = raw ? JSON.parse(raw) : [];
            return Array.isArray(a) ? a : [];
        } catch (e) { return []; }
    }
    function getCurrentMaskId() {
        try {
            const raw = localStorage.getItem('nano_mask_data') || localStorage.getItem('nano_home_data');
            if (raw) {
                const d = JSON.parse(raw);
                if (d && Array.isArray(d.masks) && d.masks.length) {
                    if (d.currentMaskId) return String(d.currentMaskId);
                    if (d.masks[0] && d.masks[0].id) return String(d.masks[0].id);
                }
            }
        } catch (e) {}
        try { if (currentUser && currentUser.id) return String(currentUser.id); } catch (e) {}
        return 'default';
    }
    // 写入朋友圈数据：优先写 IndexedDB（moments 页主存储），同时更新 localStorage 兜底
    function saveMomentPost(post) {
        return new Promise(function(resolve) {
            let done = false;
            const finish = function() { if (!done) { done = true; resolve(); } };
            try {
                // localStorage 兜底
                try {
                    const arr = getMomentsArray().filter(function(m) { return m && m.id !== post.id; });
                    arr.unshift(post);
                    localStorage.setItem('nano_moments_data', JSON.stringify(arr));
                } catch (e) {}
                if (!('indexedDB' in window)) { finish(); return; }
                const req = indexedDB.open('NanoMomentsDB', 1);
                req.onupgradeneeded = function(e) {
                    const d = e.target.result;
                    if (!d.objectStoreNames.contains('moments')) d.createObjectStore('moments', { keyPath: 'id' });
                };
                req.onsuccess = function(e) {
                    try {
                        const d = e.target.result;
                        const tx = d.transaction('moments', 'readwrite');
                        tx.objectStore('moments').put(post);
                        tx.oncomplete = finish;
                        tx.onerror = finish;
                    } catch (err) { finish(); }
                };
                req.onerror = finish;
            } catch (e) { finish(); }
        });
    }
    async function generateAutoMoment() {
        const config = await getApiConfig();
        if (!config || !config.mainUrl || !config.mainKey || !config.mainModel) return null;
        const setting = characterData ? (characterData.setting || characterData.desc || characterData.persona || '') : '';
        const uName = (currentUser && currentUser.name) || currentUserName || '用户';
        const now = new Date();
        const timeStr = nowHHMM();
        let mem = '';
        try { mem = (__memHints || []).slice(-6).map(function (h) { return h.text || ''; }).filter(Boolean).join('\n'); } catch (e) {}
        const sys = '你是「' + (displayName || charName || '角色') + '」，一个真实的人。请发一条朋友圈动态。严格贴合你的人设与你们的关系，像真人发朋友圈一样自然，禁止 AI 腔、禁止解释、禁止出戏。\n' +
            '只输出一个 JSON，不要多余内容：{"text":"动态文案","wantImage":true 或 false,"imagePrompt":"若想配图，描述这张照片的画面；不配图则留空","location":"地点或空字符串"}';
        const userMsg = (setting ? ('【你的人设】\n' + setting.slice(0, 600) + '\n\n') : '') +
            (mem ? ('【最近发生的事】\n' + mem + '\n\n') : '') +
            '【现在】' + timeStr + '（' + uName + '在你的好友里）。发一条自然的朋友圈。';
        suppressApiAlerts = true;
        let content = null;
        try {
            content = await callMainApiRaw([{ role: 'system', content: sys }, { role: 'user', content: userMsg }], 500, 0.95);
        } catch (e) {} finally { suppressApiAlerts = false; }
        if (!content) return null;
        let obj = null;
        const ai = content.indexOf('{'), aj = content.lastIndexOf('}');
        if (ai > -1 && aj > ai) { try { obj = JSON.parse(content.slice(ai, aj + 1)); } catch (e) {} }
        if (!obj || !obj.text) return null;
        return obj;
    }
    async function postAutoMoment() {
        if (isProcessingApi) return;
        isProcessingApi = true;
        try {
            const obj = await generateAutoMoment();
            if (!obj) return;
            const post = {
                id: 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
                author: displayName || chatName || '角色',
                avatar: avatarSrc || '',
                text: String(obj.text || '').slice(0, 500),
                images: [],
                time: new Date().toISOString(),
                location: obj.location || '',
                likes: [],
                comments: []
            };
            const wantImage = !!obj.wantImage;
            const imgPrompt = String(obj.imagePrompt || obj.text || '').trim();
            const allowMomentImage = getChatSetting('allowMomentImage', false);
            if (wantImage && allowMomentImage && momentImageRoundDue()) {
                try {
                    const url = await generateImage(imgPrompt);
                    if (url) { post.images = [url]; post.genPrompt = imgPrompt; }
                } catch (e) {}
            }
            // 没开启生图但想要照片：用文字照片（白色正方形 + 黑色文字描述）
            if (wantImage && (!post.images || !post.images.length)) post.imageText = imgPrompt;
            post.maskId = getCurrentMaskId();
            await saveMomentPost(post);
            try { if (window.parent !== window) window.parent.postMessage({ type: 'momentsDataUpdated' }, '*'); } catch (e) {}
            try {
                if (window.NanoNotify) window.NanoNotify.notify(displayName || '朋友圈', (displayName || '') + ' 发了条朋友圈：' + String(post.text).slice(0, 50), { target: 'moments', channel: 'moment' });
            } catch (e) {}
        } finally { isProcessingApi = false; }
    }
    function setAutoMomentState(enabled, intervalMinutes) {
        if (autoMomentTimer) { clearInterval(autoMomentTimer); autoMomentTimer = null; }
        updateAutoStatus('moment', enabled, parseInt(intervalMinutes, 10) || 12);
        if (!enabled) return;
        const mins = Math.max(1, parseInt(intervalMinutes, 10) || 12);
        autoMomentTimer = setInterval(function() { updateAutoStatus('moment', true, mins); postAutoMoment(); }, mins * 60 * 1000);
    }

    // ===== 发送语音气泡弹窗 =====
    function openVoiceSheet() {
        const ov = document.getElementById('voiceSheetOverlay');
        if (!ov) return;
        const rec = document.getElementById('vsRecipient');
        if (rec) rec.textContent = displayName || chatName || '对方';
        // 重置弹窗状态
        const vsInput = document.getElementById('vsInput');
        if (vsInput) vsInput.value = '';
        const vsStatus = document.getElementById('vsStatus');
        if (vsStatus) { vsStatus.textContent = '轻点上方切换语音方式'; vsStatus.classList.remove('done'); }
        const vsStrip = document.getElementById('vsStrip');
        if (vsStrip) vsStrip.style.display = 'none';
        const tabT = document.getElementById('vsTabText');
        const tabV = document.getElementById('vsTabVoice');
        if (tabT) tabT.classList.add('active');
        if (tabV) tabV.classList.remove('active');
        const rb = document.getElementById('vsRecordBtn');
        if (rb) { rb.classList.remove('recording'); rb.style.display = 'none'; }
        const rt = document.getElementById('vsRecordText');
        if (rt) rt.textContent = '点击开始录音';
        const ri = document.getElementById('vsRecordIcon');
        if (ri) ri.className = 'fas fa-microphone';
        ov.classList.add('active');
        if (window.__voiceRecorder && typeof window.__voiceRecorder.stop === 'function') window.__voiceRecorder.stop();
    }

    function closeVoiceSheet() {
        const ov = document.getElementById('voiceSheetOverlay');
        if (ov) ov.classList.remove('active');
        if (window.__voiceRecorder && typeof window.__voiceRecorder.stop === 'function') window.__voiceRecorder.stop();
    }
    window.__closeVoiceSheet = closeVoiceSheet;

    function sendVoiceMsg(transcript) {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;
        const dur = Math.max(3, Math.ceil((transcript || '').length / 4));
        addMessage('right', '', timeStr, null, false, false, null, transcript || null, null, null,
            true, { duration: dur });
        messageInput.value = '';
        isWaitingForReply = true;
        sendBtn.classList.add('reply-mode');
        sendBtn.innerHTML = '<i class="fas fa-reply"></i>';
        scrollToBottom();
        closeVoiceSheet();
        console.log('[Chat] 用户发送语音气泡', transcript);
    }
    window.__sendVoiceMsg = sendVoiceMsg;

    // ============================================================
    // 表情包弹窗 + 输入推荐（与 emoji 页共用 peach_home_data）
    // ============================================================
    const emojiPanelOverlay = document.getElementById('emojiPanelOverlay');
    const emojiGroupsEl = document.getElementById('emojiGroups');
    const emojiGridEl = document.getElementById('emojiGrid');
    const emojiEmptyEl = document.getElementById('emojiEmpty');
    const emojiRecommendEl = document.getElementById('emojiRecommend');
    const emojiPanelClose = document.getElementById('emojiPanelClose');
    let emojiData = null;
    let currentEmojiGroupId = null;

    function getEmojiData() {
        return new Promise(function(resolve) {
            try {
                if (emojiData) { resolve(emojiData); return; }
                if (typeof indexedDB === 'undefined') { resolve(null); return; }
                const req = indexedDB.open('nano_api_db', 2);
                req.onupgradeneeded = function(e) {
                    try {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' });
                        if (!db.objectStoreNames.contains('emoji_data')) db.createObjectStore('emoji_data', { keyPath: 'key' });
                    } catch (e) {}
                };
                req.onsuccess = function(e) {
                    try {
                        const db = e.target.result;
                        const tx = db.transaction('emoji_data', 'readonly');
                        const g = tx.objectStore('emoji_data').get('nano_emoji_data');
                        g.onsuccess = function() {
                            const val = g.result ? g.result.value : null;
                            if (val && val.emojiGroups) { emojiData = val; resolve(val); return; }
                            // 兼容旧键 peach_home_data
                            const gOld = tx.objectStore('emoji_data').get('peach_home_data');
                            gOld.onsuccess = function() {
                                const oldVal = gOld.result ? gOld.result.value : null;
                                if (oldVal && oldVal.emojiGroups) { emojiData = oldVal; resolve(oldVal); return; }
                                try {
                                    const raw = localStorage.getItem('nano_emoji_data') || localStorage.getItem('peach_home_data');
                                    if (raw) {
                                        const d = JSON.parse(raw);
                                        if (d && d.emojiGroups) { emojiData = d; resolve(d); return; }
                                    }
                                } catch (e) {}
                                resolve(null);
                            };
                            gOld.onerror = function() { resolve(null); };
                        };
                        g.onerror = function() { resolve(null); };
                    } catch (e) { resolve(null); }
                };
                req.onerror = function() { resolve(null); };
            } catch (e) { resolve(null); }
        });
    }

    // 按名称查找用户添加的表情包（供角色用 [emoji:名称] 调用）
    function findEmojiByName(name) {
        return getEmojiData().then(function(d) {
            if (!d || !d.emojiGroups) return null;
            const all = [];
            d.emojiGroups.forEach(function(g) { (g.emojis || []).forEach(function(e) { if (e) all.push(e); }); });
            const q = String(name || '').trim().toLowerCase();
            if (!q) return null;
            let hit = all.find(function(e) { return String(e.name || '').trim().toLowerCase() === q; });
            if (!hit) {
                hit = all.find(function(e) {
                    const n = String(e.name || '').trim().toLowerCase();
                    return n && (n.indexOf(q) !== -1 || q.indexOf(n) !== -1);
                });
            }
            return hit || null;
        }).catch(function() { return null; });
    }
    // 供系统提示词同步读取：已有表情包名称列表
    function getEmojiNamesForPrompt() {
        try {
            if (!emojiData || !Array.isArray(emojiData.emojiGroups)) return [];
            const names = [];
            emojiData.emojiGroups.forEach(function(g) {
                (g.emojis || []).forEach(function(e) { if (e && e.name) names.push(String(e.name)); });
            });
            return Array.from(new Set(names));
        } catch (e) { return []; }
    }

    function renderEmojiGroups(groups) {
        emojiGroupsEl.innerHTML = '';
        groups.forEach(function(g) {
            const tab = document.createElement('button');
            tab.className = 'ep-group-tab' + (g.id === currentEmojiGroupId ? ' active' : '');
            tab.textContent = g.name || '未命名';
            tab.addEventListener('click', function() {
                currentEmojiGroupId = g.id;
                renderEmojiPanel();
            });
            emojiGroupsEl.appendChild(tab);
        });
    }

    function renderEmojiGrid(group) {
        emojiGridEl.innerHTML = '';
        if (!group || !group.emojis || group.emojis.length === 0) {
            emojiEmptyEl.style.display = 'block';
            return;
        }
        emojiEmptyEl.style.display = 'none';
        group.emojis.forEach(function(e) {
            const wrap = document.createElement('div');
            wrap.className = 'ep-item';
            const img = document.createElement('img');
            img.src = e.url;
            img.alt = e.name || '';
            img.loading = 'lazy';
            wrap.appendChild(img);
            const name = document.createElement('div');
            name.className = 'ep-item-name';
            name.textContent = e.name || '';
            wrap.appendChild(name);
            wrap.addEventListener('click', function() { sendEmojiImage(e); });
            emojiGridEl.appendChild(wrap);
        });
    }

    function renderEmojiPanel() {
        getEmojiData().then(function(d) {
            const groups = (d && d.emojiGroups) || [];
            if (groups.length === 0) {
                emojiGroupsEl.innerHTML = '';
                emojiGridEl.innerHTML = '';
                emojiEmptyEl.style.display = 'block';
                return;
            }
            if (!currentEmojiGroupId || !groups.some(function(g) { return g.id === currentEmojiGroupId; })) {
                currentEmojiGroupId = groups[0].id;
            }
            renderEmojiGroups(groups);
            renderEmojiGrid(groups.find(function(g) { return g.id === currentEmojiGroupId; }));
        });
    }

    function openEmojiPanel() {
        if (!emojiPanelOverlay) return;
        emojiPanelOverlay.classList.add('active');
        renderEmojiPanel();
    }
    function closeEmojiPanel() {
        if (emojiPanelOverlay) emojiPanelOverlay.classList.remove('active');
    }
    window.__closeEmojiPanel = closeEmojiPanel;

    function sendEmojiImage(emoji) {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;
        addMessage('right', '', timeStr, null, false, false, null, null, null, null,
            false, null, true, { url: emoji.url, desc: emoji.name || '表情包', emojiName: emoji.name || '', isEmoji: true });
        closeEmojiPanel();
        hideEmojiRecommend();
        if (messageInput) messageInput.value = '';
        isWaitingForReply = true;
        sendBtn.classList.add('reply-mode');
        sendBtn.innerHTML = '<i class="fas fa-reply"></i>';
        scrollToBottom();
    }

    function hideEmojiRecommend() {
        if (emojiRecommendEl) { emojiRecommendEl.innerHTML = ''; emojiRecommendEl.classList.add('hidden'); }
    }

    function showEmojiRecommend(emojis) {
        if (!emojiRecommendEl) return;
        emojiRecommendEl.innerHTML = '';
        emojis.slice(0, 8).forEach(function(e) {
            const item = document.createElement('div');
            item.className = 'er-item';
            const img = document.createElement('img');
            img.src = e.url;
            img.alt = e.name || '';
            img.loading = 'lazy';
            item.appendChild(img);
            item.addEventListener('click', function() { sendEmojiImage(e); });
            emojiRecommendEl.appendChild(item);
        });
        emojiRecommendEl.classList.remove('hidden');
    }

    function updateEmojiRecommend() {
        const text = messageInput.value.trim();
        if (!text) { hideEmojiRecommend(); return; }
        getEmojiData().then(function(d) {
            if (!d || !d.emojiGroups) { hideEmojiRecommend(); return; }
            const all = [];
            d.emojiGroups.forEach(function(g) { (g.emojis || []).forEach(function(e) { all.push(e); }); });
            const q = text.toLowerCase();
            // 关键词 + 近义词扩展
            const synMap = {
                '难过': ['难过', '伤心', '委屈', '流泪', '呜呜', '哭唧唧'],
                '开心': ['开心', '哈哈', '哈哈哈', '高兴', '嘻嘻', '快乐'],
                '生气': ['生气', '愤怒', '气死', '烦', '恼火'],
                '喜欢': ['喜欢', '亲亲', '爱你', '抱抱', '么么'],
                '晚安': ['晚安', '晚安啦', '睡啦', '好梦', '睡觉'],
                '早安': ['早安', '早', '起床', '您好'],
                '谢谢': ['谢谢', '感谢', '多谢'],
                '饿': ['饿', '饿了', '好饿', '饿死', '干饭', '吃货'],
                '累': ['累', '疲惫', '好累', '没力气', '困'],
                '厉害': ['厉害', '牛', '棒', '不错', '可以', '优秀', '赞']
            };
            let keywords = [q];
            Object.keys(synMap).forEach(function(k) {
                if (q.indexOf(k) !== -1 || k.indexOf(q) !== -1) {
                    keywords = keywords.concat(synMap[k]);
                }
            });
            keywords = Array.from(new Set(keywords));
            const matches = all.filter(function(e) {
                const n = (e.name || '').toLowerCase();
                if (!n) return false;
                return keywords.some(function(kw) { return n.indexOf(kw) !== -1 || kw.indexOf(n) !== -1; });
            });
            if (matches.length > 0) showEmojiRecommend(matches);
            else hideEmojiRecommend();
        });
    }

    if (emojiBtn) {
        emojiBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openEmojiPanel();
        });
    }
    if (emojiPanelClose) {
        emojiPanelClose.addEventListener('click', closeEmojiPanel);
    }
    if (emojiPanelOverlay) {
        emojiPanelOverlay.addEventListener('click', function(e) {
            if (e.target === emojiPanelOverlay) closeEmojiPanel();
        });
    }
    if (messageInput) {
        messageInput.addEventListener('input', updateEmojiRecommend);
        messageInput.addEventListener('input', updateSendButtonMode);
    }

    function sendMessage() {
        let text = messageInput.value.trim();
        if (!text) return;
        let quoteObj = null;
        if (quoteTargetId) {
            const quotedMsg = messages.find(m => m.id === quoteTargetId);
            if (quotedMsg && quotedMsg.text) {
                const quotedName = quotedMsg.type === 'left' ? displayName : currentUserName;
                quoteObj = { name: quotedName, text: quotedMsg.text };
            }
            clearQuote();
        }
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;

        // 普通文字消息
        addMessage('right', text, timeStr, null, false, false, null, null, null, quoteObj);
        messageInput.value = '';
        isWaitingForReply = true;
        sendBtn.classList.add('reply-mode');
        sendBtn.innerHTML = '<i class="fas fa-reply"></i>';
        scrollToBottom();
        console.log('[Chat] 用户发送消息', text);
    }

    // ===== AI 主动来电（点击回复后由 AI 根据对话内容通过 [call:] 触发）=====
    function triggerIncomingCall(scenario) {
        const url = 'voice-call.html?chat=' + encodeURIComponent(chatId) +
                    '&name=' + encodeURIComponent(displayName) +
                    '&incoming=1';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'aiProactiveVoiceCall',
                chatId: chatId,
                name: displayName,
                scenario: scenario || '通话'
            }, '*');
        } else {
            // iframe 环境兜底：直接打开来电页面
            try { window.open(url, '_blank'); } catch (e) {}
        }
        console.log('[Chat] 触发 AI 主动来电，场景', scenario || '通话');
    }

    // ===== 把消息转成 AI 能理解的文字 =====
    function describeMsgForAI(m) {
        if (!m || m.recalled) return '';
        if (m.isCard && m.cardData) {
            const cd = m.cardData;
            if (cd.systemNotice) return m.text || '';
            const who = m.type === 'right' ? '用户' : '角色';
            const status = cd.status || 'pending';
            const isResp = cd.response;
            if (cd.cardType === 'transfer') {
                const amount = cd.amount || '';
                const note = cd.title ? '（备注：' + cd.title + '）' : '';
                if (isResp) {
                    if (status === 'received') return who + '已接收这笔转账' + amount + note;
                    if (status === 'returned') return who + '退还了这笔转账' + amount + note;
                    return who + '对这笔转账作出回应' + amount + note;
                }
                if (status === 'received') return who + (m.type === 'right' ? '发来的那笔转账已被接收' : '发出的转账已被接收') + '：' + amount + note;
                if (status === 'returned') return who + (m.type === 'right' ? '发来的那笔转账已被退还' : '发出的转账已被退还') + '：' + amount + note;
                return who + (m.type === 'right' ? '发来一笔转账' : '给对方转账') + '：' + amount + note;
            } else if (cd.cardType === 'gift') {
                const name = cd.title || '';
                if (isResp) {
                    if (status === 'received') return who + '已查收这份礼物：' + name;
                    if (status === 'returned') return who + '退还了这份礼物' + name;
                    return who + '对这份礼物作出回复：' + name;
                }
                if (status === 'received') return who + (m.type === 'right' ? '送出的礼物已被查收' : '收到的礼物已查收') + '：' + name;
                if (status === 'returned') return who + (m.type === 'right' ? '送出的礼物已被退还' : '收到的礼物已退还') + '：' + name;
                return who + (m.type === 'right' ? '赠送了礼物' : '送了礼物') + '：' + name;
            } else if (cd.cardType === 'call') {
                return who + (cd.missed ? ' 的语音电话未接听' : ' 进行了一次语音通话');
            } else if (cd.cardType === 'invite') {
                const st = status === 'accepted' ? '（已同意）' : (status === 'rejected' ? '（已拒绝）' : '（待处理）');
                const dir = cd.direction === 'user' ? '用户邀请你加入群聊' : ((cd.fromName || '角色') + '邀请用户加入群聊');
                return dir + '「' + (cd.groupName || '') + '」' + st;
            } else if (cd.cardType === 'listen') {
                const st = status === 'accepted' ? '（已同意）' : (status === 'rejected' ? '（已婉拒）' : (status === 'expired' ? '（已过期）' : '（等待回应）'));
                const song = cd.title ? ('《' + cd.title + '》' + (cd.sub ? (' - ' + cd.sub) : '')) : '';
                if ((cd.direction || 'user') === 'user') {
                    return '用户给你发来一张「一起听」邀请卡片' + (song ? ('，邀请你一起听' + song) : '，邀请你一起听歌') + st + '（这是卡片消息，不是空白）';
                }
                    return '你给用户发了一张「一起听」邀请卡片' + (song ? ('，想和TA一起听' + song) : '') + st;
            } else if (cd.cardType === 'couple') {
                const title = cd.title || '情侣空间';
                const detail = String(cd.coupleDetail || cd.coupleSummary || '').trim();
                return '用户从「情侣空间」分享了一张「' + title + '」的结果卡片给你，让你一起看并说说你的真实想法。卡片内容：\n' +
                    (detail || '(卡片没有更多内容)') + '\n（请认真阅读卡片里的内容，结合你的人物设定回应和分析，不要当成空白消息。）';
            }
            return '';
        }
        if (m.isImage) {
            if (m.text && m.text.trim()) return m.text;
            if (m.imageData) {
                if (m.imageData.textImage) return '用户发送了文字图片：' + m.imageData.textImage;
                if (m.imageData.desc) return '用户发送了一张图片：' + m.imageData.desc;
            }
            return '用户发送了一张图片';
        }
        if (m.isVoice) {
            return (m.type === 'right' ? '用户' : '角色') + '发送了一条语音（时长' + (m.voiceData && m.voiceData.duration ? m.voiceData.duration : '3') + '秒）' + (m.transcript ? '，内容：' + m.transcript : '');
        }
        let t = m.text || '';
        // 引用消息：让 AI 知道用户正在回复它之前说的那句
        if (m.quote && m.quote.text && m.type === 'right') {
            t = t + '（用户正在回复你之前说的：「' + m.quote.text + '」）';
        }
        return t;
    }

    // ===== 组合生图提示词 =====
    function buildImagePrompt(desc) {
        const basePrompt = getChatSetting('imagePrompt', '') || '';
        return (basePrompt ? basePrompt + '\n' : '') + (desc || '');
    }

    // ===== 判断用户消息是否为生图请求 =====
    function isImageRequest(text) {
        if (!text) return false;
        const t = text.trim();
        return /^(画|绘制|生成)/.test(t) ||
               /(画|绘制|生成).{0,8}(图片|图|画|照片|壁纸|插画|头像|图像|图案)/.test(t) ||
               /(生成|画|来).{0,8}(图片|照片|壁纸|插画|头像|图|画)/.test(t) ||
               /(帮我|给我|请|来).{0,8}(图片|图|画|照片|壁纸|插画|头像)/.test(t);
    }

    // ===== 调用生图 API =====
    async function generateImage(prompt) {
        const config = await getApiConfig();
        const imgUrl = config && (config.imgUrl || '').trim();
        const imgKey = config && (config.imgKey || '').trim();
        const imgModel = config && (config.imgModel || '').trim();
        if (!config || !imgUrl) {
            throw new Error('未配置生图 API');
        }
        if (!imgKey) {
            throw new Error('未配置生图 Key');
        }
        if (!imgModel) {
            throw new Error('未配置生图模型');
        }
        const faceRef = getChatSetting('faceRef', '') || '';
        let body = { model: imgModel, prompt: prompt, n: 1, size: '1024x1024' };
        if (faceRef && faceRef.trim() !== '') {
            body.reference_image = [faceRef];
            body.input_reference_image = [faceRef];
        }
            let baseUrl = toV1Base(resolveApiHost(imgUrl));
        let response;
        try {
            response = await fetch(baseUrl + '/images/generations', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + imgKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
        } catch (e) {
            throw new Error(e && e.message ? e.message : '生图请求失败');
        }
        if (!response.ok) {
            let apiMsg = '';
            try {
                const d = await response.json();
                apiMsg = (d && d.error && d.error.message) || (d && d.message) || '';
            } catch (e) {}
            const baseMsg = describeHttpError(response.status);
            throw new Error(apiMsg ? baseMsg + '\n服务端信息：' + apiMsg : baseMsg);
        }
        const data = await response.json();
        const item = data && data.data && data.data[0];
        if (item && item.url) return item.url;
        if (item && item.b64_json) return 'data:image/png;base64,' + item.b64_json;
        throw new Error('生图接口未返回图片');
    }

    // ===== 单聊请求：交给父页面发起，切页/离开也能后台生成；结果缓存到 localStorage =====
    function chatPendingKey() { return 'chat_reply_pending_' + chatId; }
    function chatReqKey() { return 'chat_req_' + chatId; }
    function chatPendingGet() { try { return localStorage.getItem(chatPendingKey()); } catch (e) { return null; } }
    function chatPendingSet(v) { try { if (v) localStorage.setItem(chatPendingKey(), String(Date.now())); else localStorage.removeItem(chatPendingKey()); } catch (e) {} }
    function storeChatRequest(payload) { try { localStorage.setItem(chatReqKey(), JSON.stringify(payload)); } catch (e) {} }
    function loadStoredChatRequest() { try { const raw = localStorage.getItem(chatReqKey()); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function clearChatRequest() { try { localStorage.removeItem(chatReqKey()); } catch (e) {} }

    function sendChatRequest(payload) {
        return new Promise(function(resolve) {
            const resultKey = 'chat_api_result_' + payload.token;
            let settled = false;
            let poll = null;
            function finish(res) {
                if (settled) return;
                settled = true;
                if (poll) clearInterval(poll);
                window.removeEventListener('message', onMsg);
                resolve(res);
            }
            function takeResult() {
                try {
                    const raw = localStorage.getItem(resultKey);
                    if (raw) { localStorage.removeItem(resultKey); finish(JSON.parse(raw)); return true; }
                } catch (e) {}
                return false;
            }
            function onMsg(e) {
                if (e && e.data && e.data.type === 'chatApiDone' && e.data.token === payload.token) {
                    if (!takeResult()) finish({ ok: false, status: 0, error: '未取到结果' });
                }
            }
            if (takeResult()) return;
            window.addEventListener('message', onMsg);
            if (window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'chatApiFetch', token: payload.token, resultKey: resultKey,
                        url: payload.url, method: payload.method, headers: payload.headers, body: payload.body
                    }, '*');
                } catch (e) { finish({ ok: false, status: 0, error: '无法请求' }); return; }
                // 兜底轮询：父页面刷新丢消息时，结果仍会写到 localStorage
                let tries = 0;
                poll = setInterval(function() {
                    tries++;
                    if (takeResult()) return;
                    if (tries > 900) finish({ ok: false, status: 0, error: '请求超时' });
                }, 1000);
            } else {
                fetch(payload.url, { method: payload.method, headers: payload.headers, body: payload.body })
                    .then(function(r) { return r.text().then(function(t) { return { ok: r.ok, status: r.status, text: t }; }); })
                    .catch(function(err) { return { ok: false, status: 0, error: String(err && err.message || err) }; })
                    .then(finish);
            }
        });
    }

    async function callApi(userMessage) {
        const config = await getApiConfig();
        if (!config) {
            if (!suppressApiAlerts) showAlert('配置错误', 'API 未配置，请先在「API」页面配置主 API。\n注意：手机端与电脑是不同来源，需要在手机打开的页面里单独填写一次；若填写的是 localhost/127.0.0.1 的本地 API，会自动改用当前局域网地址。');
            return null;
        }
        try {
            let baseUrl = toV1Base(resolveApiHost(config.mainUrl));
            const key = config.mainKey.trim();
            const model = config.mainModel;

            let userMessages = [];
            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (m.type === 'left' && !m.recalled) {
                    break;
                }
                if (m.type === 'right' && !m.recalled) {
                    const desc = describeMsgForAI(m);
                    if (desc) userMessages.unshift(desc);
                }
            }
            
            if (userMessages.length === 0) {
                const desc = describeMsgForAI(messages[messages.length - 1]);
                userMessages = desc ? [desc] : [userMessage];
            }

            const history = [];
            history.push({ role: 'system', content: buildSystemPrompt() });

            let previousMessages = [];
            let foundAI = false;
            for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (!foundAI && m.type === 'left' && !m.recalled) {
                    // 找到最近一条 AI 回复：把它也纳入历史，模型才知道自己上一句说了什么
                    foundAI = true;
                }
                if (foundAI) {
                    previousMessages.unshift(m);
                }
            }

            let prevCount = 0;
            for (let i = previousMessages.length - 1; i >= 0; i--) {
                const m = previousMessages[i];
                const desc = describeMsgForAI(m);
                if (!m.recalled && desc && prevCount < __memContextLimit) {
                    history.push({ role: m.type === 'right' ? 'user' : 'assistant', content: desc });
                    prevCount++;
                }
            }

            userMessages.forEach(text => {
                if (text && text.trim()) {
                    history.push({ role: 'user', content: text });
                }
            });

            if (history.length > 0 && history[history.length - 1].role !== 'user') {
                const tail = (userMessage && String(userMessage).trim()) ? userMessage : '（请继续）';
                history.push({ role: 'user', content: tail });
            }

            const payload = {
                token: 'creq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                url: baseUrl + '/chat/completions',
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: history,
                    max_tokens: 1200,
                    temperature: (typeof config.mainTemp === 'number' ? config.mainTemp : parseFloat(config.mainTemp)) || 0.7
                })
            };
            storeChatRequest(payload);
            const result = await sendChatRequest(payload);

            if (!result || !result.ok) {
                let apiMsg = '';
                try {
                    const errData = JSON.parse((result && result.text) || '{}');
                    apiMsg = (errData && errData.error && errData.error.message) || (errData && errData.message) || '';
                } catch (e) {}
                if (result && result.error) {
                    if (!suppressApiAlerts) showAlert('网络错误', '无法连接 API 服务器\n' + result.error);
                } else {
                    const baseMsg = describeHttpError(result ? result.status : 0);
                    const finalMsg = apiMsg ? baseMsg + '\n\n服务端信息：' + apiMsg : baseMsg;
                    if (!suppressApiAlerts) showAlert('API 错误（' + (result ? result.status : '') + '）', finalMsg);
                }
                return null;
            }

            const data = JSON.parse(result.text || '{}');
            return data.choices?.[0]?.message?.content || null;
        } catch (error) {
            console.error('[Chat API] 异常', error);
            const addr = (typeof baseUrl !== 'undefined' && baseUrl)
                ? baseUrl
                : ((typeof config !== 'undefined' && config && config.mainUrl) ? config.mainUrl : '');
            if (!suppressApiAlerts) showAlert('网络错误', '无法连接 API 服务器（' + addr + '）\n' + (error.message || error.name || '未知错误') + '\n\n提示：手机与电脑是不同环境。若 API 地址填的是 localhost/127.0.0.1，请在手机上改填电脑的局域网 IP（例如 http://192.168.x.x:端口），再重新测试连接。');
            return null;
        }
    }

    // 去除模型可能输出的思考链 / 信息标签 / HTML 标签
    function cleanReplyText(raw) {
        if (typeof raw !== 'string') return raw;
        let s = raw;
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/\[(?:Info|info|Thought|thought|思考|推理|Reasoning)[\s\S]*?\]/g, '');
        s = s.replace(/^(?:思考过程|推理过程|让我们一步步|好的，我先|好，我来)[^\n]*\n?/g, '');
        s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
        return s.trim();
    }

    function findGroupByName(name) {
        try {
            const reg = JSON.parse(localStorage.getItem('nano_groups_data') || '{}') || {};
            const groups = Array.isArray(reg.groups) ? reg.groups : [];
            return groups.find(function (g) { return g && g.name === name; }) || null;
        } catch (e) { return null; }
    }
    function getGroupsForChar() {
        try {
            const reg = JSON.parse(localStorage.getItem('nano_groups_data') || '{}') || {};
            const groups = Array.isArray(reg.groups) ? reg.groups : [];
            const cid = currentChatIdSafe();
            const cname = displayName || '';
            return groups.filter(function (g) {
                if (!g) return false;
                const names = [];
                try {
                    const gd = JSON.parse(localStorage.getItem('group_data_' + g.id) || 'null');
                    if (gd && Array.isArray(gd.members)) gd.members.forEach(function (m) { names.push(m && m.id); names.push(m && m.name); });
                } catch (e) {}
                if (Array.isArray(g.members)) g.members.forEach(function (x) { names.push(x); });
                if (Array.isArray(g.memberNames)) g.memberNames.forEach(function (x) { names.push(x); });
                return names.indexOf(cid) > -1 || (!!cname && names.indexOf(cname) > -1);
            });
        } catch (e) { return []; }
    }
    // 生成一张“邀请你入群”的卡片（不立即入群，等用户点同意）
    function createInviteCardForGroup(group, fromName, timeStr) {
        if (!group) return;
        try {
            let inv = (window.GroupInvites ? window.GroupInvites.list() : []).find(function (x) {
                return x && x.status === 'pending' && x.direction === 'char' && x.groupId === group.id;
            });
            if (!inv && window.GroupInvites) {
                inv = window.GroupInvites.add({ groupId: group.id, groupName: group.name, fromName: fromName || displayName || '角色', direction: 'char', status: 'pending' });
            }
            addMessage('left', '', timeStr || '', null, false, true, {
                cardType: 'invite', inviteId: inv ? inv.id : '', groupId: group.id,
                groupName: group.name, fromName: fromName || displayName || '角色', direction: 'char', status: 'pending'
            });
        } catch (e) {}
    }
    // 在群聊消息流里插入一条系统提示（居中灰条），让“xx邀请了xx进群”立即出现在群聊里
    function appendGroupSystemTip(groupId, text) {
        if (!groupId || !text) return;
        try {
            var key = 'group_msgs_' + groupId;
            var arr = [];
            try { arr = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) { arr = []; }
            var maxId = 0;
            arr.forEach(function (m) {
                var n = parseInt(String((m && m.id) || '').replace('msg_', ''), 10);
                if (n > maxId) maxId = n;
            });
            var now = new Date();
            var time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            arr.push({ id: 'msg_' + (maxId + 1), type: 'left', isTip: true, text: text, time: time });
            localStorage.setItem(key, JSON.stringify(arr.slice(-400)));
        } catch (e) {}
    }
    // 角色根据人设/世界书自建群聊（群主是角色本人；可含带人设的 NPC）
    // 说明：群聊个数不限；若标签没有给出 NPC 人设，最多调用 2 次 API 来补全人设。
    const GROUP_BG = ['#2c5fb1','#b1552c','#2c7a3e','#6d2cb1','#d96f3a','#0a84ff','#ff375f','#30d158'];
    function currentChatIdSafe() {
        try { return new URLSearchParams(location.search).get('chat') || 'char'; } catch (e) { return 'char'; }
    }
    // 直接向主 API 发一次请求（用于建群时生成 NPC 人设，最多 2 次）
    function callMainApiRaw(messages, maxTokens, temperature) {
        return getApiConfig().then(function (config) {
            if (!config || !config.mainUrl || !config.mainKey || !config.mainModel) return null;
            const baseUrl = toV1Base(resolveApiHost(config.mainUrl));
            return fetch(baseUrl + '/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + String(config.mainKey).trim(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: config.mainModel,
                    messages: messages,
                    max_tokens: maxTokens || 700,
                    temperature: (typeof temperature === 'number') ? temperature : 0.85
                })
            }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
                return (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || null;
            }).catch(function () { return null; });
        }).catch(function () { return null; });
    }
    // NPC 名字合理性：真人名长度与字符范围，过滤乱码/怪名/占位名
    function isNormalNpcName(nm) {
        nm = String(nm || '').trim();
        if (!nm || nm.length > 12) return false;
        if (!/^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·.\- ]*$/.test(nm)) return false;
        const bad = ['旅行者', '旅行家', '冒险者', '新朋友', '老朋友', '老友', '朋友', '群友', '同事', '同学', '邻居', '路人', '陌生人', '网友', '某人', '神秘人', '好友', '群成员', '成员', '用户', '玩家', '角色', 'npc', '未知', '老板', '闺蜜', '兄弟', '姐妹'];
        const lower = nm.toLowerCase();
        for (let i = 0; i < bad.length; i++) { if (lower.indexOf(bad[i]) > -1) return false; }
        if (/^(老|小|阿)[\u4e00-\u9fa5A-Za-z]$/.test(nm)) return false;
        if (/^[A-Za-z]$/.test(nm)) return false;
        if (/^[甲乙丙丁戊己庚辛壬癸]$/.test(nm)) return false;
        return true;
    }
    // 解析“名字=人设,名字=人设”
    function parseGroupSpecs(str) {
        return String(str || '').split(/[,，、；]/).map(function (s) {
            s = String(s || '').trim();
            if (!s) return null;
            const eq = s.indexOf('=');
            const nm = (eq > -1 ? s.slice(0, eq) : s).trim();
            const st = eq > -1 ? s.slice(eq + 1).trim() : '';
            if (!nm || !isNormalNpcName(nm)) return null;
            return { name: nm.slice(0, 20), setting: st };
        }).filter(Boolean);
    }
    // 解析 API 返回的 NPC 行：名字：人设 / 名字|人设 / 名字=人设
    function parseNpcGeneration(content) {
        return String(content || '').split(/\n+/).map(function (line) {
            line = line.replace(/^[\s\-\*\d.、）)]+/, '').trim();
            const m = line.match(/^([^：:]{1,20})\s*[：:]\s*([\s\S]+)$/);
            if (!m) return null;
            const nm = m[1].trim();
            const st = m[2].trim();
            if (!nm || !st || !isNormalNpcName(nm)) return null;
            return { name: nm.slice(0, 20), setting: st };
        }).filter(Boolean);
    }
    // 用 API 生成 NPC 人设（最多 2 次调用）；names 为空则整组生成 2~4 个
    async function generateNpcSpecs(gname, names) {
        const selfName = displayName || '角色';
        const selfSetting = (characterData && (characterData.setting || characterData.desc || characterData.persona)) ? String(characterData.setting || characterData.desc || characterData.persona).slice(0, 700) : '';
        const uName = (currentUser && currentUser.name) || currentUserName || '用户';
        const uSetting = (currentUser && currentUser.setting) ? String(currentUser.setting).slice(0, 400) : '';
        let wbText = '';
        try {
            const wb = getWorldbookText(currentChatIdSafe());
            wbText = [wb.front, wb.middle].filter(Boolean).join('\n').slice(0, 1600);
        } catch (e) { wbText = ''; }
        const wantNames = (names || []).filter(Boolean);
        const sys = '你在帮角色「' + selfName + '」构思群聊「' + gname + '」里的群成员（NPC）。\n' +
            '硬性要求：\n' +
            '1. 这些 NPC 都是' + selfName + '在现实中真实认识的人（家人/朋友/同事/同学/邻居等），和' + selfName + '、和「' + uName + '」都有具体关系。\n' +
            '2. 名字必须是符合该角色国籍与世界观的真实人名：中文角色用正常的中文姓名（如「陈屿」「林晚」），外国角色用该国真实姓名（如「Emily Carter」「佐藤健」）；禁止使用任何占位式/泛称名字，例如：旅行者、旅行家、冒险者、新朋友、老朋友、老友、朋友、群友、同事、同学、邻居、路人、陌生人、网友、某人、小A、老张、小李、甲乙丙丁、A、B、NPC、角色、神秘人 等。不要用“老X/小X”这种随便的称呼当人名。\n' +
            '3. 如果【世界书】或【' + selfName + '的人设】里已经出现了具体的相关人物（家人/朋友/同事等），必须优先使用这些已有人物的真实名字，不要另造无关的人。\n' +
            '4. 人设要贴合' + selfName + '的世界观与生活背景，写清：身份、性格、说话习惯、与' + selfName + '的关系、与' + uName + '的关系。\n' +
            '5. 不同 NPC 之间要有区分度，不要都是同一种性格。\n' +
            (wantNames.length ? ('6. 请为这些已有名字分别补全人设，名字必须保持原样：' + wantNames.join('、') + '。\n') : '') +
            '输出：每个人独立一行，格式严格为：名字|人设。人设 25~70 字。只输出这些行，不要编号、不要解释、不要多余内容。';
        const userMsg = (selfSetting ? ('【' + selfName + '的人设】\n' + selfSetting + '\n\n') : '') +
            (wbText ? ('【世界书】\n' + wbText + '\n\n') : '') +
            '【用户】' + uName + (uSetting ? ('\n' + uSetting) : '') + '\n' +
            '【群名】' + gname + '\n' +
            (wantNames.length ? ('【需要补全的人设】' + wantNames.join('、')) : '【请生成 2~4 个合理的群成员】');
        for (let attempt = 0; attempt < 2; attempt++) {
            const content = await callMainApiRaw([
                { role: 'system', content: sys },
                { role: 'user', content: userMsg }
            ], 800, 0.9);
            if (!content) continue;
            const parsed = parseNpcGeneration(content);
            if (parsed && parsed.length) return parsed;
        }
        return [];
    }
    async function createGroupFromTag(payload) {
        try {
            const parts = String(payload || '').split('|');
            const gname = (parts[0] || '新群').trim() || '新群';
            const charId = currentChatIdSafe();
            const selfName = displayName || '角色';
            let specs = parseGroupSpecs(parts.slice(1).join('|'));

            // 人设缺失时调用 API 补全（最多 2 次）；仍失败则用基本人设兜底
            const needApi = specs.length === 0 || specs.some(function (s) { return !s.setting; });
            if (needApi) {
                const generated = await generateNpcSpecs(gname, specs.map(function (s) { return s.name; }));
                if (generated.length) {
                    if (!specs.length) {
                        specs = generated.slice(0, 5);
                    } else {
                        const byName = {};
                        generated.forEach(function (g) { byName[g.name] = g.setting; });
                        specs.forEach(function (s) { if (!s.setting) s.setting = byName[s.name] || ''; });
                        generated.forEach(function (g) {
                            if (specs.length < 5 && !specs.some(function (s) { return s.name === g.name; })) specs.push(g);
                        });
                    }
                }
            }
            specs = specs.map(function (s, i) {
                return {
                    name: s.name,
                    setting: s.setting || (s.name + '是群聊「' + gname + '」里的成员，' + selfName + '的朋友，性格随和、说话自然。')
                };
            }).slice(0, 6);

            const members = [{
                id: charId, name: selfName, nick: selfName, initial: selfName.charAt(0),
                bg: GROUP_BG[0], avatar: (characterData && characterData.avatar) || '',
                role: '群主', title: '群主', level: 1, msgCount: 0
            }];
            specs.forEach(function (s, i) {
                members.push({
                    id: 'npc_' + Date.now() + '_' + i, name: s.name, nick: s.name, initial: s.name.charAt(0),
                    bg: GROUP_BG[(i + 1) % GROUP_BG.length], avatar: '', role: '成员', title: '',
                    level: 1, msgCount: 0, isNpc: true, setting: s.setting
                });
            });

            let reg = {};
            try { reg = JSON.parse(localStorage.getItem('nano_groups_data') || '{}') || {}; } catch (e) { reg = {}; }
            if (!Array.isArray(reg.groups)) reg.groups = [];
            let group = reg.groups.find(function (x) { return x && x.name === gname; });
            if (!group) {
                group = {
                    id: 'g' + Date.now(), name: gname, avatar: '',
                    members: members.map(function (m) { return m.id; }),
                    memberNames: members.map(function (m) { return m.name; }),
                    createdBy: charId, ownerName: selfName, createdAt: Date.now(), pending: true
                };
                reg.groups.unshift(group);
                localStorage.setItem('nano_groups_data', JSON.stringify(reg));
            }
            localStorage.setItem('group_data_' + group.id, JSON.stringify({
                name: gname, notice: '', avatar: '', ownerId: charId, ownerName: selfName, members: members, userLeft: true
            }));
            // 用户是被邀请进群的一方，进群后身份为普通成员
            try {
                const skey = 'group_settings_' + group.id;
                const st = JSON.parse(localStorage.getItem(skey) || 'null') || {};
                st.myTitle = '成员';
                localStorage.setItem(skey, JSON.stringify(st));
            } catch (e) {}
            if (!localStorage.getItem('group_msgs_' + group.id)) localStorage.setItem('group_msgs_' + group.id, JSON.stringify([]));
            try { if (window.parent !== window) window.parent.postMessage({ type: 'groupChatCreated', groupId: group.id }, '*'); } catch (e) {}
            createInviteCardForGroup(group, selfName);
        } catch (e) {}
    }
    // 角色邀请用户进入已存在的群
    function inviteMeToGroupFromTag(payload) {
        try {
            const parts = String(payload || '').split('|');
            const gname = (parts[0] || '').trim();
            if (!gname) return;
            const group = findGroupByName(gname);
            if (!group) return;
            createInviteCardForGroup(group, displayName || '角色');
        } catch (e) {}
    }
    // 用户点“同意”加入群聊
    function acceptGroupInvite(msg) {
        try {
            const cd = msg.cardData || {};
            const gid = cd.groupId;
            if (!gid) return;
            const key = 'group_data_' + gid;
            const gd = JSON.parse(localStorage.getItem(key) || 'null') || {};
            gd.userLeft = false;
            localStorage.setItem(key, JSON.stringify(gd));
            // 角色自建的群：群主是角色，用户进群后是普通成员
            try {
                if (gd.ownerId && gd.ownerId !== 'me') {
                    const skey = 'group_settings_' + gid;
                    const st = JSON.parse(localStorage.getItem(skey) || 'null') || {};
                    st.myTitle = '成员';
                    localStorage.setItem(skey, JSON.stringify(st));
                }
            } catch (e) {}
            try {
                const pk = 'group_pending_changes_' + gid;
                const arr = JSON.parse(localStorage.getItem(pk) || '[]') || [];
                arr.push('「' + (cd.fromName || '角色') + '」邀请你加入了群聊，你已可以发言');
                localStorage.setItem(pk, JSON.stringify(arr));
            } catch (e) {}
            if (cd.inviteId && window.GroupInvites) window.GroupInvites.update(cd.inviteId, { status: 'accepted' });
            cd.status = 'accepted';
            // 同意后群聊才出现在聊天页：确保注册表里有这个群，并标记 pending=false
            try {
                const reg2 = JSON.parse(localStorage.getItem('nano_groups_data') || '{}') || {};
                if (!Array.isArray(reg2.groups)) reg2.groups = [];
                let gEntry = reg2.groups.find(function(x){ return x && x.id === gid; });
                if (!gEntry) {
                    const gdata = JSON.parse(localStorage.getItem('group_data_' + gid) || 'null') || {};
                    gEntry = {
                        id: gid,
                        name: gdata.name || cd.groupName || '群聊',
                        avatar: gdata.avatar || '',
                        ownerName: gdata.ownerName || (cd.fromName || '角色'),
                        members: Array.isArray(gdata.members) ? gdata.members.map(function(m){ return m && (m.id || m.name); }).filter(Boolean) : [],
                        memberNames: Array.isArray(gdata.members) ? gdata.members.map(function(m){ return m && (m.nick || m.name); }).filter(Boolean) : [],
                        createdAt: Date.now()
                    };
                    reg2.groups.unshift(gEntry);
                }
                gEntry.pending = false;
                localStorage.setItem('nano_groups_data', JSON.stringify(reg2));
            } catch (e) {}
            renderMessages();
            saveMessages();
            try { if (window.parent !== window) window.parent.postMessage({ type: 'groupChatCreated', groupId: gid }, '*'); } catch (e) {}
            try { if (window.parent !== window) window.parent.postMessage({ type: 'groupsDataUpdated' }, '*'); } catch (e) {}
        } catch (e) {}
    }
    function rejectGroupInvite(msg) {
        try {
            const cd = msg.cardData || {};
            if (cd.inviteId && window.GroupInvites) window.GroupInvites.update(cd.inviteId, { status: 'rejected' });
            cd.status = 'rejected';
            renderMessages();
            saveMessages();
        } catch (e) {}
    }
    // 用户邀请角色入群：角色本轮回复带 [acceptinvite]/[rejectinvite]
    function markUserInviteResult(status) {
        try {
            const charId = currentChatIdSafe();
            if (!window.GroupInvites) return null;
            const inv = (window.GroupInvites.list() || []).find(function (x) {
                return x && x.direction === 'user' && x.toCharId === charId && x.status === 'pending';
            });
            if (!inv) return null;
            window.GroupInvites.update(inv.id, { status: status });
            const msg = messages.find(function (m) { return m.cardData && m.cardData.inviteId === inv.id; });
            if (msg) { msg.cardData.status = status; renderMessages(); saveMessages(); }
            return inv;
        } catch (e) { return null; }
    }
    function acceptUserInvite(groupId) {
        try {
            const inv = markUserInviteResult('accepted');
            const gid = groupId || (inv && inv.groupId);
            if (!gid) return;
            const charId = currentChatIdSafe();
            const charName = (characterData && characterData.name) || displayName || '角色';
            let reg = {};
            try { reg = JSON.parse(localStorage.getItem('nano_groups_data') || '{}') || {}; } catch (e) { reg = {}; }
            const groups = Array.isArray(reg.groups) ? reg.groups : [];
            const g = groups.find(function (x) { return x && x.id === gid; });
            const key = 'group_data_' + gid;
            const gd = JSON.parse(localStorage.getItem(key) || 'null') || {};
            if (!Array.isArray(gd.members)) gd.members = [];
            if (!gd.members.some(function (m) { return m && (m.id === charId || m.name === charName); })) {
                gd.members.push({
                    id: charId, name: charName, nick: charName, initial: charName.charAt(0),
                    bg: '#007aff', avatar: (characterData && characterData.avatar) || '',
                    role: '成员', title: '', level: 1, msgCount: 0
                });
            }
            localStorage.setItem(key, JSON.stringify(gd));
            // 群主是角色时，用户只是普通成员
            try {
                if (gd.ownerId && gd.ownerId !== 'me') {
                    const skey = 'group_settings_' + gid;
                    const st = JSON.parse(localStorage.getItem(skey) || 'null') || {};
                    st.myTitle = '成员';
                    localStorage.setItem(skey, JSON.stringify(st));
                }
            } catch (e) {}
            if (g) {
                if (!Array.isArray(g.members)) g.members = [];
                if (g.members.indexOf(charId) === -1) g.members.push(charId);
                if (!Array.isArray(g.memberNames)) g.memberNames = [];
                if (g.memberNames.indexOf(charName) === -1) g.memberNames.push(charName);
                localStorage.setItem('nano_groups_data', JSON.stringify(reg));
            }
            const inviterName = (inv && inv.fromName) || '角色';
            // 群聊里立即出现一条系统提示：xx 邀请了 xx 进群
            appendGroupSystemTip(gid, '「' + inviterName + '」邀请「' + charName + '」加入了群聊');
            try { if (window.parent !== window) window.parent.postMessage({ type: 'groupChatCreated', groupId: gid }, '*'); } catch (e) {}
        } catch (e) {}
    }
    function rejectUserInvite(groupId) {
        markUserInviteResult('rejected');
    }
    // 进入私聊时，若有待处理的“邀请角色入群”，展示邀请卡片（由用户发出）
    function showPendingUserInvite() {
        try {
            if (!window.GroupInvites) return;
            const inv = window.GroupInvites.findPendingFor(currentChatIdSafe());
            if (!inv) return;
            if (messages.some(function (m) { return m.cardData && m.cardData.inviteId === inv.id; })) return;
            const realName = (characterData && characterData.name) || displayName || '角色';
            // 用户自己发出的邀请卡片：放在右侧（用户这边），带头像，不居中
            addMessage('right', '', '', null, false, true, {
                cardType: 'invite', inviteId: inv.id, groupId: inv.groupId, groupName: inv.groupName,
                direction: 'user', toName: realName, fromName: inv.fromName || '角色', status: 'pending'
            });
        } catch (e) {}
    }

    // 私聊中“把我拉回xx群”：角色同意则解除群聊的退群状态
    function handleReinviteRequest(reply, quoteTarget) {
        const ask = (quoteTarget && quoteTarget.text) ? String(quoteTarget.text) : '';
        if (!ask) return;
        const mReq = ask.match(/(?:把我|拉我|请把我|能不能把)[^「'"。！？\n]{0,10}(?:拉回|拉进|拉入|邀请进|加回|加进|重新加入)?[^「'"。！？\s]{1,20}/);
        if (!mReq) return;
        const gname = mReq[1].replace(/^[「'"']/, '').trim();
        if (!gname) return;
        let groups = [];
        try {
            const d = JSON.parse(localStorage.getItem('nano_groups_data') || '{}');
            groups = Array.isArray(d.groups) ? d.groups : [];
        } catch (e) { groups = []; }
        const g = groups.find(function (x) {
            const n = x && x.name ? String(x.name) : '';
            return n && (n.indexOf(gname) > -1 || gname.indexOf(n) > -1);
        });
        if (!g) return;
        const neg = /(不行|不可以|不能|拒绝|不要|没法|帮不了|抱歉|不方便)/.test(reply);
        const pos = /(好啊|好的|好呀|好|可以|行|没问题|这就|拉你|邀请|加回|拉回|当然|OK|ok)/.test(reply);
        if (!(pos && !neg)) return;
        try {
            const key = 'group_data_' + g.id;
            const gd = JSON.parse(localStorage.getItem(key) || 'null') || {};
            gd.userLeft = false;
            localStorage.setItem(key, JSON.stringify(gd));
        } catch (e) {}
        try {
            const pk = 'group_pending_changes_' + g.id;
            const arr = JSON.parse(localStorage.getItem(pk) || '[]') || [];
            arr.push('「' + (displayName || '角色') + '」把「' + (currentUserName || '你') + '」拉回了群聊，你又能发言了');
            localStorage.setItem(pk, JSON.stringify(arr));
        } catch (e) {}
    }

    async function processReply(reply, quoteTarget) {
        if (!reply) return;

        reply = cleanReplyText(reply);
        if (!reply) return;

        // 私聊里请求“把我拉回某个群”：角色同意则解除退群状态，并给群聊留言
        try { handleReinviteRequest(reply, quoteTarget); } catch (e) {}

        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;

        currentTurn++;

        const foreign = isForeignChar();

        // 先从整段回复里提取心声标签（允许出现换行/换段），并从正文中移除，避免被当成普通消息
        let roundHeart = null;
        let replyBody = reply;
        const heartMatch = reply.match(/\[heart\s*:\s*([\s\S]*?)\]/i);
        if (heartMatch) {
            const payload = heartMatch[1].trim();
            const sep = payload.indexOf('||');
            if (sep !== -1) {
                roundHeart = {
                    subject: payload.slice(0, sep).trim(),
                    thought: payload.slice(sep + 2).trim()
                };
            } else {
                roundHeart = { subject: '', thought: payload.trim() };
            }
            replyBody = reply.replace(heartMatch[0], '').trim();
        }

        // 思维链：提取 [think]...[/think]（或 【思考】...【/思考】），挂到本轮第一条角色气泡上方的可折叠区
        let roundThink = '';
        const thinkMatch = replyBody.match(/\[think\]([\s\S]*?)\[\/think\]/i);
        const cnThinkMatch = replyBody.match(/【(?:think|思考|思维链)】([\s\S]*?)【\/(?:think|思考|思维链)】/i);
        if (thinkMatch) {
            roundThink = thinkMatch[1].trim();
            replyBody = replyBody.replace(thinkMatch[0], '').trim();
        } else if (cnThinkMatch) {
            roundThink = cnThinkMatch[1].trim();
            replyBody = replyBody.replace(cnThinkMatch[0], '').trim();
        }
        pendingTurnThink = roundThink || '';

        // AI 对「用户发来的转账/礼物」表态（[收]/[不收]/[退]）：
        // 收下转账→银行−；不收/退还→不动流水；礼物一律不动流水
        const moneySettle = settleCardsFromReplyText(replyBody);
        replyBody = moneySettle.body;

        // AI 对「一起听邀请」表态（[一起听]/[不听]），或主动邀请用户（[邀请一起听]）
        const listenSettle = settleListenFromReplyText(replyBody);
        replyBody = listenSettle.body;
        // 主回复没表态 → 兜底单独问一次，保证邀请卡片一定会变成接受/婉拒
        if (!listenSettle.settled && getPendingListenUserCards().length > 0) {
            decideListenInviteFallback();
        }
        if (replyBody.indexOf('[邀请一起听]') !== -1) {
            replyBody = replyBody.replace(/\[邀请一起听\]/g, '').trim();
            setTimeout(function () {
                try { createCharListenInvite(); renderMessages(); saveMessages(); scrollToBottom(); } catch (e) {}
            }, 320);
        }

        // 外国人：一句完整的话 = 一个气泡（外文在上、中文在下），不再整段塞进同一个气泡
        if (foreign && replyBody) {
            const segLines = replyBody.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
            const pairs = [];
            for (let li = 0; li < segLines.length; li++) {
                const parsed = extractTagsFromText(segLines[li]);
                for (let ti = 0; ti < parsed.tags.length; ti++) {
                    const tag = parsed.tags[ti];
                    if (tag.kind === 'voice') {
                        const raw = String(tag.payload || '');
                        const sep = raw.indexOf('|');
                        const dur = parseInt(sep > -1 ? raw.slice(0, sep) : raw) || 6;
                        let content = (sep > -1 ? raw.slice(sep + 1) : '').trim();
                        let zh = '';
                        const di = content.indexOf('||');
                        if (di > -1) { zh = content.slice(di + 2).trim(); content = content.slice(0, di).trim(); }
                        let display = content;
                        if (zh) display = content ? (content + '\n' + zh) : zh;
                        const vrow = addMessage('left', '', timeStr, null, false, false, null, display || null, null, null, true, { duration: dur, unread: true, ttsText: content || display });
                        // 没有中文翻译时，自动翻译后再补到语音转文字下方（外语角色的语音要看懂）
                        if (!zh && content) {
                            const vmid = vrow && vrow.dataset ? vrow.dataset.id : '';
                            translateToZh(content).then(function(zh2) {
                                if (!zh2) return;
                                const vm = messages.find(function(x) { return x.id === vmid; });
                                if (vm) { vm.transcript = content + '\n' + zh2; renderMessages(); saveMessages(); }
                            }).catch(function() {});
                        }
                    } else if (tag.kind === 'emoji') {
                        const em = await findEmojiByName(tag.payload);
                        if (em && em.url) {
                            addMessage('left', '', timeStr, null, false, false, null, null, null, null, false, null, true, { url: em.url, desc: em.name || '表情包', emojiName: em.name || '' });
                        }
                    } else if (tag.kind === 'transfer') {
                        addMessage('left', '', timeStr, null, false, true, { cardType: 'transfer', amount: '¥' + tag.payload, title: '转账', footer: '待领取' });
                    } else if (tag.kind === 'gift') {
                        addMessage('left', '', timeStr, null, false, true, { cardType: 'gift', title: '送出礼物', sub: tag.payload || '一份心意', footer: '点击领取' });
                    } else if (tag.kind === 'call') {
                        triggerIncomingCall('通话');
                    } else if (tag.kind === 'creategroup') {
                        try { createGroupFromTag(tag.payload); } catch (e) {}
                    } else if (tag.kind === 'inviteme') {
                        try { inviteMeToGroupFromTag(tag.payload); } catch (e) {}
                    }
                }
                const text = parsed.cleanedText || '';
                if (!text) continue;
                const idx = text.indexOf('||');
                const f = (idx > -1 ? text.slice(0, idx) : text).trim();
                const z = idx > -1 ? text.slice(idx + 2).trim() : '';
                if (!f) continue;
                const fSeg = splitIntoSentences(f);
                const zSeg = z ? splitIntoSentences(z) : [];
                if (fSeg.length <= 1) { pairs.push({ f: f, z: z }); continue; }
                fSeg.forEach(function(fs, i) { pairs.push({ f: fs, z: zSeg[i] || '' }); });
            }
            for (let i = 0; i < pairs.length; i++) {
                const p = pairs[i];
                if (!p || !p.f) continue;
                if (i > 0) await new Promise(r => setTimeout(r, 420));
                addMessage('left', p.f, timeStr, null, false, false, null, null, p.z || null, null);
            }
            // 心声挂到本轮角色消息
            if (roundHeart && (roundHeart.subject || roundHeart.thought)) {
                for (let i = messages.length - 1; i >= 0; i--) {
                    const m = messages[i];
                    if (m.type === 'left' && m.turn === currentTurn) {
                        m.heart = { subject: roundHeart.subject, thought: roundHeart.thought };
                    }
                }
            }
            saveMessages();
            return;
        }

        const lines = replyBody.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
        let sentCount = 0;
        let pendingQuote = null;

        await (async function processLines() {
            for (let li = 0; li < lines.length; li++) {
                const line = lines[li];
                const { tags, cleanedText } = extractTagsFromText(line);

                if (sentCount > 0) await new Promise(r => setTimeout(r, 400));

                if (tags.length > 0) {
                    let replyQuote = null;
                    for (const tag of tags) {
                        if (tag.kind === 'transfer') {
                            addMessage('left', '', timeStr, null, false, true,
                                { cardType: 'transfer', amount: '¥' + tag.payload, title: '转账', footer: '待领取' });
                        } else if (tag.kind === 'gift') {
                            addMessage('left', '', timeStr, null, false, true,
                                { cardType: 'gift', title: '送出礼物', sub: tag.payload || '一份心意', footer: '点击领取' });
                        } else if (tag.kind === 'voice') {
                            const parts = tag.payload.split('|');
                            const dur = parseInt(parts[0]) || 6;
                            const voiceText = (parts[1] || '').trim();
                            addMessage('left', '', timeStr, null, false, false, null, voiceText || null, null,
                                null, true, { duration: dur, unread: true, ttsText: voiceText });
                        } else if (tag.kind === 'call') {
                            // 角色主动来电：直接弹出真实来电页面（无冷却，不再先插卡片）
                            triggerIncomingCall('通话');
                        } else if (tag.kind === 'image') {
                            const imgPrompt = buildImagePrompt(tag.payload || '一张图片');
                            const allowImage = getChatSetting('allowImage', false);
                            if (allowImage) {
                                try {
                                    const realUrl = await generateImage(imgPrompt);
                                    addMessage('left', '', timeStr, null, false, false, null, null, null,
                                        null, false, null, true, { url: realUrl, desc: tag.payload || '', genPrompt: tag.payload || '' });
                                } catch (imgErr) {
                                    showAlert('生图失败', String(imgErr));
                                    addMessage('left', '', timeStr, null, false, false, null, null, null,
                                        null, false, null, true, { textImage: true, desc: tag.payload || '' });
                                }
                            } else {
                                addMessage('left', '', timeStr, null, false, false, null, null, null,
                                    null, false, null, true, { textImage: true, desc: tag.payload || '' });
                            }
                        } else if (tag.kind === 'creategroup') {
                            createGroupFromTag(tag.payload);
                        } else if (tag.kind === 'emoji') {
                            const em = await findEmojiByName(tag.payload);
                            if (em && em.url) {
                                addMessage('left', '', timeStr, null, false, false, null, null, null,
                                    null, false, null, true, { url: em.url, desc: em.name || '表情包', emojiName: em.name || '' });
                            }
                        } else if (tag.kind === 'inviteme') {
                            inviteMeToGroupFromTag(tag.payload);
                        } else if (tag.kind === 'acceptinvite') {
                            acceptUserInvite(tag.payload);
                        } else if (tag.kind === 'rejectinvite') {
                            rejectUserInvite(tag.payload);
                        } else if (tag.kind === 'reply') {
                            replyQuote = { name: currentUserName, text: tag.payload || '' };
                            // [reply:] 独占一行，把引用挂到下一句真正的回复上，而不是把引用内容当气泡发出去
                            pendingQuote = replyQuote;
                        }
                        sentCount++;
                    }
                    if (cleanedText) {
                        const subParts = splitMessages(cleanedText);
                        for (let pi = 0; pi < subParts.length; pi++) {
                            const part = subParts[pi];
                            if (!part) continue;
                            if (sentCount > 0) await new Promise(r => setTimeout(r, 400));
                            let q = null;
                            if (pi === 0) {
                                q = replyQuote || null;
                                if (q) pendingQuote = null;
                            }
                            await sendTranslatedIfNeeded(part, timeStr, foreign, q);
                            sentCount++;
                        }
                    }
                    continue;
                }

                const subParts = splitMessages(line);
                for (const part of subParts) {
                    if (!part) continue;
                    if (sentCount > 0) await new Promise(r => setTimeout(r, 400));
                    let q = null;
                    if (pendingQuote) { q = pendingQuote; pendingQuote = null; }
                    await sendTranslatedIfNeeded(part, timeStr, foreign, q);
                    sentCount++;
                }
            }

            if (sentCount === 0 && replyBody) {
                addMessage('left', replyBody, timeStr, null, false, false, null, null, null, null);
            }
            // 把本轮生成的心声内容挂到本轮所有角色消息上（点击头像可查看）
            if (roundHeart && (roundHeart.subject || roundHeart.thought)) {
                for (let i = messages.length - 1; i >= 0; i--) {
                    const m = messages[i];
                    if (m.type === 'left' && m.turn === currentTurn) {
                        m.heart = { subject: roundHeart.subject, thought: roundHeart.thought };
                    }
                }
            }
            console.log('[Chat] 回复完成，共 ' + sentCount + ' 条消息');
            saveMessages();
        })();
    }

    // ===== 通话记录弹窗 =====
    let callSheetData = null;
    let callSheetEditing = false;
    let callSheetSelected = new Set();

    function openCallSheet(callData) {
    // 未接通卡片不弹窗
    if (callData.missed) {
        console.log('[Chat] 未接通卡片，无聊天记录');
        return;
    }
    
    callSheetData = callData;
    callSheetEditing = false;
    callSheetSelected.clear();
        
        const overlay = document.getElementById('callSheetOverlay');
        const sheet = document.getElementById('callSheet');
        const editBtn = document.getElementById('callSheetEdit');
        
        if (!overlay || !sheet) {
            console.warn('[Chat] 弹窗元素不存在，请确认 chat_inner.html 已添加 callSheet 结构');
            return;
        }
        
        sheet.classList.remove('editing');
        if (editBtn) editBtn.classList.remove('done');
        
        renderCallSheetMessages();
        updateCallSheetToolbar();
        
        overlay.classList.add('active');
        sheet.classList.add('active');
        console.log('[Chat] 打开通话记录弹窗:', callData.callId);
    }

    function closeCallSheet() {
        const overlay = document.getElementById('callSheetOverlay');
        const sheet = document.getElementById('callSheet');
        if (overlay) overlay.classList.remove('active');
        if (sheet) sheet.classList.remove('active');
        callSheetEditing = false;
        callSheetSelected.clear();
    }

    function renderCallSheetMessages() {
        const body = document.getElementById('callSheetBody');
        if (!body || !callSheetData) return;
        
        body.innerHTML = '';
        const messages = callSheetData.messages || [];
        
        const mins = Math.floor(callSheetData.duration / 60);
        const secs = callSheetData.duration % 60;
        const durationStr = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        
        const durationEl = document.createElement('div');
        durationEl.className = 'call-duration';
        durationEl.innerHTML = '通话时长 <span class="duration">' + durationStr + '</span>';
        body.appendChild(durationEl);
        
        if (messages.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'call-empty';
            empty.textContent = '暂无通话消息';
            body.appendChild(empty);
            return;
        }
        
        messages.forEach(function(msg, index) {
            const row = document.createElement('div');
            row.className = 'call-msg-row';
            if (msg.isUser) row.classList.add('user-row');
            
            const check = document.createElement('div');
            check.className = 'call-check';
            check.dataset.index = index;
            if (callSheetSelected.has(index)) check.classList.add('on');
            check.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleCallSheetSelect(index, check);
            });
            
            const msgEl = document.createElement('div');
            msgEl.className = 'call-msg ' + (msg.isUser ? 'call-msg-user' : 'call-msg-api');
            msgEl.textContent = msg.text;
            msgEl.addEventListener('click', function() {
                if (callSheetEditing) {
                    toggleCallSheetSelect(index, check);
                }
            });
            
            row.appendChild(check);
            row.appendChild(msgEl);
            body.appendChild(row);
        });
    }

    function toggleCallSheetSelect(index, checkEl) {
        if (!callSheetEditing) return;
        if (callSheetSelected.has(index)) {
            callSheetSelected.delete(index);
            checkEl.classList.remove('on');
        } else {
            callSheetSelected.add(index);
            checkEl.classList.add('on');
        }
        updateCallSheetToolbar();
    }

    function updateCallSheetToolbar() {
        const n = callSheetSelected.size;
        const countEl = document.getElementById('callSheetCount');
        const delBtn = document.getElementById('callSheetDel');
        if (countEl) countEl.textContent = '已选择 ' + n + ' 条';
        if (delBtn) delBtn.disabled = n === 0;
    }

    function deleteCallSheetSelected() {
        if (callSheetSelected.size === 0 || !callSheetData) return;
        const indices = Array.from(callSheetSelected).sort(function(a, b) { return b - a; });
        indices.forEach(function(idx) {
            callSheetData.messages.splice(idx, 1);
        });
        callSheetSelected.clear();
        renderCallSheetMessages();
        updateCallSheetToolbar();
        callSheetEditing = false;
        const sheet = document.getElementById('callSheet');
        const editBtn = document.getElementById('callSheetEdit');
        if (sheet) sheet.classList.remove('editing');
        if (editBtn) editBtn.classList.remove('done');
        if (callSheetData && callSheetData.callId) {
            saveCallRecordToDB(callSheetData.callId, callSheetData.duration, callSheetData.missed, callSheetData.messages);
        }
    }

    function bindCallSheetEvents() {
        const backBtn = document.getElementById('callSheetBack');
        const overlay = document.getElementById('callSheetOverlay');
        const editBtn = document.getElementById('callSheetEdit');
        const cancelBtn = document.getElementById('callSheetCancel');
        const delBtn = document.getElementById('callSheetDel');
        
        if (backBtn) backBtn.addEventListener('click', closeCallSheet);
        if (overlay) overlay.addEventListener('click', function(e) {
            if (e.target === this) closeCallSheet();
        });
        
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                if (callSheetEditing) {
                    callSheetEditing = false;
                    callSheetSelected.clear();
                    const sheet = document.getElementById('callSheet');
                    if (sheet) sheet.classList.remove('editing');
                    this.classList.remove('done');
                    renderCallSheetMessages();
                    updateCallSheetToolbar();
                } else {
                    callSheetEditing = true;
                    const sheet = document.getElementById('callSheet');
                    if (sheet) sheet.classList.add('editing');
                    this.classList.add('done');
                    updateCallSheetToolbar();
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                callSheetEditing = false;
                callSheetSelected.clear();
                const sheet = document.getElementById('callSheet');
                const editBtn = document.getElementById('callSheetEdit');
                if (sheet) sheet.classList.remove('editing');
                if (editBtn) editBtn.classList.remove('done');
                renderCallSheetMessages();
                updateCallSheetToolbar();
            });
        }
        
        if (delBtn) {
            delBtn.addEventListener('click', function() {
                deleteCallSheetSelected();
            });
        }
    }

    // 发送按钮形态：输入框有字=发送（上箭头），无字=回复（回箭头）
    function updateSendButtonMode() {
        if (isProcessingApi) return;
        const hasText = !!(messageInput && messageInput.value && messageInput.value.trim());
        sendBtn.classList.remove('disabled');
        if (hasText) {
            sendBtn.classList.remove('reply-mode');
            sendBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        } else {
            sendBtn.classList.add('reply-mode');
            sendBtn.innerHTML = '<i class="fas fa-reply"></i>';
        }
    }

    // 断点续生成：上次离开时若回复还没生成完，回到该聊天后继续“正在输入”并接上结果
    async function resumeChatReply() {
        if (isProcessingApi) return;
        const stored = loadStoredChatRequest();
        if (!stored || !stored.token) { chatPendingSet(false); return; }
        isProcessingApi = true;
        showTyping();
        sendBtn.classList.add('disabled');
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const result = await sendChatRequest(stored);
            if (!result || !result.ok) {
                if (result && result.error) showAlert('网络错误', '无法连接 API 服务器\n' + result.error);
                return;
            }
            let content = null;
            try {
                const data = JSON.parse(result.text || '{}');
                content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            } catch (e) {}
            if (!content) return;
            const lastUserMsg = [...messages].reverse().find(m => m.type === 'right' && !m.recalled) || null;
            await processReply(content, lastUserMsg);
        } catch (error) {
            console.error('[Chat] 断点续生成异常', error);
        } finally {
            clearChatRequest();
            chatPendingSet(false);
            hideTyping();
            isProcessingApi = false;
            isWaitingForReply = false;
            updateSendButtonMode();
        }
    }

    async function triggerReply() {
        if (isProcessingApi) return;

        // 不再对未处理的转账/礼物随机自动退还；改为 AI 在本轮回复里明确表态（收/不收/退）

        const lastUserMsg = [...messages].reverse().find(m => m.type === 'right' && !m.recalled);
        if (!lastUserMsg) {
            isWaitingForReply = false;
            updateSendButtonMode();
            return;
        }

        isProcessingApi = true;
        chatPendingSet(true);
        showTyping();
        sendBtn.classList.add('disabled');
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            if (getChatSetting('allowImage', false) && isImageRequest(lastUserMsg.text)) {
                const now = new Date();
                const h = String(now.getHours()).padStart(2, '0');
                const m = String(now.getMinutes()).padStart(2, '0');
                const timeStr = h + ':' + m;
                try {
                    const imgPrompt = buildImagePrompt(lastUserMsg.text);
                    const realUrl = await generateImage(imgPrompt);
                    addMessage('left', '', timeStr, null, false, false, null, null, null, null, false, null, true, { url: realUrl, desc: lastUserMsg.text, genPrompt: lastUserMsg.text });
                } catch (imgErr) {
                    showAlert('生图失败', String(imgErr));
                    addMessage('left', '', timeStr, null, false, false, null, null, null, null, false, null, true, { textImage: true, desc: lastUserMsg.text });
                }
                saveMessages();
                return;
            }

            const reply = await callApi(describeMsgForAI(lastUserMsg) || lastUserMsg.text);
            if (!reply) return;
            await processReply(reply, lastUserMsg);
        } catch (error) {
            console.error('[Chat] 触发回复异常', error);
            showAlert('错误', error.message || '未知错误');
        } finally {
            clearChatRequest();
            chatPendingSet(false);
            hideTyping();
            isProcessingApi = false;
            isWaitingForReply = false;
            updateSendButtonMode();
        }
    }

    function handleReroll() {
        if (!messages || messages.length === 0) {
            showAlert('提示', '没有可重roll的消息');
            return;
        }

        let lastAIIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === 'left' && !messages[i].recalled) {
                lastAIIndex = i;
                break;
            }
        }

        if (lastAIIndex === -1) {
            showAlert('提示', '没有可重roll的消息');
            return;
        }

        let startIndex = lastAIIndex;
        for (let i = lastAIIndex - 1; i >= 0; i--) {
            if (messages[i].type === 'left' && !messages[i].recalled) {
                startIndex = i;
            } else {
                break;
            }
        }

        const idsToRemove = [];
        for (let i = startIndex; i <= lastAIIndex; i++) {
            idsToRemove.push(messages[i].id);
        }

        const remaining = messages.filter(m => !idsToRemove.includes(m.id));
        messages.length = 0;
        messages.push(...remaining);

        renderMessages();
        saveMessages();

        let lastUserMsg = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === 'right' && !messages[i].recalled) {
                lastUserMsg = messages[i];
                break;
            }
        }

        if (lastUserMsg) {
            isWaitingForReply = true;
            sendBtn.classList.add('reply-mode');
            sendBtn.innerHTML = '<i class="fas fa-reply"></i>';
            setTimeout(() => {
                triggerReply();
            }, 300);
        } else {
            showAlert('提示', '没有找到用户消息');
        }
    }

    document.addEventListener('click', function(e) {
        const idb = e.target.closest('.image-desc-bubble');
        if (idb && !idb.classList.contains('flipped')) {
            idb.classList.add('flipped');
            setTimeout(function() {
                idb.classList.remove('flipped');
            }, 2000);
        }
    });

    // ===== 事件绑定 =====
    document.getElementById('alertButton').addEventListener('click', function() {
        document.getElementById('iosAlert').classList.remove('active');
    });

    messageScroll.addEventListener('click', function(e) {
        const actionBtn = e.target.closest('.card-btn[data-act]');
        if (actionBtn) {
            const row = actionBtn.closest('.message-row');
            if (!row) return;
            const msg = messages.find(m => m.id === row.dataset.id);
            if (!msg || !msg.cardData) return;
            const st = msg.cardData.status || 'pending';
            if (st !== 'pending') return;
            const act = actionBtn.dataset.act;
            if (act === 'receive') receiveCard(msg);
            else if (act === 'return') returnCard(msg);
            else if (act === 'accept') acceptGroupInvite(msg);
            else if (act === 'reject') rejectGroupInvite(msg);
            else if (act === 'listen-accept') { setListenStatus(msg, 'accepted'); addSystemNotice('你接受了一起听邀请'); notifyListenAccepted(msg); }
            else if (act === 'listen-reject') { setListenStatus(msg, 'rejected'); addSystemNotice('你婉拒了一起听邀请'); }
            return;
        }
        
        // ===== 通话卡片点击 - 单击弹窗，双击菜单 =====
const callCard = e.target.closest('.bubble-card.call');
if (callCard) {
    // 多选模式下不弹窗
    if (isMultiSelect) return;
    
    const cardMain = callCard.querySelector('.card-main');
    if (!cardMain) return;
    const callId = cardMain.dataset.callid;
    if (!callId) {
        console.warn('[Chat] 通话卡片缺少 callId');
        return;
    }
    
    if (window._callCardTimer) {
        clearTimeout(window._callCardTimer);
        window._callCardTimer = null;
    }
    
    window._callCardTimer = setTimeout(function() {
        getCallRecordFromDB(callId).then(function(record) {
            if (record && !record.missed) {
                openCallSheet(record);
            }
        }).catch(function(err) {
            console.warn('[Chat] 读取通话记录失败:', err);
        });
        window._callCardTimer = null;
    }, 300);
    return;
}

        // ===== 情侣空间卡片点击：查看完整结果 =====
        const coupleCard = e.target.closest('.bubble-card.couple');
        if (coupleCard) {
            if (isMultiSelect) return;
            const cRow = coupleCard.closest('.message-row');
            const cMsg = cRow ? messages.find(m => m.id === cRow.dataset.id) : null;
            if (cMsg && cMsg.cardData) {
                showAlert(cMsg.cardData.title || '情侣空间', String(cMsg.cardData.coupleDetail || cMsg.cardData.coupleSummary || ''));
            }
            return;
        }

        const card = e.target.closest('.bubble-card.transfer.left, .bubble-card.gift.left');
        if (!card || card.classList.contains('claimed')) return;
        const row = card.closest('.message-row');
        if (!row) return;
        const msg = messages.find(m => m.id === row.dataset.id);
        if (!msg || !msg.cardData) return;
        if (msg.cardData.status === 'pending') {
            receiveCard(msg);
        } else {
            claimCard(msg);
            renderMessages();
            saveMessages();
        }
    });

    sendBtn.addEventListener('click', function() {
        const text = messageInput.value.trim();
        // 输入框为空：点发送/回复按钮 = 让角色回复；有内容 = 只发送，不自动回复
        if (!text) {
            triggerReply();
            return;
        }
        sendMessage();
    });

    sendBtn.addEventListener('dblclick', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Chat] 双击发送按钮，触发AI回复');
        triggerReply();
    });

    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = this.value.trim();
            if (!text) {
                triggerReply();
            } else {
                sendBtn.click();
            }
        }
    });

    voiceBtn.addEventListener('click', function() {
        // 打开发送语音气泡弹窗
        openVoiceSheet();
    });

    // ============================================================
    // 收藏：写入 nano_api_db / favorite_data（与 more 页收藏页共用）
    // ============================================================
    function favoriteOpenDb() {
        return new Promise(function(resolve, reject) {
            try {
                const req = indexedDB.open('nano_api_db', 2);
                req.onupgradeneeded = function(e) {
                    try {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('favorite_data')) db.createObjectStore('favorite_data', { keyPath: 'key' });
                    } catch (e) {}
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }

    function favoriteRead() {
        return favoriteOpenDb().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    const r = db.transaction('favorite_data', 'readonly').objectStore('favorite_data').get('nano_favorite');
                    r.onsuccess = function() { resolve(r.result ? r.result.value : null); };
                    r.onerror = function() { resolve(null); };
                } catch (e) { resolve(null); }
            });
        }).catch(function() { return null; });
    }

    function favoriteWrite(obj) {
        return favoriteOpenDb().then(function(db) {
            return new Promise(function(resolve) {
                try {
                    db.transaction('favorite_data', 'readwrite').objectStore('favorite_data').put({ key: 'nano_favorite', value: obj });
                } catch (e) {}
                resolve();
            });
        }).catch(function() {});
    }

    function favoriteContentText(msg) {
        if (!msg) return '';
        if (msg.isImage) {
            if (msg.imageData && msg.imageData.textImage) return '文字图片';
            return (msg.imageData && msg.imageData.desc) || '一张照片';
        }
        if (msg.isCard && msg.cardData) {
            if (msg.cardData.cardType === 'transfer') return '转账';
            if (msg.cardData.cardType === 'gift') return msg.cardData.title || '礼物';
            if (msg.cardData.cardType === 'call') return msg.cardData.missed ? '未接电话' : '语音通话';
            return msg.cardData.sub || '卡片消息';
        }
        if (msg.isVoice) return msg.transcript || '语音';
        return msg.text || '';
    }

    function favoriteSenderName(msg) {
        const name = msg.type === 'left' ? displayName : currentUserName;
        return name || '未知';
    }

    function addMsgToFavorites(msg) {
        const sender = favoriteSenderName(msg);
        const senderType = msg.type === 'left' ? 'char' : 'user';
        const isUser = msg.type !== 'left';
        favoriteRead().then(function(cur) {
            const list = (cur && Array.isArray(cur.favorites)) ? cur.favorites : [];
            if (list.some(function(f) { return f.id === msg.id; })) return;
            const takeAvatar = function(avatar) {
                list.unshift({
                    id: msg.id,
                    content: favoriteContentText(msg),
                    sender: sender,
                    senderType: senderType,
                    time: msg.time || '',
                    chatId: chatId || '',
                    avatar: avatar || '',
                    kind: msg.isImage ? 'image' : (msg.isVoice ? 'voice' : (msg.isCard ? 'card' : 'text'))
                });
                const payload = { favorites: list };
                try { localStorage.setItem('nano_favorite', JSON.stringify(payload)); } catch (e) {}
                favoriteWrite(payload).catch(function() {});
                try {
                    window.parent.postMessage({ type: 'refreshFavorites' }, '*');
                } catch (e) {}
            };
            if (!isUser) {
                takeAvatar(avatarSrc || '');
                return;
            }
            if (currentUserAvatar && currentUserAvatar.trim() !== '') {
                takeAvatar(currentUserAvatar);
                return;
            }
            getMaskAvatarFromDB(currentUser && currentUser.id ? currentUser.id : '').then(function(url) {
                takeAvatar(url || '');
            });
        });
    }

    function removeMsgFromFavorites(msgId) {
        favoriteRead().then(function(cur) {
            const list = (cur && Array.isArray(cur.favorites)) ? cur.favorites : [];
            const payload = { favorites: list.filter(function(f) { return f.id !== msgId; }) };
            try { localStorage.setItem('nano_favorite', JSON.stringify(payload)); } catch (e) {}
            favoriteWrite(payload).catch(function() {});
            try {
                window.parent.postMessage({ type: 'refreshFavorites' }, '*');
            } catch (e) {}
        });
    }

    // ===== 多选 =====
    function enterMultiSelect() {
        isMultiSelect = true;
        selectedMessages.clear();
        multiSelectBar.classList.add('active');
        document.querySelectorAll('.message-row').forEach(row => {
            if (!row.classList.contains('recalled')) row.style.opacity = '0.4';
        });
        updateMultiSelectUI();
        document.querySelectorAll('.message-row').forEach(row => {
            row.addEventListener('click', toggleSelect);
        });
    }

    function toggleSelect(e) {
        const row = e.currentTarget;
        if (row.classList.contains('recalled')) return;
        const id = row.dataset.id;
        if (selectedMessages.has(id)) selectedMessages.delete(id);
        else selectedMessages.add(id);
        updateMultiSelectUI();
    }

    function exitMultiSelect() {
        isMultiSelect = false;
        selectedMessages.clear();
        multiSelectBar.classList.remove('active');
        document.querySelectorAll('.message-row').forEach(row => {
            row.style.opacity = '1';
            row.removeEventListener('click', toggleSelect);
        });
    }

    function updateMultiSelectUI() {
        msCount.textContent = '已选 ' + selectedMessages.size + ' 条';
        document.querySelectorAll('.message-row').forEach(row => {
            const id = row.dataset.id;
            if (selectedMessages.has(id)) row.style.opacity = '1';
            else if (!row.classList.contains('recalled')) row.style.opacity = '0.4';
        });
    }

    msCancel.addEventListener('click', exitMultiSelect);
    msDelete.addEventListener('click', function() {
        if (selectedMessages.size === 0) return;
        const toDelete = Array.from(selectedMessages);
        messages = messages.filter(m => !toDelete.includes(m.id));
        selectedMessages.clear();
        renderMessages();
        saveMessages();
        exitMultiSelect();
    });

    // ===== 双击事件 =====
document.addEventListener('dblclick', function(e) {
    // ===== 双击通话卡片 - 弹出完整菜单 =====
const callCard = e.target.closest('.bubble-card.call');
if (callCard) {
    if (window._callCardTimer) {
        clearTimeout(window._callCardTimer);
        window._callCardTimer = null;
    }
    const cardMain = callCard.querySelector('.card-main');
    if (!cardMain) return;
    const callId = cardMain.dataset.callid;
    if (!callId) return;
    
    // 获取卡片对应的消息行
    const row = callCard.closest('.message-row');
    if (!row) return;
    
    // 设置为长按目标，复用现有的长按菜单
    longpressTarget = row;
    const menu = longpressMenu;
    const x = e.clientX || e.pageX || 0;
    const y = e.clientY || e.pageY || 0;
    const menuWidth = 170;
    menu.style.left = Math.min(x - menuWidth / 2, window.innerWidth - menuWidth - 10) + 'px';
    menu.style.top = Math.min(y - 20, window.innerHeight - 300) + 'px';
    menu.classList.add('active');
    e.preventDefault();
    return;
}

    // ===== 原有的长按菜单逻辑（双击消息行）=====
    const targetRow = e.target.closest('.message-row');
    if (!targetRow) return;
    if (isMultiSelect) return;
    e.preventDefault();
    e.stopPropagation();
    longpressTarget = targetRow;
    const menu = longpressMenu;
    const x = e.clientX || e.pageX || 0;
    const y = e.clientY || e.pageY || 0;
    const menuWidth = 170;
    menu.style.left = Math.min(x - menuWidth / 2, window.innerWidth - menuWidth - 10) + 'px';
    menu.style.top = Math.min(y - 20, window.innerHeight - 300) + 'px';
    menu.classList.add('active');
});

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.longpress-menu')) {
            longpressMenu.classList.remove('active');
            longpressTarget = null;
        }
    });

    longpressMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // ===== 编辑消息弹窗 =====
    const editPopup = document.getElementById('editPopup');
    const editTextarea = document.getElementById('editTextarea');
    const editCancel = document.getElementById('editCancel');
    const editConfirm = document.getElementById('editConfirm');
    let editTargetMsg = null;
    function openEditPopup(msg) {
        if (!msg || !editPopup) return;
        if (msg.recalled || msg.isCard || msg.isVoice || msg.isImage) {
            showAlert('无法编辑', '这条消息不是普通文字消息，暂不支持编辑。');
            return;
        }
        editTargetMsg = msg;
        editTextarea.value = msg.text || '';
        editPopup.classList.add('active');
        setTimeout(function () {
            try {
                editTextarea.focus();
                editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
            } catch (e) {}
        }, 60);
    }
    function closeEditPopup() {
        editTargetMsg = null;
        if (editPopup) editPopup.classList.remove('active');
    }
    if (editCancel) editCancel.addEventListener('click', closeEditPopup);
    if (editConfirm) editConfirm.addEventListener('click', function() {
        if (!editTargetMsg) { closeEditPopup(); return; }
        const val = (editTextarea.value || '').trim();
        if (!val) { showAlert('无法保存', '消息内容不能为空。'); return; }
        editTargetMsg.text = val;
        editTargetMsg.translation = null;
        closeEditPopup();
        renderMessages();
        saveMessages();
    });
    if (editPopup) {
        editPopup.addEventListener('click', function(e) {
            if (e.target === editPopup) closeEditPopup();
        });
    }

    document.querySelectorAll('.longpress-menu .menu-item').forEach(item => {
        item.addEventListener('click', async function(e) {
            e.stopPropagation();
            const action = this.dataset.action;
            const target = longpressTarget;
            longpressMenu.classList.remove('active');
            longpressTarget = null;
            if (!target) return;
            const id = target.dataset.id;
            const msg = messages.find(m => m.id === id);
            if (!msg) return;

            if (action === 'reply') {
                setQuote(msg.id, msg.text);
            } else if (action === 'edit') {
                openEditPopup(msg);
            } else if (action === 'recall') {
                // 保留原文用于小框展示「撤回了一条消息：xxx」
                msg.recalled = true;
                renderMessages();
                saveMessages();
            } else if (action === 'delete') {
                const idx = messages.indexOf(msg);
                if (idx > -1) {
                    messages.splice(idx, 1);
                    renderMessages();
                    saveMessages();
                }
            } else if (action === 'multiselect') {
                enterMultiSelect();
            } else if (action === 'favorite') {
                msg.favorite = !msg.favorite;
                if (msg.favorite) {
                    addMsgToFavorites(msg);
                } else {
                    removeMsgFromFavorites(msg.id);
                }
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'alert',
                        message: msg.favorite ? '已收藏' : '已取消收藏'
                    }, '*');
                }
                saveMessages();
            } else if (action === 'translate') {
                if (!msg.translation) {
                    if (window.parent !== window) {
                        window.parent.postMessage({ type: 'alert', message: '正在翻译...' }, '*');
                    }
                }
                const translated = await translateToZh(msg.text);
                if (translated) {
                    msg.translation = translated;
                    renderMessages();
                    saveMessages();
                    if (window.parent !== window) {
                        window.parent.postMessage({ type: 'alert', message: '翻译完成' }, '*');
                    }
                } else {
                    showAlert('翻译失败', '未配置 API 或网络异常，请检查 API 设置');
                }
            } else if (action === 'voice2text') {
                const transcript = '语音转文字 ' + msg.text;
                msg.transcript = transcript;
                renderMessages();
                saveMessages();
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'alert', message: '语音转文字完成' }, '*');
                }
            }
        });
    });


    // ===== 接收来自 inner-setting 的同步消息 =====
    // ===== 一起听邀请：卡片消息构造 / 状态更新 =====
    function makeListenCardMsg(status, song, artist, opts) {
        opts = opts || {};
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const dir = opts.direction || 'char';
        // 方向决定左右：我发出的邀请一定在右侧，对方邀请我在左侧
        const side = dir === 'user' ? 'right' : 'left';
        return {
            id: 'listen_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: side,
            text: '',
            time: h + ':' + m,
            status: null,
            recalled: false,
            isCard: true,
            cardData: {
                cardType: 'listen',
                direction: opts.direction || 'char',
                status: status || 'pending',
                title: song || '',
                sub: artist || '',
                toName: opts.toName || ''
            },
            isVoice: false, voiceData: null, isImage: false, imageData: null,
            quote: null, transcript: null, translation: null, favorite: false, turn: null
        };
    }
    function applyListenStatus(list, status, song, artist, direction) {
        for (let i = list.length - 1; i >= 0; i--) {
            const cd = list[i] && list[i].cardData;
            if (list[i] && list[i].isCard && cd && cd.cardType === 'listen' &&
                cd.status === 'pending' && (!direction || (cd.direction || 'user') === direction)) {
                cd.status = status;
                if (song) cd.title = song;
                if (artist) cd.sub = artist;
                return true;
            }
        }
        return false;
    }
    function handleListenInvite(data) {
        if (!data.chatId) return;                 // 没有目标会话就丢弃，避免串到别的聊天
        const targetId = data.chatId;
        const isResult = (data.type === 'NANO_LISTEN_INVITE_RESULT');
        const status = isResult ? (data.status || 'accepted') : 'pending';
        const opts = { type: data.side || 'left', direction: data.direction || 'char', toName: data.toName || '' };
        // 只有当前打开的聊天才更新内存并重绘（存储已由音乐 App 写好）
        if (targetId !== chatId) return;
        if (isResult) {
            if (!applyListenStatus(messages, status, data.song, data.artist, opts.direction)) {
                messages.push(makeListenCardMsg(status, data.song, data.artist, opts));
            }
        } else {
            messages.push(makeListenCardMsg('pending', data.song, data.artist, opts));
        }
        try { renderMessages(); saveMessages(); scrollToBottom(); } catch (e) {}
    }

    // ===== 情侣空间分享卡片 =====
    function makeCoupleCardMsg(card) {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        return {
            id: 'couple_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'right', text: '', time: h + ':' + m, status: null, recalled: false,
            isCard: true,
            cardData: {
                cardType: 'couple',
                title: card.title || '情侣空间',
                coupleKind: card.kind || '',
                coupleSummary: card.summary || '',
                coupleDetail: card.detail || '',
                shareId: card.shareId || ''
            },
            isVoice: false, voiceData: null, isImage: false, imageData: null,
            quote: null, transcript: null, translation: null, favorite: false, turn: null,
            ts: Date.now()
        };
    }

    function hasCoupleCard(card) {
        return messages.some(function (m) {
            if (!m || m.recalled || !m.isCard || !m.cardData || m.cardData.cardType !== 'couple') return false;
            if (card.shareId && m.cardData.shareId) return m.cardData.shareId === card.shareId;
            return (m.cardData.title || '') === (card.title || '') && (m.cardData.coupleSummary || '') === (card.summary || '');
        });
    }

    function addCoupleShareCard(card, opts) {
        opts = opts || {};
        if (!card) return false;
        if (hasCoupleCard(card)) return false;
        messages.push(makeCoupleCardMsg(card));
        try { renderMessages(); saveMessages(); scrollToBottom(); } catch (e) {}
        // 不自动回复：由用户点击右下角「回复」按钮再让角色读取卡片并分析
        try { updateSendButtonMode(); } catch (e) {}
        if (opts.autoReply) {
            setTimeout(function () { try { if (!isProcessingApi) triggerReply(); } catch (e) {} }, 650);
        }
        return true;
    }

    function handleCoupleShare(data) {
        if (!data || !data.card) return;
        if (data.chatId && String(data.chatId) !== String(chatId)) return;
        if (!isStorageReady) {
            // 存储未就绪：写入暂存，由 init 时的 consumePendingCoupleShare 补挂
            try {
                sessionStorage.setItem('nano_pending_couple_share', JSON.stringify({
                    chatId: chatId, chatName: displayName || chatName || '', card: data.card, ts: Date.now()
                }));
            } catch (e) {}
            return;
        }
        addCoupleShareCard(data.card, { autoReply: false });
    }

    function consumePendingCoupleShare() {
        let p = null;
        try { p = JSON.parse(sessionStorage.getItem('nano_pending_couple_share') || 'null'); } catch (e) {}
        if (!p || !p.card) return;
        if (String(p.chatId || '') !== String(chatId || '')) return;
        try { sessionStorage.removeItem('nano_pending_couple_share'); } catch (e) {}
        addCoupleShareCard(p.card, { autoReply: false });
    }

    window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data) return;

        // 情侣空间分享卡片：可能不是当前聊天，须在 chatId 过滤之前处理
        if (data.type === 'NANO_COUPLE_SHARE_CARD') {
            handleCoupleShare(data);
            return;
        }

        // 一起听系统提示（接受/拒绝/结束）：居中灰框，写入聊天记录让角色能读到
        if (data.type === 'NANO_LISTEN_NOTICE') {
            // 必须明确指定聊天，避免提示串到别的会话
            if (!data.chatId) return;
            if (String(data.chatId) !== String(chatId)) return;
            const had = consumePendingListenNotice();
            if (!had && data.text) { try { addSystemNotice(data.text || ''); } catch (e) {} }
            return;
        }

        // 一起听邀请卡片：可能不是当前聊天，必须在 chatId 过滤之前处理
        if (data.type === 'NANO_LISTEN_INVITE_CARD' || data.type === 'NANO_LISTEN_INVITE_RESULT') {
            handleListenInvite(data);
            return;
        }

        // 音乐 App 发起邀请后，父页面让已打开的 chat_inner 立即补挂邀请卡片（无需重载）
        if (data.type === 'nanoConsumeListenInvite') {
            if (data.chatId && String(data.chatId) !== String(chatId)) return;
            try { consumePendingListenInvite(); } catch (e) {}
            return;
        }

        // 记忆库在记忆页被增删改：立即刷新注入模型的长期记忆
        if (data.type === 'NANO_MEMORY_UPDATED') {
            if (!data.chatId || String(data.chatId) === String(chatId)) {
                try { refreshMemoryHints(); } catch (e) {}
            }
            return;
        }

        if (data.chatId && data.chatId !== chatId) return;

        if (data.type === 'remarkChanged') {
            if (data.remark) {
                displayName = data.remark;
            } else {
                displayName = characterData ? characterData.name : chatName;
            }
            chatTitle.textContent = displayName;
            avatarPlaceholder.textContent = displayName.charAt(0).toUpperCase();
            if (window.__chat) window.__chat.displayName = displayName;
            renderMessages();
        } else if (data.type === 'backgroundChanged') {
            applyChatBackground();
        } else if (data.type === 'jumpToMessage') {
            jumpToMessage(data.msgId);
        } else if (data.type === 'messagesCleared') {
            clearAllMessages();
        } else if (data.type === 'autoMsgChanged') {
            setAutoMsgState(!!data.enabled, data.interval);
        } else if (data.type === 'autoMsgIntervalChanged') {
            if (autoMsgTimer) {
                setAutoMsgState(getChatSetting('autoMsg', false), data.interval);
            }
        } else if (data.type === 'autoMomentChanged') {
            setAutoMomentState(!!data.enabled, data.interval);
        } else if (data.type === 'autoMomentIntervalChanged') {
            if (autoMomentTimer) setAutoMomentState(getChatSetting('autoMoment', false), data.interval);
        } else if (data.type === 'timeAwareChanged' || data.type === 'allowImageChanged' || data.type === 'allowMomentImageChanged') {
            // 无需实时处理（构建提示词/生图时读取设置）
        }

        // ===== 接收语音通话卡片 =====
if (data.type === 'NANO_VOICE_CALL_CARD') {
    if (data.chatId && data.chatId !== chatId) return;
    
    saveCallRecordToDB(data.callId, data.duration, data.missed, data.messages);
    
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const timeStr = h + ':' + m;
    
    const mins = Math.floor(data.duration / 60);
    const secs = data.duration % 60;
    const durationStr = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    
    // 主动来电（AI 打给你）的卡片显示在对方（左）侧；你主动打的显示在自己（右）侧
    const cardSide = data.incoming ? 'left' : 'right';
    addMessage(cardSide, '', timeStr, null, false, true, {
        cardType: 'call',
        callId: data.callId,
        duration: durationStr,
        missed: data.missed || false
    });
    
    saveMessages();
    scrollToBottom();
    console.log('[Chat] 收到语音通话卡片:', data.callId, '未接:', data.missed);
}
    });

    // ===== 页面可见性 =====
    document.addEventListener('visibilitychange', function() {
        isPageVisible = !document.hidden;
    });

    // ===== 通知父页面 =====
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'pageLoaded', page: 'chat_inner' }, '*');
    }

    // ===== 暴露给其他模块 =====
    window.__chat = {
        addMessage: addMessage,
        renderMessages: renderMessages,
        saveMessages: saveMessages,
        sendMessage: sendMessage,
        triggerReply: triggerReply,
        claimCard: claimCard,
        receiveCard: receiveCard,
        returnCard: returnCard,
        settleCardsFromReplyText: settleCardsFromReplyText,
        getPendingUserCards: getPendingUserCards,
        recordBankFlow: recordBankFlow,
        parseMoneyAmount: parseMoneyAmount,
        setQuote: setQuote,
        clearQuote: clearQuote,
        enterMultiSelect: enterMultiSelect,
        exitMultiSelect: exitMultiSelect,
        handleReroll: handleReroll,
        jumpToMessage: jumpToMessage,
        clearAllMessages: clearAllMessages,
        showAlert: showAlert,
        scrollToBottom: scrollToBottom,
        messages: messages,
        displayName: displayName,
        currentUserName: currentUserName,
        loadMessages: loadMessages,
        isStorageReady: function() { return isStorageReady; },
        openCallSheet: openCallSheet,
        closeCallSheet: closeCallSheet,
        getCallRecord: getCallRecordFromDB,
        getAllCallRecords: getAllCallRecordsFromDB,
        acceptPendingListenInvite: acceptPendingListenInvite,
        hasPendingListenInvite: function () {
            return messages.some(function (m) {
                return m && !m.recalled && m.isCard && m.cardData && m.cardData.cardType === 'listen' &&
                    (m.cardData.direction || 'user') === 'char' && (m.cardData.status || 'pending') === 'pending';
            });
        }
    };

    // ===== 启动 =====
    (async function init() {
        // 预载表情包数据，让角色能知道自己可以调用哪些表情
        try { getEmojiData(); } catch (e) {}
        await loadAllCharactersFromDB();
        setupCharacter();

        // 先把长期记忆读出来，保证第一轮回复就能用上记忆库
        try { await refreshMemoryHints(); } catch (e) {}

        // ===== 绑定通话弹窗事件 =====
        bindCallSheetEvents();

        loadMessages(function(loaded) {
            if (!loaded) {
                // 不再自动补四句开场白：新角色进入为空白页
                messages.length = 0;
                messageIdCounter = 0;
                currentTurn = 0;
                renderMessages();
                saveMessages();
            }
            isStorageReady = true;
            if (jumpMsgId) {
                setTimeout(function() { jumpToMessage(jumpMsgId); }, 100);
            }
            // 启动主动发消息定时（若之前已开启）
            try { setAutoMsgState(getChatSetting('autoMsg', false), getChatSetting('autoMsgInterval', 8)); } catch (e) {}
            // 启动主动发朋友圈定时（若之前已开启）
            try { setAutoMomentState(getChatSetting('autoMoment', false), getChatSetting('autoMomentInterval', 12)); } catch (e) {}
            console.log('[Chat] 缓存加载完成，消息数:', messages.length);
            refreshMemoryHints();
            try { if (window.NanoBadge) window.NanoBadge.setContext(chatId); } catch (e) {}
            try { showPendingUserInvite(); } catch (e) {}
            // 音乐 App 发起的「一起听」邀请：进入该角色的聊天时补挂卡片
            try { consumePendingListenInvite(); } catch (e) {}
            // 音乐 App 结束一起听的提示：进入该角色的聊天时补上
            try { consumePendingListenNotice(); } catch (e) {}
            // 情侣空间分享卡片：进入该角色的聊天时补挂
            try { consumePendingCoupleShare(); } catch (e) {}
            // 断点续生成：上次离开时回复还没生成完，回到该聊天后继续加载
            try {
                if (chatPendingGet()) {
                    showTyping();
                    setTimeout(function() { resumeChatReply(); }, 400);
                } else {
                    updateSendButtonMode();
                }
            } catch (e) {}
            // 群聊里发起的“邀请角色进群”可能在私聊已打开后才到达，定时补挂邀请卡片
            setInterval(function () { try { showPendingUserInvite(); } catch (e) {} }, 5000);
        });
    })();

    console.log('[Chat] 核心功能已全部加载完成');
})();