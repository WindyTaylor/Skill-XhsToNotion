# 🚀 小红书转Notion - 快速配置指南

## ⏱️ 5分钟完成配置

### 第1分钟：获取Notion API密钥
1. 访问：**https://notion.so/my-integrations**
2. 点击 **"New integration"**
3. 输入名称：`小红书转Notion`
4. 点击 **"Submit"**
5. 复制 **"Internal Integration Secret"**
   - 格式：`ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - 示例：`ntn_1234567890abcdef1234567890abcdef`

### 第2分钟：创建Notion数据库
1. 在Notion中新建页面
2. 输入 `/database` 选择 **"New database"**
3. 添加三列：
   - **第一列**：`Name` (Title类型，默认就有)
   - **第二列**：`URL` (URL类型，点击"+"添加)
   - **第三列**：`Summary` (Text类型，点击"+"添加)
4. 点击右上角 **"Share"** → **"Invite"**
5. 搜索并选择 `小红书转Notion` 集成
6. 点击 **"Invite"**

### 第3分钟：获取数据库ID
1. 打开数据库页面
2. 查看浏览器地址栏：
   ```
   https://notion.so/your-workspace/1234567890abcdef1234567890abcdef?v=...
   ```
3. 复制中间部分：`1234567890abcdef1234567890abcdef`
   - 32位十六进制字符串
   - 不包括前后的内容

### 第4分钟：设置环境变量（Windows）

#### 方法A：使用PowerShell脚本（推荐）
```powershell
# 1. 进入技能目录
cd "C:\Users\Windy Taylor\.openclaw\workspace\skills\xiaohongshu-to-notion"

# 2. 以管理员身份运行PowerShell
#    右键点击PowerShell → "以管理员身份运行"

# 3. 运行设置脚本
.\setup_env.ps1

# 4. 按照提示输入API密钥和数据库ID
```

#### 方法B：手动设置
1. 右键点击 **"此电脑"** → **"属性"**
2. 点击 **"高级系统设置"**
3. 点击 **"环境变量"**
4. 在 **"用户变量"** 部分点击 **"新建"**
5. 添加两个变量：
   - 变量名：`NOTION_API_KEY`
     变量值：`你的API密钥`
   - 变量名：`NOTION_DATABASE_ID`
     变量值：`你的数据库ID`
6. 点击 **"确定"** 保存

#### 方法C：临时设置（测试用）
```powershell
# 在当前会话中临时设置
$env:NOTION_API_KEY="ntn_your_api_key"
$env:NOTION_DATABASE_ID="your_database_id"
```

### 第5分钟：测试配置

```powershell
# 进入技能目录
cd "C:\Users\Windy Taylor\.openclaw\workspace\skills\xiaohongshu-to-notion"

# 运行测试
.\test_env.ps1

# 或运行完整测试
bash test.sh

# 测试保存功能（使用测试链接）
bash simple_save.sh "https://example.com/test" "测试标题" "测试内容"
```

## ✅ 验证成功标志

如果配置成功，你应该看到：
1. ✅ 环境变量已正确设置
2. ✅ 测试脚本运行通过
3. ✅ Notion数据库中出现新记录

## 🔧 故障排除

### 问题1：环境变量不生效
**症状**：脚本提示"需要设置环境变量"
**解决**：
```powershell
# 重启PowerShell或OpenClaw
# 或者在新终端中测试
echo $env:NOTION_API_KEY
```

### 问题2：权限错误
**症状**：HTTP 403 Forbidden
**解决**：
1. 确认集成已被邀请到数据库
2. 重新分享数据库：Share → Invite → 选择集成
3. 检查API密钥是否正确

### 问题3：数据库ID错误
**症状**：HTTP 400 Invalid database ID
**解决**：
1. 重新获取数据库ID
2. 确保是32位十六进制
3. 检查是否有空格

### 问题4：脚本无法执行
**症状**：bash命令找不到
**解决**：
```powershell
# 安装Git Bash或WSL
# 或者使用PowerShell版本

# 给予执行权限
icacls simple_save.sh /grant:r "%USERNAME%:RX"
```

## 📝 配置检查清单

- [ ] Notion API密钥已获取
- [ ] Notion数据库已创建
- [ ] 数据库包含三列：Name, URL, Summary
- [ ] 集成已被邀请到数据库
- [ ] 数据库ID已复制
- [ ] 环境变量已设置
- [ ] 测试脚本运行通过

## 🎯 快速测试命令

```powershell
# 检查环境变量
echo "API Key: $env:NOTION_API_KEY"
echo "DB ID: $env:NOTION_DATABASE_ID"

# 测试Notion连接
$headers = @{
    "Authorization" = "Bearer $env:NOTION_API_KEY"
    "Notion-Version" = "2025-09-03"
}
Invoke-RestMethod -Uri "https://api.notion.com/v1/databases/$env:NOTION_DATABASE_ID" -Headers $headers

# 测试保存
bash simple_save.sh "https://xiaohongshu.com/test" "测试" "这是一个测试"
```

## 💡 提示

1. **保存好API密钥**：一旦丢失需要重新创建
2. **数据库ID不变**：除非删除重建数据库
3. **环境变量需要重启**：设置后重启终端生效
4. **先测试再使用**：确保一切正常后再分享链接

## 🆘 需要帮助？

如果遇到问题：
1. 运行 `.\setup_env.ps1` 查看详细错误
2. 检查Notion集成的权限
3. 确认数据库属性名称正确
4. 查看脚本日志输出

---

**配置完成后**，当你分享小红书链接时，内容会自动保存到Notion数据库！ 🎉

现在你可以：
1. 分享一个小红书链接测试
2. 查看Notion数据库是否出现新记录
3. 根据需要调整标题和简介的提取逻辑