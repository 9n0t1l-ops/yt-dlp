# YouTube 实时聊天下载器 - 浏览器扩展

一个浏览器扩展，使用浏览器的 Cookie 下载 YouTube 实时聊天消息，模仿 `yt-dlp --write-subs --sub-lang "live_chat"` 的功能。

## 功能特性

- **下载聊天回放**：下载已结束直播的聊天记录
- **下载实时聊天**：下载正在进行的直播聊天消息（持续运行直到手动停止）
- **浏览器 Cookie 集成**：自动使用浏览器的 YouTube Cookie 进行认证（无需导出 Cookie 文件）
- **兼容 yt-dlp**：遵循与 yt-dlp 相同的实现逻辑
- **相同的输出格式**：生成与 yt-dlp 相同格式的 `.live_chat.json` 文件

## 实现原理

本扩展深度模仿了 yt-dlp 的实时聊天下载器实现：

### 架构设计

```
┌─────────────────┐
│  Popup UI       │  用户界面
│  (popup.js)     │
└────────┬────────┘
         │ 消息通信
         ↓
┌─────────────────┐
│  Background     │  状态管理、文件下载
│  (background.js)│
└────────┬────────┘
         │ 消息通信
         ↓
┌─────────────────┐
│  Content Script │  核心下载逻辑
│  (content.js)   │  在 YouTube 页面运行
└─────────────────┘
         │
         ↓ 调用 YouTube API
┌─────────────────┐
│  YouTube API    │  获取聊天消息
│  (InnerTube)    │
└─────────────────┘
```

### 从 yt-dlp 模仿的关键功能

#### 1. YouTube 配置提取

模仿 `yt_dlp/extractor/youtube/_base.py` 中的 `extract_ytcfg()`：

```javascript
// 提取 ytcfg（YouTube 配置）
const extractYtcfg = () => {
  if (window.ytcfg) {
    return window.ytcfg.data_;
  }
  // 从 HTML 中提取
  const match = document.documentElement.innerHTML.match(/ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/);
  return JSON.parse(match[1]);
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/extractor/youtube/_base.py
def extract_ytcfg(self, video_id, webpage):
    return self._parse_json(
        self._search_regex(
            r'ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;', 
            webpage, 'ytcfg', default='{}'), 
        video_id, fatal=False) or {}
```

#### 2. SAPISIDHASH 生成

模仿 `yt_dlp/extractor/youtube/_base.py` 中的 `_get_sid_authorization_header()`：

```javascript
// 生成 SAPISIDHASH 认证头
const generateAuthHeader = async (origin = 'https://www.youtube.com') => {
  const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID');
  const timestamp = Math.floor(Date.now() / 1000);
  const hashInput = `${timestamp} ${sapisid} ${origin}`;
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(hashInput));
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `SAPISIDHASH ${timestamp}_${hex}`;
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/extractor/youtube/_base.py
@staticmethod
def _make_sid_authorization(scheme, sid, origin, additional_parts):
    timestamp = str(round(time.time()))
    hash_parts = [timestamp, sid, origin]
    sidhash = hashlib.sha1(' '.join(hash_parts).encode()).hexdigest()
    return f'{scheme} {timestamp}_{sidhash}'
```

#### 3. API 请求头生成

模仿 `yt_dlp/extractor/youtube/_base.py` 中的 `generate_api_headers()`：

```javascript
// 生成 YouTube API 请求头
const buildApiHeaders = async (visitorData) => {
  const headers = {
    'Content-Type': 'application/json',
    'X-YouTube-Client-Name': '1',  // WEB client
    'X-YouTube-Client-Version': '2.20250925.01.00',
    'Origin': 'https://www.youtube.com',
    'X-Goog-Visitor-Id': visitorData,
  };
  
  const auth = await generateAuthHeader();
  if (auth) {
    headers['Authorization'] = auth;
    headers['X-Origin'] = 'https://www.youtube.com';
  }
  
  return headers;
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/extractor/youtube/_base.py
def generate_api_headers(self, *, ytcfg=None, visitor_data=None, ...):
    headers = {
        'X-YouTube-Client-Name': str(self._ytcfg_get_safe(...)),
        'X-YouTube-Client-Version': self._extract_client_version(...),
        'Origin': origin,
        'X-Goog-Visitor-Id': visitor_data or self._extract_visitor_data(ytcfg),
        **self._generate_cookie_auth_headers(...)
    }
    return filter_dict(headers)
```

