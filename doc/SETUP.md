# 小红书转Notion技能 - 安装配置指南

## 快速开始

### 1. 复制技能到OpenClaw

```bash
# 复制到OpenClaw技能目录
cp -r xiaohongshu-to-notion ~/.openclaw/skills/

# 或者直接使用当前目录
# 技能已经在: C:\Users\Windy Taylor\.openclaw\workspace\skills\xiaohongshu-to-notion
```

### 2. 设置Notion集成

#### 步骤1：创建Notion集成
1. 访问 https://notion.so/my-integrations
2. 点击 "New integration"
3. 输入名称：`小红书转Notion`
4. 选择关联工作区
5. 点击 "Submit"
6. 复制 "Internal Integration Secret"（API密钥）

#### 步骤2：创建Notion数据库
1. 在Notion中创建新页面
2. 输入 `/database` 选择 "New database"
3. 添加以下属性：
   - **Name** - Title类型（第一列默认就是）
   - **URL** - URL类型（新增属性）
   - **Summary** - Text类型（新增属性）
4. 点击数据库右上角的 "Share"
5. 点击 "Invite"
6. 搜索并选择你的集成（小红书转Notion）
7. 点击 "Invite"

#### 步骤3：获取数据库ID
1. 打开数据库页面
2. 查看浏览器地址栏：
   ```
   https://notion.so/your-workspace/1234567890abcdef1234567890abcdef?v=...
   ```
3. 复制中间的部分：`1234567890abcdef1234567890abcdef`
   - 这是32位的十六进制字符串
   - 不包含 `https://notion.so/` 和 `?v=...`

### 3. 配置环境变量

#### Windows (CMD/PowerShell)
```cmd
# 临时设置
set NOTION_API_KEY=ntn_your_api_key_here
set NOTION_DATABASE_ID=your_database_id_here

# 永久设置（系统属性）
# 1. 右键"此电脑" → "属性"
# 2. "高级系统设置" → "环境变量"
# 3. 在"用户变量"或"系统变量"中添加
```

#### Windows (PowerShell永久)
```powershell
# 添加到用户配置文件
[System.Environment]::SetEnvironmentVariable("NOTION_API_KEY", "ntn_your_api_key_here", "User")
[System.Environment]::SetEnvironmentVariable("NOTION_DATABASE_ID", "your_database_id_here", "User")

# 重新打开PowerShell使生效
```

#### Linux/macOS (Bash)
```bash
# 临时设置
export NOTION_API_KEY="ntn_your_api_key_here"
export NOTION_DATABASE_ID="your_database_id_here"

# 永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export NOTION_API_KEY="ntn_your_api_key_here"' >> ~/.bashrc
echo 'export NOTION_DATABASE_ID="your_database_id_here"' >> ~/.bashrc
source ~/.bashrc
```

### 4. 测试安装

```bash
# 进入技能目录
cd "C:\Users\Windy Taylor\.openclaw\workspace\skills\xiaohongshu-to-notion"

# 运行测试
bash test.sh

# 简单测试（需要先设置环境变量）
bash simple_save.sh "https://www.xiaohongshu.com/discovery/item/test" "测试标题" "测试简介"
```

## 在OpenClaw中使用

### 方法1：手动调用

在OpenClaw会话中，可以直接执行：

```bash
# 设置环境变量（如果还没设置）
export NOTION_API_KEY="your_key"
export NOTION_DATABASE_ID="your_id"

# 保存小红书链接
bash skills/xiaohongshu-to-notion/simple_save.sh "https://xiaohongshu.com/..." "笔记标题" "笔记简介"
```

### 方法2：创建快捷命令

在OpenClaw中创建别名：

```bash
# 添加到 ~/.openclaw/workspace/TOOLS.md
### 小红书转Notion
- xhs2notion → 保存小红书到Notion
```

然后创建脚本：

```bash
#!/bin/bash
# ~/.openclaw/workspace/scripts/xhs2notion.sh

cd "C:\Users\Windy Taylor\.openclaw\workspace\skills\xiaohongshu-to-notion"
bash simple_save.sh "$1" "$2" "$3"
```

### 方法3：自动触发（推荐）

修改OpenClaw的QQBot配置，当收到小红书链接时自动保存：

1. 找到QQBot的处理器文件
2. 添加以下代码：

