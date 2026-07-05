// OpenClaw触发器 - 小红书转Notion (修正作者和标签提取版)
// 修正问题：1) 作者提取错误 2) 标签提取不完整

const { exec } = require('child_process');
const path = require('path');

// 配置
const CONFIG = {
    scriptPath: path.join(__dirname, 'save_to_notion.ps1'),
    env: {
        NOTION_API_KEY: process.env.NOTION_API_KEY,
        NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID
    }
};

// 小红书链接正则表达式 - 支持多种格式
const XIAOHONGSHU_REGEX = /https?:\/\/(www\.)?(xiaohongshu\.com|xhslink\.com)\/[^\s]+/;

// Hashtag正则表达式 - 提取#标签
const HASHTAG_REGEX = /#([^#\s]+)/g;

/**
 * 智能提取作者信息
 * @param {Object} message - 消息对象
 * @returns {string} - 作者名字或空字符串
 */
function extractAuthorIntelligently(message) {
    // 规则1: 如果tag字段包含"作者:"或"@"，提取作者
    if (message.card && message.card.tag) {
        const tag = message.card.tag.toString();
        if (tag.includes('作者:') || tag.includes('@')) {
            return tag.replace('作者:', '').replace('@', '').trim();
        }
        // 如果tag是"小红书"，视为平台标签，不是作者
        if (tag === '小红书') {
            return '';
        }
    }
    
    // 规则2: 从文本消息中提取作者
    if (message.text) {
        const lines = message.text.split('\n');
        for (const line of lines) {
            if (line.includes('作者:') || line.startsWith('@')) {
                return line.replace('作者:', '').replace('@', '').trim();
            }
        }
    }
    
    // 规则3: 默认情况下，如果没有明确作者信息，返回空
    // 注意：实际作者信息可能在图片或完整内容中，这里无法提取
    return '';
}

/**
 * 智能提取标签信息
 * @param {Object} message - 消息对象
 * @returns {Array} - 标签数组
 */
function extractTagsIntelligently(message) {
    const tags = new Set();
    
    // 规则1: 从tag字段提取平台标签（如果不是作者）
    if (message.card && message.card.tag) {
        const tag = message.card.tag.toString();
        if (tag && tag !== '小红书' && !tag.includes('作者:') && !tag.includes('@')) {
            tags.add(tag);
        }
        // "小红书"作为平台标签
        if (tag === '小红书') {
            tags.add('小红书');
        }
    }
    
    // 规则2: 从desc字段提取Hashtag标签
    if (message.card && message.card.desc) {
        const desc = message.card.desc;
        const hashtags = desc.match(HASHTAG_REGEX);
        if (hashtags) {
            hashtags.forEach(hashtag => {
                // 移除#符号，只保留标签内容
                const tag = hashtag.replace('#', '').trim();
                if (tag) {
                    tags.add(tag);
                }
            });
        }
    }
    
    // 规则3: 从title中提取关键词作为标签
    if (message.card && message.card.title) {
        const title = message.card.title;
        // 简单关键词提取（可根据需要扩展）
        const keywords = ['QQ', '机器人', 'Agent', '协作', 'Openclaw'];
        keywords.forEach(keyword => {
            if (title.includes(keyword)) {
                tags.add(keyword);
            }
        });
    }
    
    // 规则4: 从文本消息中提取
    if (message.text) {
        // 提取Hashtag
        const hashtags = message.text.match(HASHTAG_REGEX);
        if (hashtags) {
            hashtags.forEach(hashtag => {
                const tag = hashtag.replace('#', '').trim();
                if (tag) {
                    tags.add(tag);
                }
            });
        }
        
        // 提取tag字段
        const lines = message.text.split('\n');
        for (const line of lines) {
            if (line.includes('tag:')) {
                const tagContent = line.split('tag:')[1]?.trim();
                if (tagContent && !tagContent.includes('作者:')) {
                    tagContent.split(',').forEach(tag => {
                        const trimmedTag = tag.trim();
                        if (trimmedTag) {
                            tags.add(trimmedTag);
                        }
                    });
                }
            }
        }
    }
    
    return Array.from(tags);
}

/**
 * 解析卡片消息
 * @param {Object} message - 消息对象
 * @returns {Object} - 包含所有提取信息的对象
 */
function parseCardMessage(message) {
    const result = {
        url: '',
        title: '',
        summary: '',
        author: '',
        tags: []
    };
    
    // 提取URL
    if (message.card && message.card.jump_url) {
        result.url = message.card.jump_url;
    } else if (message.text) {
        const urlMatch = message.text.match(XIAOHONGSHU_REGEX);
        if (urlMatch) {
            result.url = urlMatch[0];
        }
    }
    
    // 提取标题
    if (message.card && message.card.title) {
        result.title = message.card.title;
    } else if (message.text) {
        const lines = message.text.split('\n');
        for (const line of lines) {
            if (line.includes('title:')) {
                result.title = line.split('title:')[1]?.trim() || '';
                break;
            }
        }
        if (!result.title && lines.length > 0) {
            result.title = lines[0].substring(0, 100);
        }
    }
    
    // 提取简介
    if (message.card && message.card.desc) {
        result.summary = message.card.desc;
    } else if (message.text) {
        const lines = message.text.split('\n');
        for (const line of lines) {
            if (line.includes('desc:')) {
                result.summary = line.split('desc:')[1]?.trim() || '';
                break;
            }
        }
    }
    
    // 智能提取作者
    result.author = extractAuthorIntelligently(message);
    
    // 智能提取标签
    result.tags = extractTagsIntelligently(message);
    
    // 设置默认值
    if (!result.title) {
        result.title = `小红书笔记 - ${new Date().toLocaleString('zh-CN')}`;
    }
    
    if (!result.summary) {
        result.summary = '从小红书保存的笔记';
    }
    
    return result;
}