#### 4. 聊天回放动作解析

模仿 `yt_dlp/downloader/youtube_live_chat.py` 中的 `parse_actions_replay()`：

```javascript
// 解析回放聊天动作
const parseReplayActions = (continuation) => {
  const lines = [];
  let offset = null;
  let continuationId = null;
  let clickTrackingParams = null;

  for (const action of continuation.actions || []) {
    const replay = action.replayChatItemAction;
    if (replay?.videoOffsetTimeMsec) {
      offset = parseInt(replay.videoOffsetTimeMsec, 10);
    }
    lines.push(`${JSON.stringify(action)}\n`);
  }

  // 获取下一个 continuation token
  for (const entry of continuation.continuations || []) {
    const contData = entry.liveChatReplayContinuationData;
    if (contData?.continuation) {
      continuationId = contData.continuation;
      clickTrackingParams = contData.clickTrackingParams;
      break;
    }
  }

  return { lines, continuationId, offset, clickTrackingParams };
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/downloader/youtube_live_chat.py
def parse_actions_replay(live_chat_continuation):
    offset = continuation_id = click_tracking_params = None
    processed_fragment = bytearray()
    for action in live_chat_continuation.get('actions', []):
        if 'replayChatItemAction' in action:
            replay_chat_item_action = action['replayChatItemAction']
            offset = int(replay_chat_item_action['videoOffsetTimeMsec'])
        processed_fragment.extend(
            json.dumps(action, ensure_ascii=False).encode() + b'\n')
    
    continuation = try_get(
        live_chat_continuation,
        lambda x: x['continuations'][0]['liveChatReplayContinuationData'], dict)
    if continuation:
        continuation_id = continuation.get('continuation')
        click_tracking_params = continuation.get('clickTrackingParams')
    
    return continuation_id, offset, click_tracking_params
```

#### 5. 实时聊天动作解析

模仿 `yt_dlp/downloader/youtube_live_chat.py` 中的 `parse_actions_live()`：

```javascript
// 解析实时聊天动作
const parseLiveActions = (continuation, liveOffset, startTime) => {
  const lines = [];
  let currentOffset = liveOffset;

  for (const action of continuation.actions || []) {
    const timestamp = parseLiveTimestamp(action);
    if (timestamp !== null) {
      currentOffset = timestamp - startTime;
    }

    // 转换为回放格式以保持兼容性
    const pseudoAction = {
      replayChatItemAction: { actions: [action] },
      videoOffsetTimeMsec: String(currentOffset),
      isLive: true,
    };
    lines.push(`${JSON.stringify(pseudoAction)}\n`);
  }

  // 获取延迟时间
  const timed = continuation.continuations?.[0]?.timedContinuationData;
  const timeoutMs = timed?.timeoutDurationMillis;

  return { lines, continuationId, timeoutMs, offset: currentOffset };
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/downloader/youtube_live_chat.py
def parse_actions_live(live_chat_continuation):
    nonlocal live_offset
    processed_fragment = bytearray()
    for action in live_chat_continuation.get('actions', []):
        timestamp = self.parse_live_timestamp(action)
        if timestamp is not None:
            live_offset = timestamp - start_time
        # 兼容回放格式
        pseudo_action = {
            'replayChatItemAction': {'actions': [action]},
            'videoOffsetTimeMsec': str(live_offset),
            'isLive': True,
        }
        processed_fragment.extend(
            json.dumps(pseudo_action, ensure_ascii=False).encode() + b'\n')
    
    continuation_data = try_get(live_chat_continuation, 
        lambda x: x['continuations'][0]['timedContinuationData'], dict)
    timeout_ms = int_or_none(continuation_data.get('timeoutMs'))
    if timeout_ms is not None:
        time.sleep(timeout_ms / 1000)
    
    return continuation_id, live_offset, click_tracking_params
```

#### 6. 时间戳解析

模仿 `yt_dlp/downloader/youtube_live_chat.py` 中的 `parse_live_timestamp()`：

