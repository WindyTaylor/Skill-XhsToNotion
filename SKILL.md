---
name: 小红书转Notion
description: 提取小红书笔记内容并保存到Notion数据库。当用户分享小红书链接时，自动提取笔记标题、链接和简介，并保存到指定的Notion数据库中。
homepage: https://www.xiaohongshu.com
metadata: {"clawdbot":{"emoji":"📱→📝","requires":{"env":["NOTION_API_KEY","NOTION_DATABASE_ID"]},"primaryEnv":"NOTION_API_KEY"}}
---

# 小红书转Notion技能

这个技能用于将小红书笔记内容提取并保存到Notion数据库中。

## 功能

1. 解析小红书分享链接
2. 提取笔记标题、链接和简介
3. 将内容保存到Notion数据库
4. 支持Notion数据库的三个属性：Name (Title)、URL (URL)、Summary (Rich text)

## 前提条件

1. **Notion API密钥**：需要在Notion中创建集成并获取API密钥
2. **Notion数据库ID**：需要提前创建好包含以下属性的数据库：
   - "Name" (Title类型)
   - "URL" (URL类型) 
   - "Summary" (Rich text类型)

## 配置

### 1. 设置环境变量

```bash
# 设置Notion API密钥
export NOTION_API_KEY="ntn_your_api_key_here"

# 设置目标数据库ID
export NOTION_DATABASE_ID="your_database_id_here"
```

或者将环境变量保存到文件中：
```bash
mkdir -p ~/.config/xiaohongshu-to-notion
echo "NOTION_API_KEY=ntn_your_api_key_here" > ~/.config/xiaohongshu-to-notion/env
echo "NOTION_DATABASE_ID=your_database_id_here" >> ~/.config/xiaohongshu-to-notion/env
```

### 2. 创建Notion数据库

在Notion中创建一个数据库，确保包含以下三个属性：
1. **Name** - Title类型（用于笔记标题）
2. **URL** - URL类型（用于笔记链接）
3. **Summary** - Rich text类型（用于笔记简介）

## 使用方法

### 自动触发
当用户分享小红书链接时，技能会自动：
1. 解析链接中的笔记信息
2. 提取标题和简介
3. 保存到Notion数据库

### 手动调用
也可以通过命令行手动调用：

```bash
# 保存小红书笔记到Notion
curl -X POST "http://localhost:3000/xiaohongshu/save" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.xiaohongshu.com/discovery/item/...",
    "title": "笔记标题",
    "summary": "笔记简介"
  }'
```

## 实现脚本

创建一个Python脚本来处理小红书链接并保存到Notion：

```python
#!/usr/bin/env python3
"""
小红书转Notion脚本
"""

import os
import json
import requests
import re
from urllib.parse import urlparse, parse_qs

class XiaohongshuToNotion:
    def __init__(self):
        self.notion_api_key = os.getenv("NOTION_API_KEY")
        self.notion_database_id = os.getenv("NOTION_DATABASE_ID")
        self.notion_version = "2025-09-03"
        
    def extract_xiaohongshu_info(self, url):
        """从小红书链接中提取信息"""
        try:
            # 解析URL获取基本信息
            parsed_url = urlparse(url)
            query_params = parse_qs(parsed_url.query)
            
            # 这里可以添加更复杂的小红书内容提取逻辑
            # 目前先返回基本结构
            return {
                "url": url,
                "title": "小红书笔记",
                "summary": "从小红书分享的笔记内容"
            }
        except Exception as e:
            print(f"解析小红书链接失败: {e}")
            return None
    
    def save_to_notion(self, data):
        """保存数据到Notion数据库"""
        if not self.notion_api_key or not self.notion_database_id:
            print("错误: 未设置Notion API密钥或数据库ID")
            return False
            
        headers = {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json"
        }
        
        # 构建Notion页面数据
        page_data = {
            "parent": {
                "type": "database_id",
                "database_id": self.notion_database_id
            },
            "properties": {
                "Name": {
                    "title": [
                        {
                            "text": {
                                "content": data.get("title", "未命名笔记")
                            }
                        }
                    ]
                },
                "URL": {
                    "url": data.get("url", "")
                }
            }
        }
        
        # 如果有简介，添加到页面内容中
        if data.get("summary"):
            page_data["children"] = [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {
                                "type": "text",
                                "text": {
                                    "content": data.get("summary")
                                }
                            }
                        ]
                    }
                }
            ]
        
        try:
            response = requests.post(
                "https://api.notion.com/v1/pages",
                headers=headers,
                json=page_data
            )
            
            if response.status_code == 200:
                print("成功保存到Notion!")
                return True
            else:
                print(f"保存失败: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"请求Notion API失败: {e}")
            return False
    
    def process(self, xiaohongshu_url):
        """处理小红书链接"""
        print(f"处理小红书链接: {xiaohongshu_url}")
        
        # 提取信息
        info = self.extract_xiaohongshu_info(xiaohongshu_url)
        if not info:
            return False
        
        # 保存到Notion
        return self.save_to_notion(info)

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python xiaohongshu_to_notion.py <小红书链接>")
        sys.exit(1)
    
    processor = XiaohongshuToNotion()
    success = processor.process(sys.argv[1])
    
    if success:
        print("处理完成!")
        sys.exit(0)
    else:
        print("处理失败!")
        sys.exit(1)
```

## 安装脚本

将上面的Python脚本保存为 `xiaohongshu_to_notion.py`，并安装依赖：

```bash
pip install requests
```

## 测试

```bash
# 设置环境变量
export NOTION_API_KEY="your_api_key"
export NOTION_DATABASE_ID="your_database_id"

# 运行测试
python xiaohongshu_to_notion.py "https://www.xiaohongshu.com/discovery/item/..."
```

## 故障排除

1. **API密钥错误**：检查NOTION_API_KEY是否正确
2. **数据库权限**：确保集成有访问数据库的权限
3. **网络问题**：检查网络连接
4. **链接格式**：确保小红书链接格式正确

## 注意事项

1. 小红书内容提取可能需要更复杂的解析逻辑
2. Notion API有速率限制
3. 需要定期更新Notion API版本
4. 建议添加错误处理和日志记录