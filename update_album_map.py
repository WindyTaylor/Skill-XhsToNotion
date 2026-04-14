import os
import sys
import json
import requests
from pathlib import Path

# 强制将标准输出和错误输出配置为 UTF-8，防止 Windows 终端下出现 UnicodeEncodeError
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

NOTION_VERSION = "2022-06-28"

def update_album_map():
    # 动态加载工程目录下的 config.json
    config_path = Path(__file__).parent / "config.json"
    
    if not config_path.exists():
        print("[FAIL] 找不到 config.json 文件，请确保核心功能已配置正确！")
        return
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        print(f"[FAIL] 读取 config.json 失败: {e}")
        return

    # 直接读取现有的 API_KEY 和 DATABASE_ID（内容总库）
    NOTION_TOKEN = config.get("NOTION_API_KEY")
    DATABASE_ID = config.get("NOTION_DATABASE_ID")

    if not NOTION_TOKEN or not DATABASE_ID:
        print("[FAIL] config.json 中缺少 NOTION_API_KEY 或 NOTION_DATABASE_ID！")
        return

    # 直接请求 Database 的 Schema（结构）
    url = f"https://api.notion.com/v1/databases/{DATABASE_ID}"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }

    print(f"[INFO] 正在获取 Notion 数据库 Schema (Database ID: {DATABASE_ID})...")

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"[FAIL] 请求 Notion API 失败: {e}")
        if 'response' in locals() and response is not None:
            print(response.text)
        return

    ALBUM_MAP = {}
    properties = data.get("properties", {})
    
    # 兼容属性名可能是 "库B：专辑标签库" 或 "归属专辑" 等，用户说是内容总库里的一个属性
    # 我们遍历找找可能是 select 或者是 relation 的属性
    
    target_prop = properties.get("库B：专辑标签库") or properties.get("归属专辑") or properties.get("专辑名")
    
    if not target_prop:
        print("[FAIL] 在数据库中找不到名为 '库B：专辑标签库'、'归属专辑' 或 '专辑名' 的属性！")
        print(f"当前数据库存在的属性有: {', '.join(properties.keys())}")
        return
        
    prop_type = target_prop.get("type")
    
    # 如果它是 Select（单选）或者 Multi-select（多选）属性
    if prop_type in ["select", "multi_select"]:
        options = target_prop.get(prop_type, {}).get("options", [])
        for opt in options:
            name = opt.get("name")
            opt_id = opt.get("id")
            if name and opt_id:
                ALBUM_MAP[name] = opt_id
        print(f"[INFO] 发现 {prop_type} 类型属性，提取了 {len(ALBUM_MAP)} 个选项作为映射。")
    
    # 如果它是 Relation（关联）属性，情况就比较复杂，说明它实际上是指向了另一个 Database
    elif prop_type == "relation":
        relation_db_id = target_prop.get("relation", {}).get("database_id")
        print(f"[INFO] 发现 '库B：专辑标签库' 是一个 Relation 关联属性！")
        print(f"[INFO] 它实际关联的子数据库 ID 为: {relation_db_id}")
        print("[INFO] 正在前往子数据库提取页面数据...")
        
        # 跳转去查那个子数据库
        rel_url = f"https://api.notion.com/v1/databases/{relation_db_id}/query"
        has_more = True
        next_cursor = None
        
        while has_more:
            payload = {}
            if next_cursor:
                payload["start_cursor"] = next_cursor
                
            try:
                rel_resp = requests.post(rel_url, headers=headers, json=payload)
                rel_resp.raise_for_status()
                rel_data = rel_resp.json()
                
                for page in rel_data.get("results", []):
                    page_id = page.get("id")
                    page_props = page.get("properties", {})
                    
                    # 遍历寻找子页面的标题属性
                    for prop_name, prop_data in page_props.items():
                        if prop_data.get("type") == "title":
                            title_arr = prop_data.get("title", [])
                            album_name = "".join([t.get("plain_text", "") for t in title_arr])
                            if album_name:
                                ALBUM_MAP[album_name] = page_id
                                break
                                
                has_more = rel_data.get("has_more", False)
                next_cursor = rel_data.get("next_cursor")
                
            except Exception as e:
                print(f"[FAIL] 请求关联子数据库失败: {e}")
                return
    else:
        print(f"[FAIL] 属性类型 '{prop_type}' 暂不支持自动提取映射字典。")
        return

    # 格式化输出为本地 JSON 文件
    output_file = Path(__file__).parent / "album_map.json"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(ALBUM_MAP, f, ensure_ascii=False, indent=4)
        
        print(f"[OK] 成功提取并更新了 {len(ALBUM_MAP)} 个专辑映射！")
        print(f"[OK] 映射字典已保存至: {output_file.absolute()}")
        
    except IOError as e:
        print(f"[FAIL] 保存文件失败: {e}")

if __name__ == "__main__":
    update_album_map()