```javascript
// 解析实时消息的时间戳
const parseLiveTimestamp = (action) => {
  const actionContent = action.addChatItemAction || 
                       action.addLiveChatTickerItemAction || 
                       action.addBannerToLiveChatCommand;
  
  if (!actionContent) return null;

  const item = actionContent.item || actionContent.bannerRenderer;
  if (!item) return null;

  // 查找渲染器
  let renderer = item.liveChatTextMessageRenderer || 
                 item.liveChatPaidMessageRenderer || 
                 item.liveChatMembershipItemRenderer ||
                 item.liveChatPaidStickerRenderer;
  
  if (!renderer) return null;

  // 提取时间戳（微秒）
  const timestampUsec = renderer.timestampUsec;
  if (!timestampUsec) return null;

  return Math.floor(parseInt(timestampUsec, 10) / 1000);  // 转换为毫秒
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/downloader/youtube_live_chat.py
@staticmethod
def parse_live_timestamp(action):
    action_content = dict_get(
        action,
        ['addChatItemAction', 'addLiveChatTickerItemAction', 'addBannerToLiveChatCommand'])
    if not isinstance(action_content, dict):
        return None
    item = dict_get(action_content, ['item', 'bannerRenderer'])
    if not isinstance(item, dict):
        return None
    renderer = dict_get(item, [
        'liveChatTextMessageRenderer', 'liveChatPaidMessageRenderer',
        'liveChatMembershipItemRenderer', 'liveChatPaidStickerRenderer',
    ])
    if not isinstance(renderer, dict):
        return None
    return int_or_none(renderer.get('timestampUsec'), 1000)
```

#### 7. 主下载循环

模仿 `yt_dlp/downloader/youtube_live_chat.py` 中的 `real_download()`：

```javascript
// 主下载函数
const commenceDownload = async (mode) => {
  // 1. 提取配置
  const ytcfg = extractYtcfg();
  const initialData = extractInitialData();
  const apiKey = ytcfg.INNERTUBE_API_KEY;
  const innertubeContext = ytcfg.INNERTUBE_CONTEXT;
  
  // 2. 构建 API URL
  const apiUrl = mode === 'replay'
    ? `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${apiKey}`
    : `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`;
  
  // 3. 循环下载片段
  let continuationId = initialContinuation.continuation;
  const allLines = [];
  let iteration = 0;
  
  while (continuationId && !state.shouldStop) {
    iteration++;
    
    // 第一次迭代：获取聊天页面
    if (iteration === 1) {
      const html = await fetchChatPage(chatPageUrl, headers);
      continuationPayload = parseContinuationFromHtml(html);
    } else {
      // 后续迭代：调用 API
      const body = {
        context: innertubeContext,
        continuation: continuationId,
        currentPlayerState: { playerOffsetMs: String(Math.max(offset - 5000, 0)) }
      };
      const data = await fetchContinuation(apiUrl, headers, body);
      continuationPayload = data.continuationContents.liveChatContinuation;
    }
    
    // 解析动作
    const result = mode === 'replay' 
      ? parseReplayActions(continuationPayload)
      : parseLiveActions(continuationPayload, liveOffset, startTime);
    
    allLines.push(...result.lines);
    continuationId = result.continuationId;
    offset = result.offset;
    
    // 实时模式需要等待
    if (result.timeoutMs) {
      await sleepWithStop(result.timeoutMs);
    }
  }
  
  // 4. 保存文件
  const output = allLines.join('');
  const fileName = `${videoId}.live_chat.json`;
  downloadFile(fileName, output);
};
```

**对应 yt-dlp 代码：**
```python
# yt_dlp/downloader/youtube_live_chat.py
def real_download(self, filename, info_dict):
    # 提取配置
    ytcfg = ie.extract_ytcfg(video_id, raw_fragment.decode('utf-8', 'replace'))
    api_key = try_get(ytcfg, lambda x: x['INNERTUBE_API_KEY'])
    innertube_context = try_get(ytcfg, lambda x: x['INNERTUBE_CONTEXT'])
    
    # 构建 URL
    if info_dict['protocol'] == 'youtube_live_chat_replay':
        url = 'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=' + api_key
    
    # 下载循环
    frag_index = offset = 0
    while continuation_id is not None:
        frag_index += 1
        
        if frag_index == 1:
            success, continuation_id, offset, click_tracking_params = download_and_parse_fragment(
                chat_page_url, frag_index)
        else:
            request_data = {
                'context': innertube_context,
                'continuation': continuation_id,
                'currentPlayerState': {'playerOffsetMs': str(max(offset - 5000, 0))}
            }
            success, continuation_id, offset, click_tracking_params = download_and_parse_fragment(
                url, frag_index, fragment_request_data, headers)
        
        if not success:
            return False
    
    return self._finish_frag_download(ctx, info_dict)
```

