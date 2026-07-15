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
import re
from pathlib import Path

from cover_assets import (
    CoverAssetError,
    CoverAssetService,
    CoverAssetStore,
    NotionFileUploader,
    as_bool,
    notion_file_upload_version_from_config,
)

# 强制将标准输出和错误输出配置为 UTF-8，防止 Windows 终端下出现包含 Emoji 时的 UnicodeEncodeError
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 添加父目录到路径，以便导入现有模块
sys.path.append(str(Path(__file__).parent.parent))

# ==========================================
# 专辑路由映射字典 (动态从 album_map.json 加载)
# ==========================================
ALBUM_MAP = {}
try:
    album_map_path = Path(__file__).parent / "album_map.json"
    if album_map_path.exists():
        with open(album_map_path, "r", encoding="utf-8") as f:
            ALBUM_MAP = json.load(f)
    else:
        # 提供默认的 fallback 结构
        ALBUM_MAP = {
            "待分类收件箱": "id_fallback"
        }
except Exception as e:
    print(f"[WARN] 加载 album_map.json 失败: {e}")
    ALBUM_MAP = {
        "待分类收件箱": "id_fallback"
    }
# ==========================================

DEFAULT_ALBUM_NAMES = ("待分类收件箱", "未分类收件箱")
CANDIDATE_FILE = Path(__file__).parent / "last_album_candidates.json"
ALBUM_DESCRIPTIONS_FILE = Path(__file__).parent / "album_descriptions.json"
MAX_ALBUM_CANDIDATES = 5
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
COLOR_TAGS_PROP = "彩色标签"


def normalize_tag_list(tags):
    """Return clean tag names for Notion rich text and multi-select fields."""
    if not tags:
        return []
    if isinstance(tags, list):
        raw_tags = tags
    else:
        raw_tags = re.split(r"[,，、;；\n]+", str(tags))

    clean_tags = []
    seen = set()
    for tag in raw_tags:
        clean_tag = re.sub(r"\s+", " ", str(tag or "")).strip(" ,，、;；")
        if not clean_tag:
            continue
        key = clean_tag.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean_tags.append(clean_tag[:80])
    return clean_tags[:20]

ALBUM_GENERIC_WORDS = (
    "学习",
    "积累",
    "地点收集",
    "旅游计划",
    "想看的",
    "拍照参考",
    "相关",
    "知识",
    "技巧",
    "灵感",
    "内容",
)

