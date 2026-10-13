# iOS「窥屏 + 互动」完整配置流程

让角色（TA）看到你手机屏幕上的内容，并用人设点评、写进聊天；可选在灵动岛 / 锁屏实时显示。

> 结论先行：iOS 上第三方 **没有通用悬浮窗、也不能后台连续读屏**。
> 现实可行的做法是「**你按一下 → TA 看一眼 → TA 说话**」，触发用「快捷指令 + 轻点背面」，
> 显示用「通知」，要常驻小窗则必须配一个原生 App（灵动岛 / Live Activity）。

本仓库已内置 Web 侧支持：

| 文件 | 作用 |
| --- | --- |
| `js/screen-share.js` | 新增 `ScreenShare.commentText(info, text)`：让角色点评一段屏幕文本 |
| `js/keep-alive.js` | 新增 `NanoKeepAlive.setNowPlaying()`：用保活音频把点评显示到锁屏 / 灵动岛 |
| `js/ios-bridge.js` | 解析深链参数，把快捷指令送来的文本交给角色 / 写进聊天 |
| `ios-setting.html` | 图形化生成深链、接口地址与请求体 JSON（在 查手机 → 设置 → **iOS 快捷指令 · 窥屏** 打开） |
| `docs/ios-shortcuts.md` | 本文档 |

---

## 前置条件

1. **HTTPS 部署**：Nano 必须跑在 `https://` 上（PWA、剪贴板、通知都需要）。
2. **装到主屏**：Safari 打开 → 分享 → 添加到主屏幕，之后以独立 App 形态运行。
3. **配置主 API**：在 API 页填好 接口地址 / Key / 模型。识图或长文本模型效果更好。
4. **生成参数**：打开 `ios-setting.html`（手机 → 设置 → iOS 快捷指令 · 窥屏），
   它会根据你选的角色和 API 配置，生成下面要用到的 **深链** 和 **请求体 JSON**。

---

## Part 1 — 方式 A：让 Nano 点评（推荐，Key 不出手机）

快捷指令只负责「截图 + 识别文本 + 打开 URL」，点评由 Nano 用你自己的 API 完成。

### 快捷指令步骤

1. 打开「**快捷指令**」App → 右上角 **+** 新建。
2. 添加动作 **截图**（Take Screenshot）。
3. 添加动作 **从图像中提取文本**（Extract Text from Image）。
4. 添加动作 **打开 URL**，粘贴 `ios-setting.html` 里的「方式 A 深链」，形如：

   ```
   https://你的域名/index.html?nanoScreen={{识别文本}}&nanoChat=<角色ID>&nanoName=<角色名>
   ```

   把 URL 里的 `{{识别文本}}` 删掉，改插入第 3 步「提取的文本」变量。

5. 命名快捷指令，例如「窥屏」。

### 运行效果

运行后：TA 看到你屏幕上的内容 → 弹出点评面板 + 发系统通知 → 点评作为角色消息写进对应聊天。
深链参数会被自动清理，刷新 / 重开不会重复触发。

### 触发方式（更顺手）

- **轻点背面**：设置 → 辅助功能 → 触控 → 轻点背面 → 轻点两下 → 选「窥屏」。
- **个人自动化**：快捷指令 → 自动化 → 新建（打开某 App / 特定时间 / 专注模式）→ 运行快捷指令。
  iOS 15.4+ 可关闭「运行前询问」。
- **共享表单**：在快捷指令设置里开启「在共享表单中显示」，可从其它 App 分享文本/图片给它。

### 深链参数说明

| 参数 | 含义 |
| --- | --- |
| `nanoScreen` | 屏幕识别文本；Nano 会调用主 API 让角色点评 |
| `nanoScreenReply` | 直接把这段文字作为角色消息写进聊天（方式 B 用） |
| `nanoChat` | 角色 ID（省略则用最近一次会话） |
| `nanoName` | 角色名（可选） |

---

## Part 2 — 方式 B：快捷指令直连 API（可弹通知）

快捷指令自己 POST 到你的接口拿回复，再回传 Nano；也可以先弹通知。适合想在快捷指令里直接看到回复的场景。

