# 小红书转Notion技能

这是一个OpenClaw技能，用于将小红书笔记内容提取并保存到Notion数据库中。

## 功能特点

- ✅ 自动检测小红书链接
- ✅ 提取笔记标题和简介
- ✅ 保存到Notion数据库
- ✅ 支持自定义标题和简介
- ✅ 简单易用的命令行接口

## 安装

### 1. 复制技能文件夹

将 `xiaohongshu-to-notion` 文件夹复制到OpenClaw的技能目录：

```bash
cp -r xiaohongshu-to-notion ~/.openclaw/skills/
```

### 2. 安装依赖

确保系统已安装以下工具：
- `curl` - 用于HTTP请求
- `jq` - 用于JSON处理（可选，用于高级功能）

在Ubuntu/Debian上：
```bash
sudo apt-get update
sudo apt-get install curl jq
```

在macOS上：
```bash
brew install curl jq
```

## 配置

### 1. 获取Notion API密钥

1. 访问 https://notion.so/my-integrations
2. 点击 "New integration"
3. 输入名称（如 "小红书转Notion"）
4. 复制生成的API密钥（以 `ntn_` 或 `secret_` 开头）

### 2. 创建Notion数据库

1. 在Notion中创建一个新页面
2. 选择 "Database" → "New database"
3. 添加以下三个属性：
   - **Name** - Title类型（用于笔记标题）
   - **URL** - URL类型（用于笔记链接）
   - **Summary** - Rich text类型（用于笔记简介）
4. 点击 "Share" → "Invite" → 选择你的集成

### 3. 获取数据库ID

1. 打开数据库页面
2. 查看URL：`https://notion.so/your-workspace/数据库ID?v=...`
3. 复制 `数据库ID`（32位十六进制字符串）

### 4. 设置环境变量

```bash
# 设置环境变量
export NOTION_API_KEY="ntn_your_api_key_here"
export NOTION_DATABASE_ID="your_database_id_here"

# 永久保存（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export NOTION_API_KEY="ntn_your_api_key_here"' >> ~/.bashrc
echo 'export NOTION_DATABASE_ID="your_database_id_here"' >> ~/.bashrc
source ~/.bashrc
```

## 使用方法

### 方法1：命令行直接使用

```bash
# 基本用法
bash simple_save.sh "https://www.xiaohongshu.com/discovery/item/..."

# 自定义标题和简介
bash simple_save.sh "https://..." "我的笔记标题" "笔记简介内容"

# 指定环境变量
NOTION_API_KEY="your_key" NOTION_DATABASE_ID="your_id" bash simple_save.sh "https://..."
```

### 方法2：使用完整脚本

```bash
# 给予执行权限
chmod +x xiaohongshu_to_notion.sh

# 运行
./xiaohongshu_to_notion.sh "https://www.xiaohongshu.com/discovery/item/..."

# 自定义选项
./xiaohongshu_to_notion.sh \
  -t "自定义标题" \
  -s "自定义简介" \
  "https://www.xiaohongshu.com/discovery/item/..."
```

### 方法3：在OpenClaw中自动触发

1. 配置OpenClaw的触发器，当检测到小红书链接时自动调用
2. 或者创建定时任务定期处理

## 集成到OpenClaw

### 作为技能使用

在OpenClaw中，可以通过以下方式使用：

```javascript
// 在OpenClaw脚本中调用
const { exec } = require('child_process');

function handleXiaohongshuLink(url, title, summary) {
    const cmd = `bash "${__dirname}/simple_save.sh" "${url}" "${title}" "${summary}"`;
    
    exec(cmd, { env: process.env }, (error, stdout, stderr) => {
        if (error) {
            console.error('保存失败:', error);
        } else {
            console.log('保存成功:', stdout);
        }
    });
}
```

### 自动响应QQ消息

当在QQ中收到小红书链接时，可以自动保存到Notion：

```javascript
// 在QQBot处理器中添加
if (message.includes('xiaohongshu.com')) {
    // 提取链接和信息
    const url = extractUrl(message);
    const { title, summary } = extractInfo(message);
    
    // 保存到Notion
    saveToNotion(url, title, summary);
    
    // 回复用户
    sendMessage('已保存到Notion数据库！');
}
```

## 示例

### 输入消息
```
[分享]听说小红书卖车很快，给华子寻个新主人
desc: 出售09福特嘉年华1.5手动两厢运动版，京牌外迁车
jump_url: https://www.xiaohongshu.com/discovery/item/69cb3d6a0000000022002cd7
```

### 处理结果
- **标题**: "听说小红书卖车很快，给华子寻个新主人"
- **链接**: "https://www.xiaohongshu.com/discovery/item/69cb3d6a0000000022002cd7"
- **简介**: "出售09福特嘉年华1.5手动两厢运动版，京牌外迁车"

### Notion数据库中的记录
```
Name: 听说小红书卖车很快，给华子寻个新主人
URL: https://www.xiaohongshu.com/discovery/item/69cb3d6a0000000022002cd7
Summary: 出售09福特嘉年华1.5手动两厢运动版，京牌外迁车
```

## 故障排除

### 常见问题

1. **API密钥错误**
   ```
   错误: 需要设置NOTION_API_KEY和NOTION_DATABASE_ID环境变量
   ```
   解决方案：检查环境变量是否正确设置

2. **权限错误**
   ```
   HTTP 403 - Forbidden
   ```
   解决方案：确保集成已被邀请到数据库

3. **数据库ID错误**
   ```
   HTTP 400 - Invalid database ID
   ```
   解决方案：检查数据库ID是否正确

4. **网络问题**
   ```
   curl: (7) Failed to connect to api.notion.com
   ```
   解决方案：检查网络连接

### 调试模式

```bash
# 启用详细输出
bash -x simple_save.sh "https://..."

# 查看环境变量
echo "API Key: $NOTION_API_KEY"
echo "DB ID: $NOTION_DATABASE_ID"
```

## 高级功能

### 批量处理

创建批量处理脚本：

```bash
#!/bin/bash
# batch_process.sh

while IFS= read -r url; do
    echo "处理: $url"
    bash simple_save.sh "$url"
    sleep 1  # 避免速率限制
done < xiaohongshu_links.txt
```

### 定时任务

使用cron定时检查并处理：

```bash
# 每天上午10点处理
0 10 * * * /path/to/xiaohongshu_to_notion.sh "https://example.com/link"
```

## 更新日志

### v1.0.0 (2026-04-11)
- 初始版本发布
- 支持小红书链接检测
- 支持Notion数据库保存
- 提供命令行接口

## 许可证

MIT License