### API 端点

扩展使用与 yt-dlp 相同的 YouTube InnerTube API 端点：

- **回放聊天**: `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay`
- **实时聊天**: `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat`

### 输出格式

生成与 yt-dlp 完全相同的输出格式：
- 每行一个 JSON 对象（换行符分隔的 JSON）
- 包含 `replayChatItemAction` 结构
- 包含 `videoOffsetTimeMsec` 时间偏移
- 与 yt-dlp 的后处理器和解析器兼容

## 安装方法

### Chrome/Edge/Brave（基于 Chromium 的浏览器）

1. 打开浏览器，访问 `chrome://extensions/`（Edge 用户访问 `edge://extensions/`）
2. 启用右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `browser-extension` 目录

### Firefox

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `browser-extension` 目录中的 `manifest.json` 文件

### 验证安装

安装成功后：
- 浏览器工具栏会出现扩展图标
- 访问 YouTube 视频页面，点击图标应显示弹出窗口

## 使用方法

### 下载聊天回放（已结束的直播）

1. **访问 YouTube 视频**
   ```
   https://www.youtube.com/watch?v=VIDEO_ID
   ```
   确保视频是已结束的直播，并且有聊天回放

2. **打开扩展**
   - 点击浏览器工具栏的扩展图标
   - 应该看到"Download Live Chat (Replay)"按钮

3. **开始下载**
   - 点击"Download Live Chat (Replay)"按钮
   - 扩展会开始下载聊天记录
   - 弹出窗口会显示进度（已保存多少条消息）

4. **保存文件**
   - 下载完成后会弹出保存对话框
   - 默认文件名：`VIDEO_ID.live_chat.json`
   - 选择保存位置

### 下载实时聊天（正在进行的直播）

1. **访问正在直播的视频**
   ```
   https://www.youtube.com/watch?v=VIDEO_ID
   ```
   视频必须正在直播中

2. **打开扩展并开始下载**
   - 点击"Download Live Chat (Live)"按钮
   - 扩展会持续下载新的聊天消息
   - 实时显示已下载的消息数量

3. **停止下载**
   - 点击"Stop Download"按钮停止
   - 或者让它一直运行到直播结束

4. **保存文件**
   - 停止后会自动触发文件保存

### 与 yt-dlp 命令对比

```bash
# yt-dlp 命令
yt-dlp --cookies www.youtube.com_cookies.txt \
       --skip-download \
       --write-subs \
       --sub-lang "live_chat" \
       https://www.youtube.com/watch?v=bLEThN1LSsM

# 使用此扩展
# 1. 在浏览器中打开 https://www.youtube.com/watch?v=bLEThN1LSsM
# 2. 点击扩展图标
# 3. 点击 "Download Live Chat (Replay)"
# 4. 保存 bLEThN1LSsM.live_chat.json

# 结果：完全相同的输出文件！
```

## 输出文件格式

### 文件结构

输出的 `.live_chat.json` 文件格式：
- **换行符分隔的 JSON**（每行一个完整的 JSON 对象）
- 与 yt-dlp 输出 100% 兼容

### 示例输出

```json
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatTextMessageRenderer":{"message":{"runs":[{"text":"你好！"}]},"authorName":{"simpleText":"用户123"},"authorExternalChannelId":"UC...","timestampUsec":"1234567890123456","authorBadges":[],"id":"CjkKGkNQSEQySlRTb2ZjREZVQWhqUW9kS1Q0TElnEhtDSVh2cHFqVG9mY0RGVWE2andjZDFfWUFwdw%3D%3D"}}}}]},"videoOffsetTimeMsec":"123456"}
{"replayChatItemAction":{"actions":[{"addChatItemAction":{"item":{"liveChatPaidMessageRenderer":{"id":"ChwKGkNNblQ5SnpVb2ZjREZVRWlqUW9kNTN3Qzhn","timestampUsec":"1234567891234567","authorName":{"simpleText":"用户456"},"purchaseAmountText":{"simpleText":"¥30.00"},"message":{"runs":[{"text":"超级留言！"}]},"headerBackgroundColor":4278237396,"headerTextColor":4278190080,"bodyBackgroundColor":4278239141,"bodyTextColor":4278190080}}}}]},"videoOffsetTimeMsec":"124567"}
```

