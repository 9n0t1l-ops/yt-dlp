# YouTube 频道直播视频获取功能

这是 YouTube 浏览器扩展的新增功能，允许你获取 YouTube 频道的所有直播视频 ID。

## 功能特点

- **获取频道所有直播视频**：可以获取频道的所有直播、即将开始、以及过去的直播视频
- **使用浏览器 Cookies**：自动使用浏览器的登录状态，无需手动导出 Cookie 文件
- **视频分类统计**：自动统计正在直播、即将开始和过去的直播数量
- **一键复制**：可以快速复制单个或全部视频 ID
- **导出 JSON**：支持导出完整的视频信息为 JSON 格式
- **点击跳转**：点击视频标题可以直接打开对应的视频页面

## 使用方法

### 1. 安装扩展

#### Chrome/Edge (基于 Chromium 的浏览器)

1. 打开浏览器，访问 `chrome://extensions/` (或 `edge://extensions/`)
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目中的 `browser-extension` 目录

#### Firefox

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击"加载临时附加组件"
3. 进入 `browser-extension` 目录
4. 选择 `manifest.json` 文件

### 2. 获取频道直播视频

1. **打开 YouTube 频道页面**
   - 例如：`https://www.youtube.com/@chenyifaer`
   - 确保 URL 包含 `@频道名称` 格式

2. **点击扩展图标**
   - 在浏览器工具栏中点击扩展图标
   - 如果当前页面是频道页面，会自动切换到"Channel Live Streams"标签

3. **获取直播视频列表**
   - 点击"Fetch All Live Videos"按钮
   - 扩展会自动使用你的浏览器 Cookies 发起请求
   - 稍等片刻，视频列表会显示出来

4. **查看和使用视频信息**
   - 视频列表显示每个视频的标题和 ID
   - 🔴 LIVE：正在直播的视频
   - ⏰ UPCOMING：即将开始的直播
   - 无标记：过去的直播视频
   - 点击视频标题可以在新标签页打开该视频
   - 点击"Copy"按钮可以复制单个视频 ID

5. **批量操作**
   - **Copy All Video IDs**：将所有视频 ID 复制到剪贴板，每行一个
   - **Export as JSON**：导出包含所有视频详细信息的 JSON 文件

## 输出格式

### 视频列表显示

```
视频标题 🔴 LIVE
ID: VIDEO_ID [Copy]
```

### 复制所有 ID 格式

```
VIDEO_ID_1
VIDEO_ID_2
VIDEO_ID_3
...
```

### JSON 导出格式

```json
{
  "channel": {
    "id": "CHANNEL_ID",
    "title": "频道名称",
    "description": "频道描述",
    "url": "https://www.youtube.com/channel/CHANNEL_ID",
    "subscriberCountText": "订阅人数"
  },
  "videos": [
    {
      "videoId": "VIDEO_ID",
      "title": "视频标题",
      "url": "https://www.youtube.com/watch?v=VIDEO_ID",
      "isLive": true,
      "isUpcoming": false,
      "viewCountText": "观看次数",
      "publishedTimeText": "发布时间",
      "scheduledStartTime": "2024-01-01T00:00:00.000Z",
      "thumbnails": [...]
    }
  ],
  "totalCount": 10,
  "liveCount": 1,
  "upcomingCount": 2,
  "exportedAt": "2024-01-01T00:00:00.000Z"
}
```

## 技术实现

### 原理说明

1. **Cookie 认证**：扩展运行在浏览器环境中，可以直接访问 YouTube 的 Cookies，包括 SAPISID 用于生成授权头
2. **SAPISIDHASH 生成**：使用与 yt-dlp 相同的算法生成 YouTube API 所需的授权头
3. **频道数据获取**：访问频道的 `/streams` 页面，提取 `ytInitialData`
4. **视频识别**：解析页面数据，识别所有包含直播标记的视频
5. **状态判断**：根据视频的 badges 和 thumbnailOverlays 判断是否正在直播或即将开始

### 文件结构