### 1. 把文本发给模型

添加动作 **获取 URL 内容**：

- 网址：`https://你的接口/v1/chat/completions`
- 方法：`POST`
- 头部：
  - `Authorization` = `Bearer <你的 Key>`
  - `Content-Type` = `application/json`
- 请求体：选 **文件** → 引用一个 **文本** 动作，内容用 `ios-setting.html` 生成的 JSON，把 `{{屏幕文本}}` 换成 OCR 变量。示例：

  ```json
  {
    "model": "你的模型",
    "messages": [
      { "role": "system", "content": "你是「小柒」。用你的人设随口点评。" },
      { "role": "user", "content": "这是用户手机屏幕上的一段内容，用你的人设随口点评 2~3 句：\n{{屏幕文本}}" }
    ],
    "max_tokens": 800,
    "temperature": 0.9
  }
  ```

### 2. 取出回复

添加 **获取字典值**：`choices` → 第 1 项 → `message` → `content`。

### 3. 显示

- 想要通知：添加 **显示通知**，内容放上一步的回复。
- 想写进聊天：添加 **打开 URL**，用「方式 B 回传深链」，把 `{{模型回复}}` 换成回复变量：

  ```
  https://你的域名/index.html?nanoScreenReply={{模型回复}}&nanoChat=<角色ID>&nanoName=<角色名>
  ```

> 安全性：方式 B 会把 API Key 明文存在快捷指令里，并可能被 iCloud 同步。更安全的做法是方式 A，或让 Key 只留在服务端（见下方「服务端代理」）。

### 服务端代理（可选，Key 不落在手机）

如果不想把 Key 放进快捷指令，可在你的服务器 / Cloudflare Worker（本仓库有 `push-worker/`）加一个 `/screen` 接口：
接收 `{ text }`，用服务端保存的 Key 调模型，返回纯文本。快捷指令 POST 到 `https://你的域名/screen` 即可，Key 不出服务器。

---

## Part 3 — 灵动岛 / 锁屏实时显示（需要原生 App）

**纯快捷指令开不了灵动岛。** 灵动岛 / 锁屏实时活动是 iOS 的 **Live Activity**，只能由原生 App 用 **ActivityKit** 创建和更新。因此需要一个小 App（可以把你现有的 Web 前端用 `WKWebView` 套壳，逻辑复用）。

### 3.0 捷径：用保活音频把 TA 的点评放进灵动岛（无需原生 App）

你提到的「假装播放一段无声音频来保活」——**可行**，而且本仓库已经在用（`js/keep-alive.js`）：
它让一段完全静音的音频循环播放，并设置 `navigator.mediaSession.metadata`，于是 iOS 会把这个页面当成一个**真实的媒体播放器**，
在 **锁屏 / 控制中心 / 灵动岛** 的「正在播放」位置显示 标题 / 艺术家 / 封面 + 播放控制。

所以：**把「点评」写进 MediaSession 元数据，就能在灵动岛（媒体播放位）看到**：

- 标题 = 角色名，艺术家 = 最新一句点评，封面 = 角色头像。
- 新版已加 `NanoKeepAlive.setNowPlaying({ title, artist, artwork })`，
  `screen-share.js` / `ios-bridge.js` 在点评到达时已自动调用它。
- 想要更主动地控制，在页面里调用即可：

  ```js
  NanoKeepAlive.setNowPlaying({ title: '小柒', artist: '你在看什么呢…', artwork: 'icons/icon-512.png' });
  // 恢复默认（回到「Nano 保活中」）
  NanoKeepAlive.clearNowPlaying();
  ```

**它和真·Live Activity 的区别（重要）：**

| | 保活音频（MediaSession） | 原生 Live Activity |
| --- | --- | --- |
| 出现在灵动岛 | 会（媒体播放位，像音乐 App 的迷你窗） | 会（自定义布局） |
| 能显示什么 | 仅 标题 / 艺术家 / 封面 一行文本 + 播放控制 | 任意布局、多行、按钮、气泡 |
| 交互 | 只有 播放 / 暂停 | 可放自定义 `Button(intent:)` |
| 前提 | 必须有（静音）音频在播放，通常要「保活」已开启、或用户先触摸过页面 | 需要原生 App |
| 生命周期 | 音频被系统掐断就消失 | 约 8 小时活跃 + 数小时锁屏 |