### 字段说明

每个聊天消息包含：

- `replayChatItemAction`: 回放动作容器
  - `actions`: 动作数组
    - `addChatItemAction`: 添加聊天项目
      - `item`: 消息项目
        - `liveChatTextMessageRenderer`: 普通文本消息
          - `message`: 消息内容
          - `authorName`: 作者名称
          - `timestampUsec`: 时间戳（微秒）
        - `liveChatPaidMessageRenderer`: 超级留言/打赏
          - `purchaseAmountText`: 金额
          - `message`: 消息内容
        - `liveChatMembershipItemRenderer`: 会员消息
- `videoOffsetTimeMsec`: 视频偏移时间（毫秒）
- `isLive`: 是否为实时消息（可选，仅实时下载时）

## 解析输出文件

### Python 解析示例

```python
import json

# 读取聊天文件
with open('VIDEO_ID.live_chat.json', 'r', encoding='utf-8') as f:
    for line in f:
        action = json.loads(line)
        
        # 获取回放动作
        replay_action = action.get('replayChatItemAction', {})
        actions = replay_action.get('actions', [])
        offset = action.get('videoOffsetTimeMsec', '0')
        
        for act in actions:
            if 'addChatItemAction' in act:
                item = act['addChatItemAction']['item']
                
                # 普通消息
                if 'liveChatTextMessageRenderer' in item:
                    renderer = item['liveChatTextMessageRenderer']
                    author = renderer['authorName']['simpleText']
                    message = ''.join([r['text'] for r in renderer['message']['runs']])
                    timestamp = int(renderer['timestampUsec']) // 1000000
                    print(f"[{offset}ms] {author}: {message}")
                
                # 超级留言
                elif 'liveChatPaidMessageRenderer' in item:
                    renderer = item['liveChatPaidMessageRenderer']
                    author = renderer['authorName']['simpleText']
                    amount = renderer['purchaseAmountText']['simpleText']
                    message = ''.join([r['text'] for r in renderer.get('message', {}).get('runs', [])])
                    print(f"[{offset}ms] 💰 {author} ({amount}): {message}")
```

### JavaScript 解析示例

```javascript
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('VIDEO_ID.live_chat.json'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  const action = JSON.parse(line);
  const replayAction = action.replayChatItemAction?.actions?.[0];
  const offset = action.videoOffsetTimeMsec || '0';
  
  if (replayAction?.addChatItemAction) {
    const item = replayAction.addChatItemAction.item;
    
    // 普通消息
    if (item.liveChatTextMessageRenderer) {
      const renderer = item.liveChatTextMessageRenderer;
      const author = renderer.authorName.simpleText;
      const message = renderer.message.runs.map(r => r.text).join('');
      console.log(`[${offset}ms] ${author}: ${message}`);
    }
    
    // 超级留言
    if (item.liveChatPaidMessageRenderer) {
      const renderer = item.liveChatPaidMessageRenderer;
      const author = renderer.authorName.simpleText;
      const amount = renderer.purchaseAmountText.simpleText;
      const message = renderer.message?.runs?.map(r => r.text).join('') || '';
      console.log(`[${offset}ms] 💰 ${author} (${amount}): ${message}`);
    }
  }
});
```

## 技术细节

### 权限说明

扩展需要以下权限：

- `activeTab`: 与当前 YouTube 标签页交互
- `downloads`: 保存聊天文件到本地
- `https://www.youtube.com/*`: 访问 YouTube 页面和 API

注意：**不需要** `cookies` 权限，因为内容脚本可以直接通过 `document.cookie` 访问当前域的 Cookie。

### Cookie 处理

扩展使用以下 Cookie 进行认证（与 yt-dlp 相同）：

- `SAPISID`: 主要认证 Cookie
- `__Secure-3PAPISID`: 备用认证 Cookie（更安全）
- `__Secure-1PAPISID`: 另一个备用选项

认证流程：
1. 从 `document.cookie` 读取 SAPISID
2. 生成 SAPISIDHASH：`SHA1(timestamp + " " + SAPISID + " " + origin)`
3. 添加到请求头：`Authorization: SAPISIDHASH timestamp_hash`

### 与 yt-dlp 的对比

