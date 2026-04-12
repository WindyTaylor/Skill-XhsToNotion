#!/usr/bin/env python3
"""
小红书转Notion命令行工具
支持从命令行参数接收数据并保存到Notion
"""

import os
import sys
import json
import requests
import argparse
from pathlib import Path

# 添加父目录到路径，以便导入现有模块
sys.path.append(str(Path(__file__).parent.parent))

class NotionSaver:
    def __init__(self):
        import os
        import sys
        import json
        from pathlib import Path
        
        # 优先从环境变量读取配置
        self.notion_api_key = os.environ.get("NOTION_API_KEY")
        self.notion_database_id = os.environ.get("NOTION_DATABASE_ID")
        self.notion_version = "2022-06-28"
        
        # 如果环境变量没有，尝试从本地 config.json 读取（为 OpenClaw Agent 提供便利）
        config_path = Path(__file__).parent / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    if not self.notion_api_key:
                        self.notion_api_key = config.get("NOTION_API_KEY")
                    if not self.notion_database_id:
                        self.notion_database_id = config.get("NOTION_DATABASE_ID")
            except Exception as e:
                print(f"[WARN] 读取 config.json 失败: {e}")
        
        if not self.notion_api_key:
            print("[FAIL] 错误: 未设置 NOTION_API_KEY")
            print("请通过环境变量或 config.json 进行设置")
            sys.exit(1)
            
        if not self.notion_database_id:
            print("[FAIL] 错误: 未设置 NOTION_DATABASE_ID")
            print("请通过环境变量或 config.json 进行设置")
            sys.exit(1)
    
    def check_duplicate(self, note_id):
        """检查Notion数据库中是否已存在该笔记"""
        if not note_id:
            return False
            
        headers = {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json"
        }
        
        payload = {
            "filter": {
                "property": "小红书链接",
                "url": {
                    "contains": note_id
                }
            }
        }
        
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        try:
            response = requests.post(
                f"https://api.notion.com/v1/databases/{self.notion_database_id}/query",
                headers=headers,
                json=payload,
                verify=False,
                timeout=15
            )
            if response.status_code == 200:
                results = response.json().get("results", [])
                if results:
                    return results[0].get("id")
            return False
        except Exception as e:
            print(f"[WARN] 检查重复记录失败: {e}")
            return False

    def save_to_notion(self, data):
        """保存数据到Notion数据库"""
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
                "标题": {
                    "title": [
                        {
                            "text": {
                                "content": data.get("title", "未命名笔记")
                            }
                        }
                    ]
                },
                "小红书链接": {
                    "url": data.get("url", "")
                }
            }
        }
        
        # 添加简介
        if data.get("summary"):
            page_data["properties"]["简介"] = {
                "rich_text": [
                    {
                        "text": {
                            "content": data.get("summary", "")
                        }
                    }
                ]
            }
        
        # 添加作者
        if data.get("author"):
            page_data["properties"]["作者"] = {
                "rich_text": [
                    {
                        "text": {
                            "content": data.get("author", "")
                        }
                    }
                ]
            }
        
        # 添加标签
        if data.get("tags"):
            tags = data.get("tags", "")
            if isinstance(tags, str):
                # 如果是字符串，按逗号分割
                tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
            else:
                # 如果是列表，直接使用
                tag_list = tags
            
            if tag_list:
                page_data["properties"]["标签"] = {
                    "multi_select": [
                        {"name": tag} for tag in tag_list
                    ]
                }
                
        # 添加封面图片
        if data.get("cover"):
            page_data["cover"] = {
                "type": "external",
                "external": {
                    "url": data.get("cover")
                }
            }
        
        import time
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        max_retries = 5
        for attempt in range(max_retries):
            try:
                # 显式使用支持 HTTP2 或更换请求 session
                session = requests.Session()
                response = session.post(
                    "https://api.notion.com/v1/pages",
                    headers=headers,
                    json=page_data,
                    verify=False,
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    page_id = result.get('id', '')
                    page_url = f"https://www.notion.so/{page_id.replace('-', '')}"
                    
                    print("[OK] 成功保存到Notion!")
                    print(f"页面ID: {page_id}")
                    print(f"页面链接: {page_url}")
                    print(f"创建时间: {result.get('created_time', '')}")
                    
                    # 显示保存的属性
                    print("保存的属性:")
                    print(f"   标题: {data.get('title', '')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    print(f"   链接: {data.get('url', '')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    print(f"   简介: {data.get('summary', '')[:50]}...".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    if data.get('author'):
                        print(f"   作者: {data.get('author', '')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    if data.get('tags'):
                        print(f"   标签: {data.get('tags', '')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    
                    return True
                else:
                    print(f"[FAIL] 保存失败: {response.status_code}")
                    print(f"错误信息: {response.text}")
                    return False
                    
            except Exception as e:
                print(f"[WARN] 请求Notion API失败(尝试 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(3)
                else:
                    print("[FAIL] 达到最大重试次数，保存失败")
                    return False

def main():
    parser = argparse.ArgumentParser(description='保存小红书笔记到Notion')
    parser.add_argument('--url', help='小红书链接 (可选，也可从文件读取)')
    parser.add_argument('--title', help='笔记标题 (如果未提供，将自动从URL提取)')
    parser.add_argument('--summary', help='笔记简介 (如果未提供，将自动从URL提取)')
    parser.add_argument('--author', help='作者')
    parser.add_argument('--tags', help='标签（逗号分隔）')
    parser.add_argument('--cover', help='封面图片URL')
    
    args = parser.parse_args()
    
    # 如果从文件中读取 URL
    target_file = Path(__file__).parent / "url_target.txt"
    if target_file.exists():
        with open(target_file, "r", encoding="utf-8") as f:
            file_url = f.read().strip()
            if file_url and not args.url:
                args.url = file_url
                
    if not args.url:
        print("[FAIL] 错误: 未提供小红书链接")
        sys.exit(1)
    
    print("小红书转Notion保存工具")
    print("=" * 50)
    
    # 准备数据
    data = {
        "url": args.url
    }
    
    # 如果没有提供必填项，则调用提取器自动提取
    if not args.title or not args.summary:
        print(f"正在从链接自动提取内容: {args.url} ...")
        try:
            from local_extractor import XiaohongshuExtractor
            extractor = XiaohongshuExtractor()
            extracted = extractor.extract_from_url(args.url)
            
            if extracted.get('success'):
                data["url"] = extracted.get('note_url', args.url)
                data["title"] = extracted.get('title', '未命名笔记')
                data["summary"] = extracted.get('content', '无简介')
                
                # 如果没有手动传入作者、标签、封面，则使用提取到的
                if not args.author and extracted.get('author'):
                    args.author = extracted.get('author')
                if not args.tags and extracted.get('tags'):
                    args.tags = ",".join(extracted.get('tags'))
                if not args.cover and extracted.get('cover_url'):
                    args.cover = extracted.get('cover_url')
                print("[OK] 提取成功！")
            else:
                print("[FAIL] 提取失败，将使用默认占位文本。")
                data["title"] = "小红书笔记提取失败"
                data["summary"] = "无法提取内容"
        except ImportError as e:
            print(f"[FAIL] 找不到 xhs_content_extractor 模块，提取失败！({e})")
            data["title"] = "小红书笔记"
            data["summary"] = "无内容"
    else:
        data["title"] = args.title
        data["summary"] = args.summary
        
    if args.author:
        data["author"] = args.author
    
    if args.tags:
        data["tags"] = args.tags
        
    if args.cover:
        data["cover"] = args.cover

    print(f"标题: {data.get('title')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"链接: {data.get('url')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"简介: {data.get('summary')[:50]}...".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("author"):
        print(f"作者: {data.get('author')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("tags"):
        print(f"标签: {data.get('tags')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("cover"):
        print(f"封面: {data.get('cover')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print("=" * 50)
    
    # 保存到Notion
    saver = NotionSaver()
    
    import re
    note_id = None
    # 小红书笔记ID通常是24位字母数字组合
    match = re.search(r'/(?:item|explore)/([a-zA-Z0-9]{24})', data.get("url", ""))
    if match:
        note_id = match.group(1)
        
    if note_id:
        print(f"正在检查 Notion 中是否已存在该笔记 (ID: {note_id})...")
        duplicate_id = saver.check_duplicate(note_id)
        if duplicate_id:
            print(f"[SKIP] 该笔记已存在于Notion中，跳过保存 (页面ID: {duplicate_id})")
            sys.exit(0)
            
    success = saver.save_to_notion(data)
    
    if success:
        print("[OK] 处理完成!")
        sys.exit(0)
    else:
        print("[FAIL] 处理失败!")
        sys.exit(1)

if __name__ == "__main__":
    main()