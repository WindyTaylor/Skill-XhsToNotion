#!/usr/bin/env python3
"""
小红书内容提取器 - 修复版
修复了原版正则匹配问题，能正确提取标题、作者、标签、内容和封面
"""

import re
import json
import requests
from urllib.parse import urlparse, parse_qs

class XiaohongshuExtractor:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
        
    def get_page_content(self, url):
        """获取页面内容，支持短链接重定向"""
        try:
            # 直接使用 GET 请求获取，让 requests 自动处理重定向
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            
            # 获取最终的真实 URL（如果发生了重定向）
            self.final_url = response.url
            if response.url != url:
                print(f"短链接重定向到: {response.url}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            
            # 检查编码
            if response.encoding.lower() != 'utf-8':
                response.encoding = 'utf-8'
            
            return response.text
            
        except requests.exceptions.RequestException as e:
            print(f"请求页面失败: {e}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            self.final_url = url
            return None
            
    def extract_from_html(self, html_content):
        """
        从HTML内容中提取小红书笔记信息
        """
        result = {
            'title': '',
            'author': '',
            'tags': [],
            'content': '',
            'note_url': '',
            'cover_url': '',
            'success': False
        }
        
        try:
            # 1. 提取 window.__INITIAL_STATE__ 数据，使用更严谨的正则避免跨行匹配过多内容
            initial_state_pattern = r'window\.__INITIAL_STATE__\s*=\s*({.*?})</script>'
            match = re.search(initial_state_pattern, html_content, re.DOTALL)
            
            if match:
                try:
                    json_str = match.group(1).strip()
                    if json_str.endswith(';'):
                        json_str = json_str[:-1]
                    
                    # 修复 Xiaohongshu HTML 中非标准的 ":undefined" ，否则 json.loads 会报错
                    json_str = json_str.replace(':undefined', ':null')
                    
                    initial_state = json.loads(json_str)
                    
                    # 提取笔记信息
                    note_data = self._extract_from_initial_state(initial_state)
                    if note_data:
                        result.update(note_data)
                        result['success'] = True
                except json.JSONDecodeError as e:
                    print(f"JSON解析错误: {e}")
            
            # 2. 提取标题（从meta标签或网页title提取备用）
            if not result['title']:
                title_match = re.search(r'<title>(.*?)</title>', html_content)
                if title_match:
                    result['title'] = title_match.group(1).replace(' - 小红书', '').strip()
            
            # 3. 提取内容描述备用
            if not result['content']:
                desc_match = re.search(r'<meta[^>]*name="description"[^>]*content="([^"]*)"', html_content)
                if desc_match:
                    result['content'] = desc_match.group(1)
            
            return result
            
        except Exception as e:
            print(f"提取过程中出错: {e}")
            return result
    
    def _extract_from_initial_state(self, initial_state):
        """从INITIAL_STATE中提取笔记信息"""
        result = {}
        try:
            note_data = None
            
            # 新版 XHS 数据结构通常包含 noteDetailMap
            if 'note' in initial_state and 'noteDetailMap' in initial_state['note']:
                note_map = initial_state['note']['noteDetailMap']
                if note_map and len(note_map) > 0:
                    first_key = list(note_map.keys())[0]
                    note_data = note_map[first_key].get('note')
            
            # 如果没找到，尝试原来的搜索逻辑
            if not note_data:
                for key, value in initial_state.items():
                    if isinstance(value, dict) and 'note' in value:
                        note_data = value['note']
                        break
            
            if note_data:
                # 提取标题
                if 'title' in note_data and note_data['title']:
                    result['title'] = note_data['title']
                elif 'desc' in note_data:
                    result['title'] = note_data['desc'][:100] + '...' if len(note_data['desc']) > 100 else note_data['desc']
                
                # 提取作者
                if 'user' in note_data:
                    user = note_data['user']
                    if 'nickname' in user:
                        result['author'] = user['nickname']
                
                # 提取标签
                if 'tagList' in note_data:
                    tags = []
                    for tag in note_data['tagList']:
                        if isinstance(tag, dict) and 'name' in tag:
                            tag_name = tag['name']
                            if tag_name:
                                tags.append(tag_name)
                    result['tags'] = tags
                
                # 提取内容
                if 'desc' in note_data:
                    result['content'] = note_data['desc']
                
                # 提取封面图（兼容视频和实况图）
                # 小红书无论是视频还是图文，都会在 imageList 中提供静态的封面首图
                if 'imageList' in note_data and note_data['imageList']:
                    img = note_data['imageList'][0]
                    # 优先使用 urlDefault 或 url
                    result['cover_url'] = img.get('urlDefault') or img.get('url') or img.get('urlPre')
                # 兜底：如果是纯视频且未提取到图片列表，尝试从视频信息里提取封面
                elif 'video' in note_data and note_data['video'] and 'image' in note_data['video']:
                    video_cover = note_data['video']['image']
                    result['cover_url'] = video_cover.get('thumbnail') or video_cover.get('url') or video_cover.get('urlDefault')
                
                print(f"从INITIAL_STATE提取成功: 标题={result.get('title', '')}, 作者={result.get('author', '')}, 标签数={len(result.get('tags', []))}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
        
        except Exception as e:
            print(f"从INITIAL_STATE提取失败: {e}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
        
        return result
    
    def extract_from_url(self, url):
        """从URL提取小红书笔记信息"""
        print(f"开始提取URL: {url}")
        
        # 获取页面内容
        html_content = self.get_page_content(url)
        if not html_content:
            return {'success': False, 'error': '无法获取页面内容', 'note_url': url}
        
        # 提取信息
        result = self.extract_from_html(html_content)
        result['note_url'] = getattr(self, 'final_url', url)
        
        # 验证提取结果
        if result['success']:
            print(f"[成功] 提取成功!")
            # 兼容特殊颜文字/Emoji 字符
            print(f"   标题: {result.get('title', '无')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            print(f"   作者: {result.get('author', '无')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            print(f"   标签: {', '.join(result.get('tags', []))}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            print(f"   内容预览: {result.get('content', '无')[:100]}...".encode('gbk', 'ignore').decode('gbk', 'ignore'))
        else:
            print(f"[失败] 提取失败")
        
        return result