ALBUM_KEYWORD_HINTS = {
    "📷积累摄影装备": ["相机", "镜头", "闪光灯", "三脚架", "摄影装备", "器材", "机身", "富士", "佳能", "尼康", "索尼"],
    "学习拍立得技巧": ["拍立得", "instax", "宝丽来", "一次成像"],
    "学习穿搭": ["穿搭", "ootd", "搭配", "衣服", "裙子", "制服", "jk", "lo裙", "汉服"],
    "💻学习AI编程": ["ai编程", "代码", "编程", "python", "cursor", "claude", "openai", "agent", "自动化"],
    "💻学习AI杂事": ["ai", "提示词", "prompt", "模型", "gpt", "claude", "workflow"],
    "WindowsXP": ["windowsxp", "windows xp", "xp", "复古电脑"],
    "积累3D打印灵感": ["3d打印", "建模", "模型", "耗材", "打印件"],
    "💻学习3d打印": ["3d打印", "切片", "拓竹", "bambu", "pla", "petg"],
    "积累装修灵感": ["装修", "家装", "收纳", "卧室", "客厅", "软装", "家具"],
    "💻学习notion": ["notion", "数据库", "模板", "知识库"],
    "想看的风光": ["风光", "景色", "风景", "日落", "山", "海", "云"],
    "学习颜值加分": ["颜值", "变美", "护肤", "发型", "妆容", "形象"],
    "学习后期技术": ["后期", "修图", "ps", "photoshop", "lightroom", "lr", "调色"],
    "学习布光": ["布光", "灯光", "闪光灯", "柔光箱", "补光", "打光"],
    "学习调色": ["调色", "滤镜", "色彩", "lut", "lr"],
    "💻想做的嵌入式项目": ["嵌入式项目", "stm32", "单片机", "esp32", "pcb", "硬件项目"],
    "恋爱emo时想看的内容": ["恋爱", "emo", "分手", "关系", "亲密关系"],
    "学习自媒体知识": ["自媒体", "账号", "流量", "涨粉", "运营", "标题", "文案"],
    "学习漫展灯阵": ["漫展", "灯阵", "cos", "cosplay", "场照"],
    "学习车相关知识": ["汽车", "开车", "车", "驾驶", "新能源", "油车"],
    "拍照参考制服群像": ["制服", "群像", "多人", "jk", "拍照参考"],
    "📷学习相机使用教程": ["相机教程", "相机设置", "曝光", "快门", "光圈", "iso", "对焦"],
    "学习户外装备": ["户外", "露营", "徒步", "装备", "登山"],
    "💻积累装机灵感": ["装机", "电脑", "显卡", "cpu", "主板", "机箱"],
    "💻学习嵌入式知识": ["嵌入式", "stm32", "单片机", "esp32", "rtos", "电路"],
    "积累Bgm": ["bgm", "音乐", "歌", "配乐", "音频"],
    "学习做饭": ["做饭", "菜谱", "烹饪", "食谱", "下厨", "吃", "美食", "薯条", "麦当劳"],
    "学习健身": ["健身", "训练", "肌肉", "减脂", "增肌", "力量"],
    "memes": ["meme", "梗图", "表情包", "抽象"],
    "学习拍照动作": ["拍照动作", "姿势", "pose", "摆姿", "拍照姿势", "动作"],
    "拍照参考制服双子": ["制服双子", "双人", "双子", "jk", "制服"],
    "学习恋爱tips": ["恋爱", "暧昧", "聊天", "约会", "脱单"],
    "学习绳艺": ["绳艺", "绳结", "捆绑"],
    "🏠学习职场相关": ["职场", "工作", "简历", "面试", "同事", "领导"],
    "学习空气炸锅": ["空气炸锅", "炸锅"],
    "体态修复学习": ["体态", "圆肩", "驼背", "骨盆", "肩颈"],
    "学习剑花": ["剑花"],
    "学习AI摄影": ["ai摄影", "ai写真", "comfyui", "stable diffusion", "sd", "flux"],
    "🏠学习财经": ["财经", "股票", "基金", "投资", "理财", "经济"],
    "拍照参考轻轨&JK": ["轻轨", "jk", "制服", "拍照参考"],
    "积累视频灵感": ["视频", "剪辑", "分镜", "短视频", "vlog"],
    "学习体态知识": ["体态", "姿态", "站姿", "坐姿"],
    "学习说话": ["说话", "表达", "沟通", "聊天", "话术"],
    "积累拍照灵感": ["拍照", "写真", "摄影", "出片", "拍摄", "取景", "构图", "打卡"],
}

def resolve_album(album_name=None, use_default=True):
    """解析专辑名称到 Notion relation page id，兼容默认收件箱的历史命名。"""
    candidates = []
    if album_name:
        candidates.append(album_name)
        if album_name in DEFAULT_ALBUM_NAMES:
            candidates.extend([name for name in DEFAULT_ALBUM_NAMES if name != album_name])

    if use_default:
        candidates.extend([name for name in DEFAULT_ALBUM_NAMES if name not in candidates])

    for candidate in candidates:
        album_id = ALBUM_MAP.get(candidate)
        if album_id and album_id != "id_fallback":
            return candidate, album_id

    return album_name or DEFAULT_ALBUM_NAMES[0], "id_fallback"

def normalize_for_match(value):
    return re.sub(r"\s+", " ", str(value or "").lower())

def split_tag_text(tags):
    if not tags:
        return []
    if isinstance(tags, list):
        raw_tags = tags
    else:
        raw_tags = re.split(r"[,，#\s]+", str(tags))
    return [tag.strip().lower() for tag in raw_tags if tag and tag.strip()]

def album_terms(album_name):
    cleaned = re.sub(r"[^\w\u4e00-\u9fff]+", " ", album_name.lower())
    parts = [part.strip() for part in cleaned.split() if part.strip()]
    terms = set(parts)
    for part in list(parts):
        simplified = part
        for word in ALBUM_GENERIC_WORDS:
            simplified = simplified.replace(word, "")
        if len(simplified) >= 2:
            terms.add(simplified)
        if len(part) >= 4:
            for i in range(len(part) - 1):
                terms.add(part[i:i + 2])
    for hint in ALBUM_KEYWORD_HINTS.get(album_name, []):
        terms.add(hint.lower())
    return {term for term in terms if len(term) >= 2}

def score_album(album_name, data):
    title = normalize_for_match(data.get("title", ""))
    summary = normalize_for_match(data.get("summary", ""))
    tags = split_tag_text(data.get("tags", ""))
    combined = f"{title} {summary} {' '.join(tags)}"

    score = 0
    matched_terms = []
    for term in album_terms(album_name):
        term_score = 0
        phrase_bonus = 4 if len(term) >= 4 else 0
        if term in title:
            term_score += 6 + phrase_bonus
        if any(term in tag or tag in term for tag in tags):
            term_score += 8 + phrase_bonus
        if term in summary:
            term_score += 3 + phrase_bonus
        if term in combined:
            term_score += 1
        if term_score:
            score += term_score
            matched_terms.append(term)

    clean_album = re.sub(r"[^\w\u4e00-\u9fff]+", "", album_name.lower())
    if clean_album and clean_album in combined:
        score += 20
        matched_terms.append(clean_album)

    return score, sorted(set(matched_terms), key=lambda item: (-len(item), item))

