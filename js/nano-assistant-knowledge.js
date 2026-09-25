// nano-assistant-knowledge.js — 内置助手「娜娜」的应用知识库
// 只描述「通过覆盖/存储能改的东西」+ 关键 CSS 选择器与 JS 接口，供模型按需引用。
window.NANO_ASSISTANT_KB = {
  about: [
    'Nano 是一个纯前端 PWA（HTML/CSS/JS），没有服务器。',
    '娜娜只能「覆盖」样式与写入存储（美化 CSS、世界书、角色、设置等），不能修改部署后的源代码文件。',
    '用户点各页面的「恢复默认 / 恢复」即可回到源代码外观，因为覆盖只存在于浏览器存储里。',
    '无法做到的事：新增页面、改后端逻辑、改 fetch 地址等，需要开发者改源码并重新部署。'
  ],

  // 美化可改的范围（scope）：对应存储键与目标
  scopes: [
    {
      id: 'global', name: '全局美化',
      storage: 'localStorage: beautify_global_v2（同时写 beautify_global）',
      target: 'global',
      desc: '作用于 index / chat 列表 / discover / more / api 等非聊天内页的整体 UI，包括底部 tab、顶栏、卡片、列表。',
      selectors: ['.top-bar', '#tabbar / .tabbar', '.list-item', '.card', '.profile-card']
    },
    {
      id: 'chat', name: '聊天美化',
      storage: 'localStorage: beautify_chat_v2（同时写 beautify_chat）',
      target: 'chat',
      desc: '作用于单聊 chat_inner 与群聊 groups 内页：顶栏 .topbar、底栏 .bottom-bar、气泡 .bubble、引用 .quote-block、译文 .translation-bubble、头像 .message-avatar；也可以改聊天背景 .chat-container / .message-scroll / body（background / background-image）。',
      selectors: ['.nano-chat-inner .topbar', '.nano-chat-inner .bottom-bar', '.bubble', '.bubble.other', '.bubble.me', '.quote-block', '.translation-bubble', '.message-content', '.nano-chat-inner .chat-container', '.nano-chat-inner .message-scroll']
    },
    {
      id: 'chat-avatar', name: '聊天头像',
      storage: 'localStorage: beautify_chat_avatar',
      target: 'chat-avatar',
      desc: '单独控制聊天气泡旁头像 .message-avatar 的圆角/大小/边框。',
      selectors: ['.message-avatar', '.message-avatar img']
    },
    {
      id: 'heart', name: '心声美化',
      storage: 'localStorage: nano_voice_applied_css',
      target: 'heart',
      desc: '心声弹层。根容器 .nano-voice-modal；可隐藏/移动头像、昵称、收件信息、主题、正文，隐藏红点。',
      selectors: ['.nano-voice-modal', '.nano-voice-modal .iv-avatar', '.iv-name', '.iv-meta', '.iv-subject', '.iv-content', '.iv-thought', '.iv-unread']
    },
    {
      id: 'offline', name: '线下美化',
      storage: 'IndexedDB MeetSettingsDB / settings / main_settings.customCSS',
      target: 'offline',
      desc: '线下聊天页整体样式（顶栏、底栏、气泡、推荐回复等）。写入后需重新打开线下聊天生效。',
      selectors: ['.offline-app', '.chat-header', '.chat-input', '.msg', '.bubble']
    }
  ],

  // 关键页面与脚本，问到时可按需 fetch 读取真实源码
  pages: [
    { file: 'index.html', name: '外壳/首页', note: 'iframe 容器、底部 tab、悬浮球、通知、键盘处理' },
    { file: 'chat.html', name: '聊天列表', note: '聊天/群聊列表、未读红点' },
    { file: 'chat_inner.html', name: '单聊内页', note: '聊天 UI 结构、心声弹层、美化面板' },
    { file: 'css/chat-inner.css', name: '单聊样式', note: '气泡/顶栏/底栏/译文/心声基础样式' },
    { file: 'js/chat-core.js', name: '单聊逻辑', note: '消息渲染、记忆、翻译、生图、自动消息' },
    { file: 'groups.html', name: '群聊内页' },
    { file: 'js/groups.js', name: '群聊逻辑' },
    { file: 'offline.html', name: '线下模式' },
    { file: 'js/offline.js', name: '线下逻辑', note: '线下设置/记忆/小剧场' },
    { file: 'inner-setting.html', name: '聊天设置' },
    { file: 'js/inner-setting.js', name: '聊天设置逻辑' },
    { file: 'more.html', name: '更多' },
    { file: 'js/worldbook.js', name: '世界书', note: '数据结构与导入导出' },
    { file: 'js/beautify.js', name: '美化编辑器' },
    { file: 'js/appearance.js', name: '外观注入', note: '读取 beautify_* 存储并注入样式' },
    { file: 'js/nano-global-template.js', name: '全局美化模板与钩子说明' },
    { file: 'js/nano-chat-template.js', name: '聊天美化模板与钩子说明' },
    { file: 'discover.html', name: '发现页' },
    { file: 'js/discover.js', name: '发现页逻辑（照片墙持久化）' },
    { file: 'backup.html', name: '备份' },
    { file: 'js/backup.js', name: '备份逻辑' }
  ],

  // 数据存储位置（写入时要遵守）
  storage: {
    beautifyGlobal: 'localStorage.beautify_global_v2',
    beautifyChat: 'localStorage.beautify_chat_v2',
    beautifyChatAvatar: 'localStorage.beautify_chat_avatar',
    heartCss: 'localStorage.nano_voice_applied_css',
    heartBuiltinPrompt: 'localStorage.nano_heart_builtin_prompt',
    translationMode: 'localStorage.nano_trans_separate（1=独立气泡 0=同一气泡）',
    offlineSettings: 'IndexedDB MeetSettingsDB/settings，主记录 id=main_settings，字段 customCSS',
    worldbook: 'IndexedDB nano_worldbook_db/worldbook_data，值结构 {key:"data", value:{groups:[], files:[]}}；files[].entries[] 为条目',
    emoji: 'IndexedDB nano_api_db/emoji_data，key=nano_emoji_data，值 {emojiGroups:[{id,name,emojis:[{id,name,url}]}], balance, favorites}；同时 localStorage.nano_emoji_data',
    characters: 'IndexedDB nano_characters_db/characters',
    mask: 'localStorage.nano_mask_data + IndexedDB nano_mask_db',
    apiConfig: 'IndexedDB nano_api_db/api_data/nano_api_config'
  },

  // 世界书条目字段
  worldbookEntryFields: ['id', 'enabled', 'title', 'keywords', 'keywordEnabled', 'vectorEnabled', 'permanent', 'position', 'scanDepth', 'priority', 'probability', 'content', 'collapsed'],

  // 助手可以下发的动作（写进 <action>...</action> 代码块）
  commands: [
    { tool: 'apply_beautify', args: { scope: 'global|chat|chat-avatar|heart|offline', name: '预设名', css: '完整 CSS' }, note: '覆盖对应美化，并自动存成可切换预设；用户可随时恢复默认' },
    { tool: 'add_worldbook', args: { name: '世界书名', entries: [{ title: '条目名', keywords: '触发词', content: '内容' }] }, note: '新增一本世界书（仅当用户明确要设定/世界书时用）' },
    { tool: 'add_emoji', args: { group: '分组名', emojis: [{ name: '表情名', url: '图片地址' }] }, note: '把「名字:图片链接」清单加入表情包（用户说加表情包时用这个，不要用 add_worldbook）' },
    { tool: 'set_chat_background', args: { color: '#ffffff', image: '图片URL（可选）' }, note: '直接更换当前聊天背景（颜色或图片）；用户说“换背景”优先用这个' },
    { tool: 'read_file', args: { path: 'js/chat-core.js' }, note: '只读，用于准确回答/给出修改步骤' },
    { tool: 'open_page', args: { url: 'beautify.html' }, note: '帮用户打开对应页面' }
  ]
};