| 特性 | yt-dlp | 此扩展 | 说明 |
|------|--------|--------|------|
| Cookie 处理 | 从文件导入 | 浏览器自动 | 扩展更方便 |
| 运行环境 | Python 命令行 | 浏览器 | 扩展无需安装 Python |
| 输出格式 | `.live_chat.json` | 相同 | 完全兼容 |
| API 端点 | InnerTube API | 相同 | 使用相同的 API |
| 认证方式 | SAPISIDHASH | 相同 | 相同的算法 |
| 实时下载 | 支持 | 支持 | 都支持 |
| 回放下载 | 支持 | 支持 | 都支持 |
| Continuation 解析 | Python 实现 | JavaScript 实现 | 逻辑相同 |

### 代码结构

```
browser-extension/
├── manifest.json          # 扩展清单（Manifest V3）
├── popup.html            # 弹出窗口 UI
├── popup.js              # UI 逻辑和状态管理
├── background.js         # Service Worker（状态协调、文件下载）
├── content.js            # 核心下载逻辑（运行在 YouTube 页面）
├── README.md             # 英文说明
├── readme-cn.md          # 中文说明（本文件）
└── USAGE.md              # 详细使用指南
```

### 工作流程

```
1. 用户访问 YouTube 视频页面
   ↓
2. content.js 注入到页面
   ↓
3. 用户点击扩展图标打开 popup
   ↓
4. popup.js 向 background.js 发送消息
   ↓
5. background.js 向 content.js 转发消息
   ↓
6. content.js 执行下载：
   a. 提取 ytcfg 和 initialData
   b. 生成 API 请求头
   c. 循环调用 InnerTube API
   d. 解析 continuation 数据
   e. 收集聊天消息
   ↓
7. 下载完成后，content.js 通知 background.js
   ↓
8. background.js 触发文件下载
   ↓
9. 浏览器保存 .live_chat.json 文件
```

## 常见问题

### 1. 为什么显示"无可用的实时聊天"？

**可能原因：**
- 视频没有启用聊天功能
- 对于回放：直播还未结束
- 某些视频的聊天被上传者禁用

**解决方法：**
- 确认视频确实有聊天功能
- 等待直播结束后再下载回放
- 尝试其他有聊天的视频

### 2. 下载开始后立即失败

**可能原因：**
- YouTube Cookie 已过期
- 网络连接问题
- YouTube API 限流

**解决方法：**
```bash
1. 刷新 YouTube 页面
2. 退出并重新登录 YouTube 账号
3. 清除 YouTube Cookie 后重新登录
4. 检查浏览器控制台（F12）查看详细错误
5. 等待几分钟后重试（如果是限流）
```

### 3. 文件为空或太小

**可能原因：**
- 视频的聊天消息确实很少
- 实时下载时过早停止
- 下载过程中出现错误

**解决方法：**
- 验证视频是否有足够的聊天消息
- 实时下载时等待更长时间
- 检查控制台是否有错误消息

### 4. 扩展图标显示为灰色

**可能原因：**
- 不在 YouTube 视频页面
- URL 格式不正确
- 扩展未正确加载

**解决方法：**
- 确保 URL 是 `youtube.com/watch?v=...` 格式
- 刷新页面
- 重新加载扩展

### 5. 与 yt-dlp 输出格式有差异吗？

**答案：没有差异！**

输出格式完全相同：
```bash
# 使用 yt-dlp
yt-dlp --cookies cookies.txt --skip-download --write-subs --sub-lang "live_chat" URL
# 生成: VIDEO_ID.live_chat.json

# 使用此扩展
# 生成: VIDEO_ID.live_chat.json

# 验证相同
diff yt-dlp_output.live_chat.json extension_output.live_chat.json
# 应该没有差异（时间戳可能略有不同，因为下载时间不同）
```

### 6. 可以同时下载多个视频的聊天吗？

**答案：可以！**

在不同的标签页中打开多个视频，每个标签页独立下载：
```
标签页 1: 视频 A → 下载聊天 A
标签页 2: 视频 B → 下载聊天 B
标签页 3: 视频 C → 下载聊天 C
```

每个下载都是独立的，不会相互干扰。

### 7. 为什么需要登录 YouTube？

**答案：不是必须的，但推荐。**