> 结论：**不想写原生 App，就用保活音频 + `setNowPlaying`，TA 的点评能在灵动岛/锁屏出现**；
> 想要自定义界面（气泡、按钮、多行），才需要下面的原生 ActivityKit。

原生方案完整链路：

```
轻点背面 → 快捷指令(截图+OCR+POST) → 得到回复
        → 调 App Intent（后台执行）→ App 更新 Live Activity
        → 灵动岛显示「角色 + 一句点评」→ 点开 App 继续聊
```

### 3.1 环境

- Xcode 15+，iOS 16.1+（灵动岛需要 iPhone 14 Pro 及以上；其它机型显示在锁屏）。
- 准备 Bundle ID，例如 `com.you.nano`。

### 3.2 新建工程与扩展

1. Xcode → File → New → Project → **App**（SwiftUI，命名 `Nano`）。
2. 再新建一个 **Widget Extension**（命名 `NanoWidget`），勾选 **Include Live Activity**。
3. 在 App target 的 **Signing & Capabilities** 里确认已启用 **Push Notifications**（用推送更新时需要）。
4. 两个 target 的 `Info.plist` 都加入：
   ```xml
   <key>NSSupportsLiveActivities</key><true/>
   ```
   如需高频更新（推送频繁）再加：
   ```xml
   <key>NSSupportsLiveActivitiesFrequentUpdates</key><true/>
   ```

### 3.3 共享属性（App 与 Widget 共用）

`NanoActivityAttributes.swift`（两个 target 都要加入成员资格）：

```swift
import ActivityKit

struct NanoActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var name: String        // 角色名
        var saying: String      // 最新一句点评
        var avatar: String?     // 头像 URL（可空）
    }
    var title: String = "Nano"
}
```

### 3.4 灵动岛 / 锁屏视图（Widget 扩展）

`NanoWidgetBundle.swift`：

```swift
import WidgetKit
import SwiftUI
import AppIntents

@main
struct NanoWidgetBundle: WidgetBundle {
    var body: some Widget { NanoLiveActivity() }
}

struct NanoLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NanoActivityAttributes.self) { context in
            // 锁屏 / 通知中心
            VStack(alignment: .leading, spacing: 6) {
                Text(context.state.name).font(.headline)
                Text(context.state.saying).font(.body)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.6))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.state.name).font(.caption).bold()
                        Text(context.state.saying).font(.footnote).lineLimit(2)
                    }
                }
            } compactLeading: {
                Text("◆").foregroundStyle(.pink)
            } compactTrailing: {
                Text(context.state.name.prefix(4)).font(.caption2)
            } minimal: {
                Text("◆").foregroundStyle(.pink)
            }
            .keylineTint(.pink)
        }
    }
}
```

> iOS 17+ 可在 Live Activity 视图里加 `Button(intent: SomeAppIntent())` 做「换一句 / 停下」等交互按钮；
> 但 **没有文本输入框**，要打字就点灵动岛 → 深链打开 App。

### 3.5 App 侧：开始 / 更新活动

`LiveActivityManager.swift`：

```swift
import ActivityKit

@available(iOS 16.1, *)
enum LiveActivityManager {
    static func start(name: String, saying: String) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attrs = NanoActivityAttributes()
        let state = NanoActivityAttributes.ContentState(name: name, saying: saying)
        _ = try? Activity.request(
            attributes: attrs,
            content: .init(state: state, staleDate: nil),
            pushType: .token      // 需要服务端推送更新时用 .token
        )
    }

    static func update(name: String, saying: String) async {
        let state = NanoActivityAttributes.ContentState(name: name, saying: saying)
        for activity in Activity<NanoActivityAttributes>.activities {
            await activity.update(.init(state: state, staleDate: nil))
        }
    }

    static func end() async {
        for activity in Activity<NanoActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
```

