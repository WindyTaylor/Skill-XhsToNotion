import argparse
import json
import re
import sys
from pathlib import Path

def extract_db_id(url_or_id):
    """
    智能提取 Notion Database ID。
    支持直接输入 32 位 ID（带不带中划线均可），也支持输入完整的 Notion 数据库网页链接。
    """
    # 如果包含 ?v= 说明是链接，先去掉参数和主机名
    if 'notion.so' in url_or_id:
        url_or_id = url_or_id.split('?')[0]
        url_or_id = url_or_id.rstrip('/')
        # 通常链接最后一部分是 Database ID，可能带有名字前缀如 My-Database-1234...
        url_or_id = url_or_id.split('/')[-1]
    
    # 提取由 32 个十六进制字符组成的 ID（去除中划线）
    clean_id = url_or_id.replace('-', '')
    
    # 正则匹配最后 32 位字符
    match = re.search(r'([a-fA-F0-9]{32})$', clean_id)
    if match:
        return match.group(1)
        
    return clean_id # 兜底返回

def main():
    parser = argparse.ArgumentParser(description='小红书转Notion：配置 API Key 和 数据库链接')
    parser.add_argument('--api-key', help='Notion API Key (通常以 ntn_ 或 secret_ 开头)')
    parser.add_argument('--db-url', help='Notion 数据库的完整网页链接 或 数据库 ID')
    
    args = parser.parse_args()
    
    if not args.api_key and not args.db_url:
        print("[FAIL] 未提供任何配置信息。请使用 --api-key 或 --db-url 参数。")
        sys.exit(1)
    
    config_path = Path(__file__).parent / "config.json"
    
    # 读取现有配置（如果存在）
    config = {}
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8-sig") as f:
                config = json.load(f)
        except Exception as e:
            print(f"[WARN] 无法读取现有 config.json，将创建新文件。错误: {e}")
            
    updated = False
    
    if args.api_key:
        config["NOTION_API_KEY"] = args.api_key.strip()
        updated = True
        print("[OK] 已成功更新 Notion API Key")
        
    if args.db_url:
        db_id = extract_db_id(args.db_url.strip())
        config["NOTION_DATABASE_ID"] = db_id
        updated = True
        print(f"[OK] 已成功解析并更新 Notion 数据库 ID: {db_id}")
        
    # 写入配置
    if updated:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        print("[OK] 🎉 配置已成功保存至 config.json！")
        sys.exit(0)

if __name__ == "__main__":
    main()