```
browser-extension/
├── manifest.json           # 扩展配置文件（已更新）
├── popup.html             # 扩展弹出页面（已更新，包含两个标签）
├── popup.js               # 弹出页面逻辑（已更新，支持两个功能）
├── background.js          # 后台服务工作器（原有功能）
├── content.js             # 视频页面内容脚本（原有功能）
├── channel-content.js     # 频道页面内容脚本（新增）
└── README-CHANNEL-LIVES-ZH.md  # 本文档
```

### 与 yt-dlp 的对比

| 功能 | yt-dlp | 本扩展 |
|------|--------|--------|
| Cookie 处理 | 需要导出文件 (`--cookies`) | 自动使用浏览器 Cookies |
| 获取频道直播 | 需要命令行操作 | 浏览器点击操作 |
| SAPISIDHASH | ✅ | ✅ |
| 频道数据解析 | ✅ | ✅ |
| 视频状态判断 | ✅ | ✅ |
| 平台 | 命令行 (Python) | 浏览器扩展 (JavaScript) |

## 使用示例

### 示例 1：获取陈一发儿频道的直播视频

1. 访问 `https://www.youtube.com/@chenyifaer`
2. 点击扩展图标
3. 点击"Fetch All Live Videos"
4. 查看所有直播视频列表

### 示例 2：批量下载视频 ID

1. 按照示例 1 获取视频列表
2. 点击"Copy All Video IDs"
3. 将 ID 列表粘贴到文本文件
4. 配合 yt-dlp 命令行批量下载：

```bash
# Linux/Mac
cat video_ids.txt | while read id; do
  yt-dlp "https://www.youtube.com/watch?v=${id}"
done

# Windows PowerShell
Get-Content video_ids.txt | ForEach-Object {
  yt-dlp "https://www.youtube.com/watch?v=$_"
}
```

### 示例 3：导出并分析频道直播数据

1. 按照示例 1 获取视频列表
2. 点击"Export as JSON"
3. 保存 JSON 文件
4. 使用 Python 或其他工具分析数据：

```python
import json

with open('channel-lives.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"频道：{data['channel']['title']}")
print(f"总视频数：{data['totalCount']}")
print(f"正在直播：{data['liveCount']}")
print(f"即将开始：{data['upcomingCount']}")

for video in data['videos']:
    if video['isLive']:
        print(f"🔴 {video['title']}: {video['url']}")
```

## 权限说明

扩展需要以下权限：

- `activeTab`：与当前活动标签页交互
- `downloads`：保存导出的 JSON 文件
- `https://www.youtube.com/*`：访问 YouTube 页面和 API

## 故障排除

### "Navigate to a YouTube channel page"

- 确保你在频道页面，URL 格式应为 `https://www.youtube.com/@频道名称`
- 不要在视频播放页面或其他非频道页面使用此功能

### "Failed to fetch streams page"

- 检查网络连接
- 确保你已登录 YouTube 账号
- 刷新页面后重试

### "Unable to extract channel data"

- YouTube 页面结构可能已更新
- 尝试刷新页面
- 检查浏览器控制台是否有错误信息

### "No live videos found"

- 该频道可能没有任何直播视频（包括过去的）
- 确保频道确实有直播内容
- 某些频道可能限制了直播列表的访问

## 注意事项

1. **登录状态**：必须在浏览器中登录 YouTube 账号才能使用此功能
2. **频道权限**：某些私密频道或受限频道可能无法获取直播列表
3. **请求频率**：避免频繁请求，以免被 YouTube 限流
4. **数据准确性**：扩展会尽力识别所有直播视频，但无法保证 100% 准确
5. **浏览器兼容性**：推荐使用最新版本的 Chrome、Edge 或 Firefox

## 开发相关

### 基于的 YouTube 数据结构

- `ytInitialData`：页面初始数据
- `ytcfg`：YouTube 配置信息
- `videoRenderer`/`gridVideoRenderer`：视频渲染器对象
- `thumbnailOverlays`：缩略图覆盖层（用于判断直播状态）
- `badges`：视频标记（LIVE、UPCOMING 等）

### 参考资料

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 核心逻辑参考
- [YouTube API](https://developers.google.com/youtube) - API 文档
- [Chrome Extensions](https://developer.chrome.com/docs/extensions/) - 扩展开发文档

## 许可证

本扩展遵循与 yt-dlp 项目相同的许可证。

## 贡献

欢迎提交问题报告和功能建议！