```javascript
// 检测小红书链接
if (message.includes('xiaohongshu.com')) {
    const { exec } = require('child_process');
    const skillPath = 'C:\\Users\\Windy Taylor\\.openclaw\\workspace\\skills\\xiaohongshu-to-notion';
    
    // 提取链接和信息
    const url = extractXiaohongshuUrl(message);
    const { title, summary } = extractNoteInfo(message);
    
    // 执行保存
    const cmd = `bash "${skillPath}/simple_save.sh" "${url}" "${title}" "${summary}"`;
    
    exec(cmd, { env: process.env }, (error, stdout) => {
        if (error) {
            console.error('保存失败:', error);
        } else {
            console.log('保存成功:', stdout);
            // 可选：发送确认消息给用户
            sendMessage('已保存到Notion数据库！');
        }
    });
}
```

## 配置示例

### 环境变量文件

创建 `.env` 文件：

```bash
# .env
NOTION_API_KEY=ntn_1234567890abcdef1234567890abcdef
NOTION_DATABASE_ID=1234567890abcdef1234567890abcdef
```

然后在脚本中加载：

```bash
# 加载.env文件
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi
```

### OpenClaw集成配置

在OpenClaw配置中添加：

```yaml
# openclaw.config.yaml
skills:
  xiaohongshu-to-notion:
    enabled: true
    env:
      NOTION_API_KEY: ${NOTION_API_KEY}
      NOTION_DATABASE_ID: ${NOTION_DATABASE_ID}
    triggers:
      - pattern: 'xiaohongshu\.com'
        action: save-to-notion
```

## 验证配置

### 验证步骤

1. **检查环境变量**
   ```bash
   echo "API Key: $NOTION_API_KEY"
   echo "DB ID: $NOTION_DATABASE_ID"
   ```

2. **测试Notion连接**
   ```bash
   curl -s "https://api.notion.com/v1/databases/$NOTION_DATABASE_ID" \
     -H "Authorization: Bearer $NOTION_API_KEY" \
     -H "Notion-Version: 2025-09-03" | jq '.title'
   ```

3. **测试完整流程**
   ```bash
   # 使用测试链接
   TEST_URL="https://www.xiaohongshu.com/discovery/item/test"
   bash simple_save.sh "$TEST_URL" "测试" "这是一个测试"
   ```

### 预期结果

成功时会在Notion数据库中看到新记录：
- **Name**: "测试"
- **URL**: "https://www.xiaohongshu.com/discovery/item/test"
- **Summary**: "这是一个测试"

## 故障排除

### 问题1：权限错误
```
HTTP 403 - Forbidden
```
**解决方案**：
1. 确认集成已被邀请到数据库
2. 检查数据库ID是否正确
3. 确认API密钥有效

### 问题2：数据库ID错误
```
HTTP 400 - Invalid database ID
```
**解决方案**：
1. 重新获取数据库ID
2. 确保ID是32位十六进制
3. 检查是否有空格或特殊字符

### 问题3：环境变量未生效
```
错误: 需要设置NOTION_API_KEY和NOTION_DATABASE_ID环境变量
```
**解决方案**：
1. 确认环境变量已设置：`echo $NOTION_API_KEY`
2. 重新启动终端或OpenClaw
3. 在命令前直接设置：`NOTION_API_KEY="key" NOTION_DATABASE_ID="id" bash script.sh`

### 问题4：脚本权限错误
```
bash: permission denied
```
**解决方案**：
```bash
chmod +x simple_save.sh xiaohongshu_to_notion.sh
```

## 高级配置

### 自定义属性名

如果Notion数据库中的属性名不同，修改 `simple_save.sh`：

```bash
# 修改属性名
"properties": {
    "笔记标题": {  # 原 "Name"
        "title": [...]
    },
    "链接": {      # 原 "URL"
        "url": "$URL"
    }
}
```

### 添加更多属性

在JSON中添加更多属性：

```json
"properties": {
    "Name": {...},
    "URL": {...},
    "Summary": {
        "rich_text": [{
            "text": { "content": "$SUMMARY" }
        }]
    },
    "保存时间": {
        "date": {
            "start": "$(date -Iseconds)"
        }
    }
}
```

## 支持

如有问题，请：
1. 检查日志文件
2. 运行测试脚本：`bash test.sh`
3. 查看Notion API文档：https://developers.notion.com
4. 检查OpenClaw日志

## 更新

要更新技能：
```bash
cd xiaohongshu-to-notion
git pull  # 如果使用git
# 或手动复制新文件
```

---

**技能创建完成！** 🎉

现在当你分享小红书链接时，内容会自动保存到Notion数据库。