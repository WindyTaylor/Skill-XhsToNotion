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

# ==========================================
# 专辑路由功能已暂时移除，预留至下个版本开发
# ALBUM_MAP = {}
# ==========================================

class NotionSaver:
    def __init__(self):
        import os
        import sys
        import json
        from pathlib import Path
        
        self.notion_version = "2022-06-28"
        self.notion_api_key = None
        self.notion_database_id = None
        
        # 优先尝试从本地 config.json 读取（因为 Agent 可以通过 configure.py 动态修改）
        config_path = Path(__file__).parent / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    self.notion_api_key = config.get("NOTION_API_KEY")
                    self.notion_database_id = config.get("NOTION_DATABASE_ID")
            except Exception as e:
                print(f"[WARN] 读取 config.json 失败: {e}")
        
        # 如果 config.json 中没有配置，再尝试读取环境变量作为兜底
        if not self.notion_api_key:
            self.notion_api_key = os.environ.get("NOTION_API_KEY")
        if not self.notion_database_id:
            self.notion_database_id = os.environ.get("NOTION_DATABASE_ID")
        
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
            
        # 添加状态 (默认: 待阅读，select类型)
        page_data["properties"]["状态"] = {
            "select": {
                "name": "待阅读"
            }
        }
        
        # 添加野生标签 (文本属性)
        tags_str = ""
        if data.get("tags"):
            tags = data.get("tags", "")
            if isinstance(tags, list):
                tags_str = ", ".join([tag.strip() for tag in tags if tag.strip()])
            else:
                tags_str = tags
                
            if tags_str:
                page_data["properties"]["野生标签"] = {
                    "rich_text": [
                        {
                            "text": {
                                "content": tags_str
                            }
                        }
                    ]
                }
                
        # 暂时屏蔽调用智能路由分类功能，留至下一版本
        # album_name = data.get("album")
        # if not album_name:
        #     album_name = "待分类收件箱"
        # album_id = ALBUM_MAP.get(album_name, ALBUM_MAP.get("待分类收件箱", "id_fallback"))
        # if album_id and album_id != "id_fallback":
        #     page_data["properties"]["库B：专辑标签库"] = {
        #         "relation": [
        #             {"id": album_id}
        #         ]
        #     }
                
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
                    print(f"   野生标签: {data.get('tags', '')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    print("   状态: 待阅读".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    
                    return page_id
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
                    return None

    def append_tags(self, page_id, new_tags_str):
        """为已存在的Notion页面追加'野生标签'（文本属性）"""
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        headers = {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json"
        }
        
        # 1. 获取当前页面的属性
        try:
            resp = requests.get(f"https://api.notion.com/v1/pages/{page_id}", headers=headers, verify=False, timeout=15)
            if resp.status_code != 200:
                print(f"[FAIL] 获取页面信息失败: {resp.text}")
                return False
                
            page_data = resp.json()
            existing_tags_str = ""
            props = page_data.get("properties", {})
            if "野生标签" in props and "rich_text" in props["野生标签"]:
                rich_text_array = props["野生标签"]["rich_text"]
                if rich_text_array:
                    existing_tags_str = "".join([t.get("plain_text", "") for t in rich_text_array])
                    
            # 2. 合并标签并去重
            existing_tags = [t.strip() for t in existing_tags_str.split(",") if t.strip()]
            new_tags = [t.strip() for t in new_tags_str.split(",") if t.strip()]
            
            # 使用 dict.fromkeys 来保持顺序去重
            combined_tags = list(dict.fromkeys(existing_tags + new_tags))
            combined_tags_str = ", ".join(combined_tags)
            
            # 3. 更新页面属性
            update_payload = {
                "properties": {
                    "野生标签": {
                        "rich_text": [
                            {
                                "text": {
                                    "content": combined_tags_str
                                }
                            }
                        ]
                    }
                }
            }
            
            patch_resp = requests.patch(
                f"https://api.notion.com/v1/pages/{page_id}", 
                headers=headers, 
                json=update_payload, 
                verify=False, 
                timeout=15
            )
            
            if patch_resp.status_code == 200:
                print(f"[OK] 成功追加野生标签: {', '.join(new_tags)}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                print(f"当前所有野生标签: {combined_tags_str}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                return True
            else:
                print(f"[FAIL] 更新野生标签失败: {patch_resp.text}")
                return False
                
        except Exception as e:
            print(f"[FAIL] 追加野生标签请求异常: {e}")
            return False

def main():
    parser = argparse.ArgumentParser(description='保存小红书笔记到Notion')
    parser.add_argument('--url', help='小红书链接 (可选，也可从文件读取)')
    parser.add_argument('--title', help='笔记标题 (如果未提供，将自动从URL提取)')
    parser.add_argument('--summary', help='笔记简介 (如果未提供，将自动从URL提取)')
    parser.add_argument('--author', help='作者')
    parser.add_argument('--tags', help='标签（逗号分隔）')
    parser.add_argument('--cover', help='封面图片URL')
    parser.add_argument('--append-tags', help='追加标签（逗号分隔），将应用到最近一次保存的笔记上')
    parser.add_argument('--album', help='归属专辑名称，用于Notion中的Relation关联')
    
    args = parser.parse_args()
    
    # 如果是追加标签的指令
    if args.append_tags:
        last_id_file = Path(__file__).parent / "last_page_id.txt"
        if not last_id_file.exists():
            print("[FAIL] 找不到最近保存的笔记记录，无法追加标签。")
            sys.exit(1)
        
        with open(last_id_file, "r", encoding="utf-8") as f:
            page_id = f.read().strip()
            
        saver = NotionSaver()
        print(f"正在为笔记(ID: {page_id})追加标签...")
        success = saver.append_tags(page_id, args.append_tags)
        sys.exit(0 if success else 1)
        
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
        
    if args.album:
        data["album"] = args.album

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
            # 把已经存在的 ID 写进 last_page_id，这样哪怕是重复的，也能随时给它加标签！
            with open(Path(__file__).parent / "last_page_id.txt", "w", encoding="utf-8") as f:
                f.write(duplicate_id)
            sys.exit(0)
            
    page_id = saver.save_to_notion(data)
    
    if page_id:
        with open(Path(__file__).parent / "last_page_id.txt", "w", encoding="utf-8") as f:
            f.write(page_id)
        print("[OK] 处理完成!")
        sys.exit(0)
    else:
        print("[FAIL] 处理失败!")
        sys.exit(1)

if __name__ == "__main__":
    main()