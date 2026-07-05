"""
小红书转Notion配置文件
支持多种配置方式：环境变量 > 配置文件 > 默认值
"""

import os
import json
from pathlib import Path

class Config:
    def __init__(self):
        self.notion_api_key = None
        self.notion_database_id = None
        self.notion_version = "2025-09-03"
        
        # 加载配置
        self.load_config()
        
    def load_config(self):
        """加载配置，优先级：环境变量 > 配置文件 > 默认值"""
        
        # 1. 尝试从环境变量加载
        self.notion_api_key = os.getenv("NOTION_API_KEY")
        self.notion_database_id = os.getenv("NOTION_DATABASE_ID")
        
        # 2. 如果环境变量不存在，尝试从配置文件加载
        if not self.notion_api_key or not self.notion_database_id:
            config_file = self.get_config_file_path()
            if config_file.exists():
                try:
                    with open(config_file, 'r', encoding='utf-8') as f:
                        config_data = json.load(f)
                        self.notion_api_key = config_data.get("NOTION_API_KEY", self.notion_api_key)
                        self.notion_database_id = config_data.get("NOTION_DATABASE_ID", self.notion_database_id)
                except Exception as e:
                    print(f"⚠️ 读取配置文件失败: {e}")
        
        # 3. 检查配置是否完整
        self.validate_config()
    
    def get_config_file_path(self):
        """获取配置文件路径"""
        # 优先使用技能目录下的配置文件
        skill_config = Path(__file__).parent / "config.json"
        if skill_config.exists():
            return skill_config
        
        # 其次使用用户配置目录
        user_config_dir = Path.home() / ".config" / "xiaohongshu-to-notion"
        user_config_dir.mkdir(parents=True, exist_ok=True)
        return user_config_dir / "config.json"
    
    def validate_config(self):
        """验证配置是否完整"""
        errors = []
        
        if not self.notion_api_key:
            errors.append("未设置Notion API密钥 (NOTION_API_KEY)")
        
        if not self.notion_database_id:
            errors.append("未设置Notion数据库ID (NOTION_DATABASE_ID)")
        
        if errors:
            error_msg = "❌ 配置错误:\n" + "\n".join(f"  - {error}" for error in errors)
            error_msg += "\n\n请通过以下方式设置："
            error_msg += "\n1. 设置环境变量："
            error_msg += "\n   export NOTION_API_KEY='your_api_key'"
            error_msg += "\n   export NOTION_DATABASE_ID='your_database_id'"
            error_msg += "\n2. 或创建配置文件："
            error_msg += "\n   ~/.config/xiaohongshu-to-notion/config.json"
            error_msg += "\n3. 或在技能目录创建 config.json 文件"
            
            raise ValueError(error_msg)
    
    def save_to_file(self):
        """保存配置到文件"""
        config_file = self.get_config_file_path()
        config_data = {
            "NOTION_API_KEY": self.notion_api_key,
            "NOTION_DATABASE_ID": self.notion_database_id,
            "NOTION_VERSION": self.notion_version
        }
        
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
            print(f"✅ 配置已保存到: {config_file}")
            return True
        except Exception as e:
            print(f"❌ 保存配置失败: {e}")
            return False
    
    def print_config(self):
        """打印当前配置（隐藏敏感信息）"""
        print("📋 当前配置:")
        print(f"  Notion API密钥: {'已设置' if self.notion_api_key else '未设置'}")
        if self.notion_api_key:
            # 显示部分密钥用于验证
            masked_key = self.notion_api_key[:10] + "..." + self.notion_api_key[-10:] if len(self.notion_api_key) > 20 else "***"
            print(f"   密钥预览: {masked_key}")
        print(f"  Notion数据库ID: {self.notion_database_id}")
        print(f"  Notion API版本: {self.notion_version}")

# 全局配置实例
config = Config()

if __name__ == "__main__":
    # 测试配置
    try:
        config.print_config()
        print("✅ 配置验证通过")
    except ValueError as e:
        print(e)