def available_album_items(include_default=False):
    items = []
    for album_name, album_id in ALBUM_MAP.items():
        if not include_default and album_name in DEFAULT_ALBUM_NAMES:
            continue
        if album_id and album_id != "id_fallback":
            items.append((album_name, album_id))
    return items

def load_album_descriptions():
    if not ALBUM_DESCRIPTIONS_FILE.exists():
        return {}
    try:
        with open(ALBUM_DESCRIPTIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {str(k): str(v).strip() for k, v in data.items() if str(v).strip()}
    except Exception as e:
        print(f"[WARN] 读取专辑描述失败: {e}")
        return {}

def save_album_descriptions(descriptions):
    with open(ALBUM_DESCRIPTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(descriptions, f, ensure_ascii=False, indent=2)

def find_album_name(album_name):
    target = (album_name or "").strip()
    if not target:
        return None, "专辑名为空"
    if target in ALBUM_MAP:
        return target, None

    lowered = target.lower()
    exact_ci = [name for name in ALBUM_MAP if name.lower() == lowered]
    if len(exact_ci) == 1:
        return exact_ci[0], None

    contains = [name for name in ALBUM_MAP if lowered in name.lower()]
    if len(contains) == 1:
        return contains[0], None
    if len(contains) > 1:
        return None, f"专辑名不唯一，匹配到: {', '.join(contains[:8])}"
    return None, f"找不到专辑: {target}"

def update_album_description(album_name, description):
    resolved_name, error = find_album_name(album_name)
    if error:
        return False, error, None

    text = (description or "").strip()
    if not text:
        return False, "专辑描述为空", None

    descriptions = load_album_descriptions()
    descriptions[resolved_name] = text
    save_album_descriptions(descriptions)
    return True, None, resolved_name

def print_album_description_reply(album_name, description):
    print("OPENCLAW_REPLY_START")
    print("已更新专辑描述 ✅")
    print(f"专辑：{album_name}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"描述：{description}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print("OPENCLAW_REPLY_END")

def recommend_albums_by_keywords(data, limit=MAX_ALBUM_CANDIDATES):
    scored = []
    available = []
    for album_name, album_id in available_album_items(include_default=False):
        available.append((album_name, album_id))
        score, matched_terms = score_album(album_name, data)
        if score > 0:
            scored.append({
                "name": album_name,
                "id": album_id,
                "score": score,
                "matched_terms": matched_terms[:5],
                "source": "keyword",
            })

    scored.sort(key=lambda item: (-item["score"], item["name"]))
    selected = scored[:limit]
    selected_names = {item["name"] for item in selected}

    if len(selected) < limit:
        for album_name, album_id in available:
            if album_name in selected_names:
                continue
            selected.append({
                "name": album_name,
                "id": album_id,
                "score": 0,
                "matched_terms": [],
                "source": "keyword",
            })
            selected_names.add(album_name)
            if len(selected) >= limit:
                break

    if selected:
        return selected

    album_name, album_id = resolve_album(None, use_default=True)
    if album_id and album_id != "id_fallback":
        return [{
            "name": album_name,
            "id": album_id,
            "score": 0,
            "matched_terms": [],
            "source": "keyword",
        }]
    return []

def read_optional_config():
    config_path = Path(__file__).parent / "config.json"
    if not config_path.exists():
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def read_openclaw_deepseek_config():
    """Best-effort local read. Never print returned secrets."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    if not config_path.exists():
        return {}

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception:
        return {}

    result = {}
    provider = config.get("models", {}).get("providers", {}).get("deepseek", {})
    if provider.get("baseUrl"):
        result["base_url"] = provider.get("baseUrl")

    profile = config.get("auth", {}).get("profiles", {}).get("deepseek:default", {})
    for key in ("apiKey", "api_key", "key", "token"):
        if profile.get(key):
            result["api_key"] = profile.get(key)
            break

    plugin_config = config.get("plugins", {}).get("entries", {}).get("deepseek", {}).get("config", {})
    for key in ("apiKey", "api_key", "key", "token"):
        if not result.get("api_key") and plugin_config.get(key):
            result["api_key"] = plugin_config.get(key)
            break

    skill_env = config.get("skills", {}).get("entries", {}).get("xhs-to-notion", {}).get("env", {})
    if not result.get("api_key") and skill_env.get("DEEPSEEK_API_KEY"):
        result["api_key"] = skill_env.get("DEEPSEEK_API_KEY")
    if skill_env.get("DEEPSEEK_BASE_URL"):
        result["base_url"] = skill_env.get("DEEPSEEK_BASE_URL")
    if skill_env.get("DEEPSEEK_MODEL"):
        result["model"] = skill_env.get("DEEPSEEK_MODEL")

    return result

def get_deepseek_config():
    local_config = read_optional_config()
    openclaw_config = read_openclaw_deepseek_config()
    return {
        "api_key": (
            os.environ.get("DEEPSEEK_API_KEY")
            or local_config.get("DEEPSEEK_API_KEY")
            or openclaw_config.get("api_key")
        ),
        "base_url": (
            os.environ.get("DEEPSEEK_BASE_URL")
            or local_config.get("DEEPSEEK_BASE_URL")
            or openclaw_config.get("base_url")
            or DEFAULT_DEEPSEEK_BASE_URL
        ),
        "model": (
            os.environ.get("DEEPSEEK_MODEL")
            or local_config.get("DEEPSEEK_MODEL")
            or openclaw_config.get("model")
            or DEFAULT_DEEPSEEK_MODEL
        ),
    }

def extract_json_object(text):
    text = (text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        return None

def build_album_router_prompt(data, album_names, album_descriptions=None):
    album_descriptions = album_descriptions or {}
    tags = data.get("tags", "")
    if isinstance(tags, list):
        tags = ", ".join(tags)
    summary = (data.get("summary") or "")[:3000]
    album_lines = []
    for idx, name in enumerate(album_names, 1):
        description = album_descriptions.get(name, "")
        if description:
            album_lines.append(f"{idx}. {name}：{description}")
        else:
            album_lines.append(f"{idx}. {name}")
    album_lines = "\n".join(album_lines)
    return f"""你是一个 Notion 内容收藏分类助手。请根据小红书笔记内容，从给定专辑名中选择最相关的 5 个专辑，并按相关性从高到低排序。

要求：
- 只能使用候选专辑列表中的原始专辑名，不要创造新专辑。
- 必须返回 5 个候选；如果非常不确定，可以把“未分类收件箱”排入候选，但不要轻易排第一。
- 第 1 个候选会被自动保存为该笔记的专辑，所以要谨慎选择。
- 判断时优先参考用户给专辑写的描述，再看标签、标题和正文语义，也要考虑用户收藏意图，而不只是字面词。
- 只输出 JSON，不要输出 Markdown 或解释性段落。

小红书笔记：
标题：{data.get("title") or ""}
作者：{data.get("author") or ""}
标签：{tags}
简介/正文：{summary}

候选专辑：
{album_lines}

JSON 格式：
{{"candidates":[{{"name":"候选专辑名","reason":"不超过20字的选择理由"}}]}}
"""

def recommend_albums_with_llm(data, limit=MAX_ALBUM_CANDIDATES):
    config = get_deepseek_config()
    api_key = config.get("api_key")
    if not api_key:
        return None, "未找到 DEEPSEEK_API_KEY"

    album_items = available_album_items(include_default=True)
    if not album_items:
        return None, "没有可用专辑映射"

    album_names = [name for name, _ in album_items]
    album_id_map = {name: album_id for name, album_id in album_items}
    album_descriptions = load_album_descriptions()
    prompt = build_album_router_prompt(data, album_names, album_descriptions)
    base_url = config.get("base_url", DEFAULT_DEEPSEEK_BASE_URL).rstrip("/")
    model = config.get("model", DEFAULT_DEEPSEEK_MODEL)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你只输出严格 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 900,
    }

    try:
        response = requests.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=25,
        )
        if response.status_code != 200:
            return None, f"DeepSeek API 返回 {response.status_code}"
        body = response.json()
        content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
        parsed = extract_json_object(content)
        if not parsed:
            return None, "DeepSeek 返回内容不是可解析 JSON"

        selected = []
        seen = set()
        for item in parsed.get("candidates", []):
            name = (item.get("name") or "").strip()
            if name not in album_id_map or name in seen:
                continue
            selected.append({
                "name": name,
                "id": album_id_map[name],
                "score": 100 - len(selected),
                "matched_terms": [],
                "reason": (item.get("reason") or "").strip()[:40],
                "source": "llm",
            })
            seen.add(name)
            if len(selected) >= limit:
                break

        if len(selected) < limit:
            fallback = recommend_albums_by_keywords(data, limit=limit)
            for item in fallback:
                if item["name"] not in seen:
                    item = dict(item)
                    item["source"] = "keyword-fill"
                    selected.append(item)
                    seen.add(item["name"])
                    if len(selected) >= limit:
                        break

        if selected:
            return selected[:limit], None
        return None, "DeepSeek 没有返回有效候选"
    except Exception as e:
        return None, str(e)

def recommend_albums(data, limit=MAX_ALBUM_CANDIDATES):
    candidates, error = recommend_albums_with_llm(data, limit=limit)
    if candidates:
        print("[OK] 已使用 DeepSeek LLM 推理专辑候选")
        return candidates
    print(f"[WARN] DeepSeek 专辑推理不可用，使用关键词兜底: {error}")
    return recommend_albums_by_keywords(data, limit=limit)

def write_album_candidates(page_id, candidates, selected_album):
    payload = {
        "page_id": page_id,
        "selected_album": selected_album,
        "candidates": candidates[:MAX_ALBUM_CANDIDATES],
    }
    with open(CANDIDATE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def read_album_candidates():
    if not CANDIDATE_FILE.exists():
        return None
    with open(CANDIDATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def print_album_candidates(candidates, selected_album):
    if not candidates:
        print("专辑候选: 未找到可用候选")
        return
    print("专辑候选 TOP5:")
    for idx, candidate in enumerate(candidates, 1):
        marker = " <- 已自动保存" if candidate["name"] == selected_album else ""
        reason = ""
        if candidate.get("reason"):
            reason = f"（理由: {candidate['reason']}）"
        elif candidate.get("matched_terms"):
            reason = f"（命中: {', '.join(candidate['matched_terms'][:3])}）"
        print(f"   {idx}. {candidate['name']}{reason}{marker}".encode('gbk', 'ignore').decode('gbk', 'ignore'))

def format_tags_for_reply(tags):
    if not tags:
        return "无"
    if isinstance(tags, list):
        items = [tag.strip() for tag in tags if tag and tag.strip()]
    else:
        items = [tag.strip() for tag in re.split(r"[,，]+", str(tags)) if tag.strip()]
    return " / ".join(items) if items else "无"

def print_openclaw_reply(data, existing=False):
    title = data.get("title") or "未命名笔记"
    author = data.get("author") or "未知"
    tags = format_tags_for_reply(data.get("tags"))
    album = data.get("album") or "未设置"
    candidates = data.get("album_candidates") or []

    print("OPENCLAW_REPLY_START")
    print("已保存到 Notion ✅" if not existing else "已存在于 Notion，已更新最近记录 ✅")
    print(f"标题：{title}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"作者：{author}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"标签：{tags}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if candidates and candidates[0]["name"] == album:
        print(f"专辑：{album}（已自动保存到候选 1）".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    else:
        print(f"专辑：{album}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print("状态：待阅读")
    if candidates:
        print("候选专辑：")
        for idx, candidate in enumerate(candidates[:MAX_ALBUM_CANDIDATES], 1):
            marker = "（当前）" if candidate["name"] == album else ""
            print(f"{idx}. {candidate['name']}{marker}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
        print("回复 1-5 可更改专辑。")
    print("OPENCLAW_REPLY_END")

class NotionSaver:
    def __init__(self):
        import os
        import sys
        import json
        from pathlib import Path
        
        self.notion_version = "2022-06-28"
        self.notion_file_upload_version = "2026-03-11"
        self.notion_timeout = 30
        self.verify_ssl = False
        self.cover_cache_enabled = True
        self.cover_upload_to_notion = True
        self.notion_api_key = None
        self.notion_database_id = None
        config = {}
        
        # 优先尝试从本地 config.json 读取（因为 Agent 可以通过 configure.py 动态修改）
        config_path = Path(__file__).parent / "config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    self.notion_api_key = config.get("NOTION_API_KEY")
                    self.notion_database_id = config.get("NOTION_DATABASE_ID")
                    self.notion_version = config.get("NOTION_VERSION") or self.notion_version
                    self.notion_file_upload_version = notion_file_upload_version_from_config(config)
                    self.notion_timeout = int(config.get("NOTION_TIMEOUT") or self.notion_timeout)
                    self.verify_ssl = as_bool(config.get("NOTION_VERIFY_SSL"), default=self.verify_ssl)
                    self.cover_cache_enabled = as_bool(
                        config.get("COVER_CACHE_ENABLED"),
                        default=self.cover_cache_enabled,
                    )
                    self.cover_upload_to_notion = as_bool(
                        config.get("COVER_UPLOAD_TO_NOTION"),
                        default=self.cover_upload_to_notion,
                    )
            except Exception as e:
                print(f"[WARN] 读取 config.json 失败: {e}")
        
        # 如果 config.json 中没有配置，再尝试读取环境变量作为兜底
        if not self.notion_api_key:
            self.notion_api_key = os.environ.get("NOTION_API_KEY")
        if not self.notion_database_id:
            self.notion_database_id = os.environ.get("NOTION_DATABASE_ID")
        self.notion_version = os.environ.get("NOTION_VERSION") or self.notion_version
        self.notion_file_upload_version = (
            os.environ.get("NOTION_FILE_UPLOAD_VERSION") or self.notion_file_upload_version
        )
        self.cover_cache_enabled = as_bool(
            os.environ.get("COVER_CACHE_ENABLED"),
            default=self.cover_cache_enabled,
        )
        self.cover_upload_to_notion = as_bool(
            os.environ.get("COVER_UPLOAD_TO_NOTION"),
            default=self.cover_upload_to_notion,
        )
        
        if not self.notion_api_key:
            print("[FAIL] 错误: 未设置 NOTION_API_KEY")
            print("请通过环境变量或 config.json 进行设置")
            sys.exit(1)
            
        if not self.notion_database_id:
            print("[FAIL] 错误: 未设置 NOTION_DATABASE_ID")
            print("请通过环境变量或 config.json 进行设置")
            sys.exit(1)

        self.cover_store = CoverAssetStore()
        self.cover_service = CoverAssetService(
            store=self.cover_store,
            uploader=NotionFileUploader(
                self.notion_api_key,
                notion_version=self.notion_file_upload_version,
                timeout=self.notion_timeout,
                verify_ssl=self.verify_ssl,
            ),
        )

    def external_cover_payload(self, cover_url):
        return {
            "type": "external",
            "external": {
                "url": cover_url
            }
        }

    def persist_cover_for_page(self, page_id, cover_url):
        cover_url = str(cover_url or "").strip()
        if not page_id or not cover_url or not self.cover_cache_enabled:
            return None

        try:
            if self.cover_upload_to_notion:
                result = self.cover_service.cache_upload_and_attach(cover_url, page_id)
                print(f"[OK] Cover cached and uploaded: {result.get('filename', '')}")
            else:
                result = self.cover_service.cache_cover(cover_url, page_id=page_id)
                print(f"[OK] Cover cached locally: {result.get('local_url', '')}")
            return result
        except CoverAssetError as exc:
            print(f"[WARN] Cover cache/upload failed: {exc}")
            if self.cover_upload_to_notion:
                try:
                    self.cover_service.uploader.set_page_cover_external(page_id, cover_url)
                    print("[WARN] Fallback to external cover URL succeeded.")
                except CoverAssetError as fallback_exc:
                    print(f"[WARN] Fallback external cover failed: {fallback_exc}")
            return None

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
        
        # 添加野生标签 (文本属性) 和彩色标签 (multi-select)
        tag_names = normalize_tag_list(data.get("tags"))
        tags_str = ", ".join(tag_names)
        if data.get("tags"):
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
                page_data["properties"][COLOR_TAGS_PROP] = {
                    "multi_select": [{"name": tag_name} for tag_name in tag_names]
                }
                
        # 调用智能路由分类功能
        album_name, album_id = resolve_album(data.get("album"), use_default=True)
        data["album"] = album_name
        if album_id and album_id != "id_fallback":
            page_data["properties"]["库B：专辑标签库"] = {
                "relation": [
                    {"id": album_id}
                ]
            }
                
        # 添加封面图片
        if data.get("cover") and not self.cover_upload_to_notion:
            page_data["cover"] = self.external_cover_payload(data.get("cover"))
        
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
                    verify=self.verify_ssl,
                    timeout=self.notion_timeout
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
                    print(f"   专辑: {data.get('album', '未设置')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    print("   状态: 待阅读".encode('gbk', 'ignore').decode('gbk', 'ignore'))
                    print_album_candidates(data.get("album_candidates", []), data.get("album"))
                    if data.get("cover"):
                        self.persist_cover_for_page(page_id, data.get("cover"))

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

    def backfill_placeholder(self, page_id, data):
        """用卡片可见字段回填已存在的明显占位记录。"""
        incoming_title = (data.get("title") or "").strip()
        incoming_summary = (data.get("summary") or "").strip()
        incoming_tags = data.get("tags") or ""
        if isinstance(incoming_tags, list):
            incoming_tags = ", ".join([tag.strip() for tag in incoming_tags if tag.strip()])
        incoming_tags = incoming_tags.strip()

        if not incoming_title and not incoming_summary and not incoming_tags:
            return False

        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        headers = {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json"
        }

        try:
            resp = requests.get(f"https://api.notion.com/v1/pages/{page_id}", headers=headers, verify=False, timeout=15)
            if resp.status_code != 200:
                print(f"[WARN] 获取已存在页面失败，跳过占位回填: {resp.text}")
                return False

            props = resp.json().get("properties", {})

            def read_title(prop):
                return "".join([item.get("plain_text", "") for item in prop.get("title", [])])

            def read_rich_text(prop):
                return "".join([item.get("plain_text", "") for item in prop.get("rich_text", [])])

            current_title = read_title(props.get("标题", {}))
            current_summary = read_rich_text(props.get("简介", {}))
            current_tags = read_rich_text(props.get("野生标签", {}))
            current_color_tags = props.get(COLOR_TAGS_PROP, {}).get("multi_select", [])
            current_album = props.get("库B：专辑标签库", {}).get("relation", [])

            placeholder_titles = {"小红书笔记提取失败", "小红书笔记", "未命名笔记"}
            placeholder_summaries = {"无法提取内容", "无内容", "无简介"}

            update_props = {}
            if incoming_title and (not current_title or current_title in placeholder_titles):
                update_props["标题"] = {"title": [{"text": {"content": incoming_title}}]}
            if incoming_summary and (not current_summary or current_summary in placeholder_summaries):
                update_props["简介"] = {"rich_text": [{"text": {"content": incoming_summary}}]}
            if incoming_tags and not current_tags:
                update_props["野生标签"] = {"rich_text": [{"text": {"content": incoming_tags}}]}
            if incoming_tags and not current_color_tags:
                tag_names = normalize_tag_list(incoming_tags)
                if tag_names:
                    update_props[COLOR_TAGS_PROP] = {
                        "multi_select": [{"name": tag_name} for tag_name in tag_names]
                    }
            album_name, album_id = resolve_album(data.get("album"), use_default=True)
            if album_id and album_id != "id_fallback" and not current_album:
                update_props["库B：专辑标签库"] = {"relation": [{"id": album_id}]}
                data["album"] = album_name

            if not update_props:
                return False

            patch_resp = requests.patch(
                f"https://api.notion.com/v1/pages/{page_id}",
                headers=headers,
                json={"properties": update_props},
                verify=False,
                timeout=15
            )
            if patch_resp.status_code == 200:
                print("[OK] 已用卡片可见字段回填占位记录")
                return True

            print(f"[WARN] 占位记录回填失败: {patch_resp.text}")
            return False
        except Exception as e:
            print(f"[WARN] 占位记录回填异常: {e}")
            return False

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

    def update_album(self, page_id, album_name):
        """为已存在的Notion页面更新专辑（Relation属性）"""
        # 兼容处理未分类收件箱
        album_name, album_id = resolve_album(album_name, use_default=False)
        
        if not album_id or album_id == "id_fallback":
            print(f"[FAIL] 找不到专辑 '{album_name}' 的映射 ID。")
            return False
            
        import requests
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        headers = {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json"
        }
        
        update_payload = {
            "properties": {
                "库B：专辑标签库": {
                    "relation": [
                        {"id": album_id}
                    ]
                }
            }
        }
        
        try:
            patch_resp = requests.patch(
                f"https://api.notion.com/v1/pages/{page_id}", 
                headers=headers, 
                json=update_payload, 
                verify=False, 
                timeout=15
            )
            
            if patch_resp.status_code == 200:
                print(f"[OK] 成功更新专辑为: {album_name}")
                return True
            else:
                print(f"[FAIL] 更新专辑失败: {patch_resp.text}")
                return False
                
        except Exception as e:
            print(f"[FAIL] 更新专辑请求异常: {e}")
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
    parser.add_argument('--update-album', help='更新专辑名称，将应用到最近一次保存的笔记上')
    parser.add_argument('--select-album-candidate', type=int, choices=range(1, MAX_ALBUM_CANDIDATES + 1), metavar='N', help='按最近一次候选列表的序号更新专辑，范围 1-5')
    parser.add_argument('--describe-album', help='为指定专辑写入或更新给 LLM 参考的语义描述')
    parser.add_argument('--album-description', help='专辑语义描述文本，需配合 --describe-album 使用')
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
        
    # 如果是更新专辑的指令
    if args.update_album:
        last_id_file = Path(__file__).parent / "last_page_id.txt"
        if not last_id_file.exists():
            print("[FAIL] 找不到最近保存的笔记记录，无法更新专辑。")
            sys.exit(1)
        
        with open(last_id_file, "r", encoding="utf-8") as f:
            page_id = f.read().strip()
            
        saver = NotionSaver()
        print(f"正在为笔记(ID: {page_id})更新专辑为: {args.update_album}...")
        success = saver.update_album(page_id, args.update_album)
        sys.exit(0 if success else 1)

    if args.select_album_candidate:
        state = read_album_candidates()
        if not state or not state.get("page_id") or not state.get("candidates"):
            print("[FAIL] 找不到最近一次专辑候选记录，无法按数字更新专辑。")
            sys.exit(1)

        candidates = state.get("candidates", [])
        index = args.select_album_candidate - 1
        if index >= len(candidates):
            print(f"[FAIL] 最近一次候选列表只有 {len(candidates)} 项，无法选择第 {args.select_album_candidate} 项。")
            sys.exit(1)

        selected = candidates[index]["name"]
        saver = NotionSaver()
        print(f"正在按候选序号 {args.select_album_candidate} 更新专辑为: {selected}...")
        success = saver.update_album(state["page_id"], selected)
        if success:
            state["selected_album"] = selected
            with open(CANDIDATE_FILE, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            print_album_candidates(candidates, selected)
            print("OPENCLAW_REPLY_START")
            print(f"已更新专辑：{selected}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
            print("OPENCLAW_REPLY_END")
        sys.exit(0 if success else 1)

    if args.describe_album:
        if not args.album_description:
            print("[FAIL] 缺少 --album-description，无法更新专辑描述。")
            sys.exit(1)
        success, error, resolved_name = update_album_description(args.describe_album, args.album_description)
        if not success:
            print(f"[FAIL] 更新专辑描述失败: {error}")
            sys.exit(1)
        print(f"[OK] 已更新专辑描述: {resolved_name}")
        print_album_description_reply(resolved_name, args.album_description.strip())
        sys.exit(0)
        
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
        "url": args.url,
        "title": args.title,
        "summary": args.summary,
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
                data["title"] = args.title or extracted.get('title') or '未命名笔记'
                data["summary"] = args.summary or extracted.get('content') or '无简介'
                
                # 如果没有手动传入作者、标签、封面，则使用提取到的
                if not args.author and extracted.get('author'):
                    args.author = extracted.get('author')
                if not args.tags and extracted.get('tags'):
                    args.tags = ",".join(extracted.get('tags'))
                if not args.cover and extracted.get('cover_url'):
                    args.cover = extracted.get('cover_url')
                print("[OK] 提取成功！")
            else:
                print("[WARN] 提取失败，将使用已提供的卡片字段或默认占位文本。")
                data["title"] = args.title or "小红书笔记提取失败"
                data["summary"] = args.summary or "无法提取内容"
        except ImportError as e:
            print(f"[FAIL] 找不到 xhs_content_extractor 模块，提取失败！({e})")
            data["title"] = args.title or "小红书笔记"
            data["summary"] = args.summary or "无内容"
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
    else:
        album_candidates = recommend_albums(data)
        if album_candidates:
            data["album_candidates"] = album_candidates
            data["album"] = album_candidates[0]["name"]

    print(f"标题: {data.get('title')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"链接: {data.get('url')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print(f"简介: {data.get('summary')[:50]}...".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("author"):
        print(f"作者: {data.get('author')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("tags"):
        print(f"标签: {data.get('tags')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("cover"):
        print(f"封面: {data.get('cover')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    if data.get("album"):
        print(f"专辑: {data.get('album')}".encode('gbk', 'ignore').decode('gbk', 'ignore'))
    print_album_candidates(data.get("album_candidates", []), data.get("album"))
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
            saver.backfill_placeholder(duplicate_id, data)
            if data.get("cover"):
                saver.persist_cover_for_page(duplicate_id, data.get("cover"))
            if data.get("album_candidates"):
                write_album_candidates(duplicate_id, data["album_candidates"], data.get("album"))
                print_album_candidates(data["album_candidates"], data.get("album"))
            print_openclaw_reply(data, existing=True)
            # 把已经存在的 ID 写进 last_page_id，这样哪怕是重复的，也能随时给它加标签！
            with open(Path(__file__).parent / "last_page_id.txt", "w", encoding="utf-8") as f:
                f.write(duplicate_id)
            sys.exit(0)
            
    page_id = saver.save_to_notion(data)
    
    if page_id:
        with open(Path(__file__).parent / "last_page_id.txt", "w", encoding="utf-8") as f:
            f.write(page_id)
        if data.get("album_candidates"):
            write_album_candidates(page_id, data["album_candidates"], data.get("album"))
        print_openclaw_reply(data)
        print("[OK] 处理完成!")
        sys.exit(0)
    else:
        print("[FAIL] 处理失败!")
        sys.exit(1)

if __name__ == "__main__":
    main()