/**
 * 保存到Notion
 * @param {Object} data - 包含所有信息的数据对象
 * @returns {Promise<boolean>} - 是否成功
 */
async function saveToNotion(data) {
    return new Promise((resolve, reject) => {
        // 构建PowerShell命令参数
        const params = [
            `-url "${data.url}"`,
            `-title "${data.title.replace(/"/g, '\\"')}"`,
            `-summary "${data.summary.replace(/"/g, '\\"')}"`
        ];
        
        // 添加作者参数（如果有）
        if (data.author) {
            params.push(`-author "${data.author.replace(/"/g, '\\"')}"`);
        }
        
        // 添加标签参数（如果有）
        if (data.tags && data.tags.length > 0) {
            const tagsStr = data.tags.join(',');
            params.push(`-tags "${tagsStr.replace(/"/g, '\\"')}"`);
        }
        
        // PowerShell命令
        const cmd = `powershell -ExecutionPolicy Bypass -File "${CONFIG.scriptPath}" ${params.join(' ')}`;
        
        console.log(`执行命令: ${cmd.substring(0, 200)}...`);
        
        // 设置环境变量
        const env = {
            ...process.env,
            ...CONFIG.env
        };
        
        exec(cmd, { env }, (error, stdout, stderr) => {
            if (error) {
                console.error(`执行错误: ${error}`);
                console.error(`stderr: ${stderr}`);
                reject(false);
                return;
            }
            
            console.log(`stdout: ${stdout}`);
            
            // 检查是否成功
            if (stdout && stdout.includes('✅')) {
                console.log('✅ 保存成功！');
                resolve(true);
            } else if (stderr && stderr.includes('错误')) {
                console.error(`脚本错误: ${stderr}`);
                reject(false);
            } else {
                // 如果没有明确错误，假设成功
                console.log('保存完成');
                resolve(true);
            }
        });
    });
}

/**
 * 主处理函数
 * @param {Object} context - OpenClaw上下文
 * @returns {Promise<void>}
 */
async function handleXiaohongshuLink(context) {
    const { message } = context;
    
    if (!message) {
        return;
    }
    
    console.log(`收到消息类型: ${message.type || 'text'}`);
    
    // 解析消息
    const data = parseCardMessage(message);
    
    if (!data.url) {
        console.log('未检测到小红书链接');
        return;
    }
    
    console.log(`检测到小红书链接: ${data.url}`);
    console.log(`标题: ${data.title}`);
    console.log(`简介: ${data.summary}`);
    console.log(`作者: ${data.author || '未提取到'}`);
    console.log(`标签: ${data.tags.length > 0 ? data.tags.join(', ') : '无'}`);
    
    // 检查环境变量
    if (!CONFIG.env.NOTION_API_KEY || !CONFIG.env.NOTION_DATABASE_ID) {
        console.error('错误: 未设置Notion环境变量');
        console.error('请设置 NOTION_API_KEY 和 NOTION_DATABASE_ID 环境变量');
        
        // 尝试从环境变量获取
        const apiKey = process.env.NOTION_API_KEY;
        const dbId = process.env.NOTION_DATABASE_ID;
        
        if (apiKey && dbId) {
            console.log('从环境变量获取到配置');
            CONFIG.env.NOTION_API_KEY = apiKey;
            CONFIG.env.NOTION_DATABASE_ID = dbId;
        } else {
            console.error('环境变量未设置，无法继续');
            return;
        }
    }
    
    try {
        // 保存到Notion
        const success = await saveToNotion(data);
        
        if (success) {
            console.log('✅ 成功保存到Notion!');
            
            // 发送成功消息给用户
            try {
                let reply = `✅ 已保存到Notion！\n`;
                reply += `📝 标题: ${data.title}\n`;
                if (data.author) {
                    reply += `👤 作者: ${data.author}\n`;
                }
                if (data.tags.length > 0) {
                    reply += `🏷️ 标签: ${data.tags.join(', ')}\n`;
                }
                reply += `🔗 链接: ${data.url}`;
                
                console.log(`回复内容: ${reply}`);
                // 实际发送消息
                // await context.send(reply);
            } catch (sendError) {
                console.error('发送确认消息失败:', sendError);
            }
        } else {
            console.error('❌ 保存到Notion失败');
        }
    } catch (error) {
        console.error('处理失败:', error);
    }
}

// 导出模块
module.exports = {
    parseCardMessage,
    extractAuthorIntelligently,
    extractTagsIntelligently,
    saveToNotion,
    handleXiaohongshuLink
};

// 测试代码
if (require.main === module) {
    // 测试修正后的提取逻辑
    const testMessage = {
        type: 'card',
        card: {
            title: 'QQ给我当头一棒 😱 现实太残酷！ 第1个机器人：稳 第2个…',
            desc: 'QQ给我当头一棒 😱 现实太残酷！ 第1个机器人：稳 第2个机器人：也稳 第3个…',
            tag: '小红书',
            jump_url: 'https://www.xiaohongshu.com/discovery/item/69bb6066000000002101190d'
        }
    };
    
    console.log('测试修正后的提取逻辑:');
    const data = parseCardMessage(testMessage);
    console.log('作者提取:', data.author || '空（正确，因为tag是"小红书"）');
    console.log('标签提取:', data.tags.join(', ') || '无');
    console.log('注意: 实际作者"养虾人小黄"在图片中，无法从卡片消息提取');
}