### 3.6 让快捷指令驱动它：App Intent

`ShowNanoCommentIntent.swift`（加进 App target 即可，快捷指令会自动发现）：

```swift
import AppIntents

struct ShowNanoCommentIntent: AppIntent {
    static var title: LocalizedStringResource = "显示 Nano 点评"
    static var openAppWhenRun: Bool = false   // 关键：后台执行，不把你从当前 App 拽走

    @Parameter(title: "角色名") var name: String
    @Parameter(title: "点评内容") var saying: String

    func perform() async throws -> some IntentResult {
        if #available(iOS 16.1, *) {
            if Activity<NanoActivityAttributes>.activities.isEmpty {
                LiveActivityManager.start(name: name, saying: saying)
            } else {
                await LiveActivityManager.update(name: name, saying: saying)
            }
        }
        return .result()
    }
}
```

在快捷指令里，方式 B 拿到回复后，加一个 **「显示 Nano 点评」** 动作（能搜到上面的 App Intent），
把角色名和回复变量填进去即可，**无需把 App 拉到前台**。

### 3.7 服务端推送更新（可选，最省电）

用 APNs 直接更新灵动岛，不必每次唤起 App：

1. App 用 `pushType: .token` 启动活动，并监听 `activity.pushTokenUpdates`，把 token 上报到你的服务器
   （可复用本仓库 `push-worker/`）。
2. 服务器向 APNs 发送请求：
   - `apns-topic`: `<BundleID>.push-type.liveactivity`
   - `apns-push-type`: `liveactivity`
   - `apns-priority`: `5`（或 `10`）
   - payload 示例（更新）：
     ```json
     {
       "aps": {
         "timestamp": 1700000000,
         "event": "update",
         "content-state": { "name": "小柒", "saying": "你在看什么呢…" }
       }
     }
     ```
   - 首次创建用 `"event": "start"`，结束用 `"event": "end"`。

> APNs 的 JWT / HTTP2 细节与 Apple 官方一致，具体以 Apple 文档为准。

### 3.8 复用现有前端

把 Nano 前端放进去（例如 `WKWebView` 加载你的站点或打包的资源），原生层只需：
- 提供一个 JS Bridge，把 `startNanoLiveActivity(name, saying)` 暴露给网页；
- 或用原生收发 API，再更新 Live Activity。
这样人设、世界书、记忆、聊天记录都继续用现有实现。

---

## Part 4 — 限制与隐私

- **不是悬浮窗**：iOS 没有通用悬浮窗。最接近的是「画中画（PiP）」，但 PiP 里只有播放/暂停控件，不能自由交互聊天，只能单向显示。
- **不能实时窥屏**：快捷指令靠你手动触发（或自动化事件），做不到后台连续读屏。
- **灵动岛有生命周期上限**：Live Activity 活跃时长有限、结束后锁屏还会保留一段时间即被系统回收，**不是永久常驻**，以官方文档为准。
- **机型限制**：灵动岛仅 iPhone 14 Pro 及以上；其余机型只显示在锁屏。
- **存储隔离**：iOS 上「主屏安装的 PWA」和「Safari 标签页」的本地存储可能相互隔离。若深链在 Safari 打开而不是 PWA，可能读不到聊天数据——此时用方式 B 的「显示通知」最稳，或确保深链真的进入了已安装的 PWA。
- **隐私**：截屏可能包含聊天记录、验证码等敏感内容，请自行判断是否发送给第三方模型；方式 B 会明文保存 Key，注意安全。
- **审核**：这类「常驻窥屏 + 悬浮」用途在 App Store 审核偏灰，自用建议侧载分发。

---

## 快速自检

- [ ] 站点是 HTTPS，已添加到主屏
- [ ] 主 API（含识图/长文本模型）配置可用
- [ ] `ios-setting.html` 能读到角色与接口信息
- [ ] 方式 A：轻点背面 → TA 点评并写进聊天
- [ ] 方式 B：快捷指令能拿到 `content` 并弹通知
- [ ] （可选）灵动岛：原生 App 已启用 Live Activities，App Intent 能被快捷指令搜到