- **未登录**：可以下载公开视频的聊天
- **已登录**：
  - 可以下载会员专属聊天
  - 可以看到更多聊天细节（徽章等）
  - 更稳定的 API 访问
  - 生成 SAPISIDHASH 认证头

### 8. 如何调试扩展？

**打开浏览器开发者工具：**

1. **查看内容脚本日志**
   ```javascript
   // 在 YouTube 页面按 F12
   // 控制台中搜索 "[yt-dlp-livechat]"
   // 会看到：
   [yt-dlp-livechat] Content script initialized
   [yt-dlp-livechat] Fragment 1: +150 actions, total: 150
   [yt-dlp-livechat] Fragment 2: +200 actions, total: 350
   ```

2. **查看后台脚本**
   ```bash
   # Chrome/Edge
   1. 访问 chrome://extensions/
   2. 找到扩展
   3. 点击 "Service Worker" 查看日志
   
   # Firefox
   1. 访问 about:debugging
   2. 找到扩展
   3. 点击 "检查" 查看日志
   ```

3. **手动测试**
   ```javascript
   // 在 YouTube 页面的控制台中
   // 测试配置提取
   console.log(window.ytcfg.data_);
   console.log(window.ytInitialData);
   
   // 测试 Cookie
   console.log(document.cookie);
   ```

## 高级用法

### 批量处理

使用脚本自动化批量下载：

```javascript
// 在浏览器控制台中运行
const videos = [
  'VIDEO_ID_1',
  'VIDEO_ID_2',
  'VIDEO_ID_3',
];

for (const videoId of videos) {
  window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
  // 手动点击每个标签页的扩展按钮
  // 或者使用自动化工具如 Selenium
}
```

### 与 yt-dlp 后处理器集成

下载的文件可以直接用于 yt-dlp 的后处理流程：

```python
from yt_dlp.postprocessor.ffmpeg import FFmpegSubtitlesConvertorPP

# 将聊天转换为其他格式
# 使用 yt-dlp 的内置后处理器
```

### 自定义解析

创建自己的聊天分析工具：

```python
import json
from collections import Counter

# 统计聊天数据
authors = Counter()
messages_by_minute = Counter()

with open('VIDEO_ID.live_chat.json', 'r') as f:
    for line in f:
        action = json.loads(line)
        replay = action['replayChatItemAction']['actions'][0]
        
        if 'addChatItemAction' in replay:
            item = replay['addChatItemAction']['item']
            if 'liveChatTextMessageRenderer' in item:
                renderer = item['liveChatTextMessageRenderer']
                author = renderer['authorName']['simpleText']
                offset = int(action['videoOffsetTimeMsec'])
                minute = offset // 60000
                
                authors[author] += 1
                messages_by_minute[minute] += 1

print("最活跃的用户:", authors.most_common(10))
print("最活跃的时段:", messages_by_minute.most_common(10))
```

## 性能优化建议

1. **内存使用**
   - 长时间实时下载会积累大量消息
   - 建议定期停止并重新开始

2. **网络优化**
   - 扩展使用与 yt-dlp 相同的高效片段下载
   - 自动处理 API 延迟和重试

3. **文件大小**
   - 热门直播的聊天文件可能非常大（数百 MB）
   - 建议在 SSD 上保存文件以提高性能

## 贡献与反馈

### 报告问题

如果遇到问题：
1. 打开浏览器开发者工具（F12）
2. 复制控制台中的错误信息
3. 提供视频 URL 和扩展版本
4. 描述重现步骤

### 技术参考

本扩展基于以下 yt-dlp 源代码：
- `yt_dlp/downloader/youtube_live_chat.py` - 主要下载逻辑
- `yt_dlp/extractor/youtube/_base.py` - YouTube 基础提取器
- `yt_dlp/extractor/youtube/_video.py` - 视频信息提取

## 许可证

本扩展遵循与 yt-dlp 项目相同的许可证。

## 鸣谢

- 实现逻辑基于 [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- 特别模仿了 `YoutubeLiveChatFD`（`yt_dlp/downloader/youtube_live_chat.py`）

## 版本历史

### v1.0.0 (2024)
- ✅ 初始版本
- ✅ 支持聊天回放下载
- ✅ 支持实时聊天下载
- ✅ 完全模仿 yt-dlp 实现
- ✅ 相同的输出格式
- ✅ SAPISIDHASH 认证
- ✅ Manifest V3 支持
