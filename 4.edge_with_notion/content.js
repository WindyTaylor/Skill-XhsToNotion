// 异步的延迟函数，用于防封禁
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isScrapingPaused = false;

// 监听来自 popup.js 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startScraping') {
        const maxCount = request.maxCount || 50;
        console.log(`[Content Script] 收到抓取指令，目标数量: ${maxCount}`);
        
        // 由于页面滚动和抓取是异步且耗时的过程
        // 必须返回 true 以表明我们将异步调用 sendResponse
        startScraping(maxCount).then(data => {
            sendResponse({ success: true, data: data });
        }).catch(error => {
            console.error('[Content Script] 抓取过程中出错:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; 
    } else if (request.action === 'togglePauseScraping') {
        isScrapingPaused = !isScrapingPaused;
        console.log(`[Content Script] 抓取状态切换: ${isScrapingPaused ? '已暂停' : '已恢复'}`);
        sendResponse({ success: true, isPaused: isScrapingPaused });
        return true;
    }
});

/**
 * 核心抓取逻辑，包含自动滚动（精简版：仅抓取列表信息，不包含详情页抓取）
 */
async function startScraping(maxCount) {
    let scrapedData = [];
    // 使用 Set 记录已抓取的链接，防止因为瀑布流重绘导致重复抓取
    let scrapedUrls = new Set();
    
    // 滚动防死循环配置
    let scrollAttempts = 0;
    const maxScrollAttempts = 8; // 连续多次滚动无新数据则认为到底了
    
    while (scrapedData.length < maxCount) {
        // 挂起逻辑
        while (isScrapingPaused) {
            await sleep(500);
        }

        // 1. 解析当前页面的笔记卡片 DOM
        const newItems = extractNoteData();
        
        let addedCount = 0;
        for (const item of newItems) {
            // 去重逻辑：优先使用笔记链接，如果没有则使用标题+作者名，如果都没获取到则使用随机数保证至少能抓取到
            const uniqueKey = item.noteUrl || (item.title + '-' + item.authorName) || Math.random().toString();
            
            if (!scrapedUrls.has(uniqueKey)) {
                scrapedUrls.add(uniqueKey);
                scrapedData.push(item);
                addedCount++;
                
                // 达到数量限制时提前退出
                if (scrapedData.length >= maxCount) {
                    break;
                }
            }
        }
        
        console.log(`[Content Script] 当前进度: 已获取 ${scrapedData.length}/${maxCount} 条新数据...`);
        
        if (scrapedData.length >= maxCount) {
            console.log('[Content Script] 达到目标抓取数量，停止抓取。');
            break;
        }

        // 2. 模拟向下滚动页面以触发瀑布流加载
        const previousHeight = document.body.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
        
        // 等待页面请求和 DOM 渲染新内容（可根据网速调整延时）
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const newHeight = document.body.scrollHeight;
        
        // 3. 判断是否无法继续加载更多
        if (newHeight === previousHeight && addedCount === 0) {
            // 高度没变且没有解析出新数据，视为加载到底或加载卡住
            scrollAttempts++;
            if (scrollAttempts >= maxScrollAttempts) {
                console.log('[Content Script] 连续多次滚动未获取到新内容，停止抓取。');
                break;
            }
        } else {
            // 如果加载出了新内容或高度发生变化，重置尝试次数
            scrollAttempts = 0;
        }
    }
    
    // 裁剪掉可能多出的数据返回
    return scrapedData.slice(0, maxCount);
}

/**
 * 负责解析当前 DOM 中的所有符合条件的卡片节点
 */
function extractNoteData() {
    const items = [];
    
    // 1. 实际小红书笔记卡片的包裹容器
    const cardSelector = '.note-item'; 
    const cards = document.querySelectorAll(cardSelector);
    
    cards.forEach(card => {
        try {
            // 1. 笔记标题
            const titleEl = card.querySelector('.title'); 
            const title = titleEl ? titleEl.textContent.trim() : '';
            
           // 2. 笔记链接 (彻底拥抱 xsec_token，不擅自“清洗”链接)
           let noteUrl = '';
            
           // 精准定位你截图里的那个带有 class="cover mask ld" 的 a 标签
           const linkEl = card.querySelector('a.cover'); 
           
           if (linkEl && linkEl.href) {
               // 注意：在浏览器环境读取 DOM 节点的 .href 属性时，
               // 浏览器会自动帮你补全 "https://www.xiaohongshu.com" 前缀，非常省心。
               noteUrl = linkEl.href; 
           } else {
               // 兜底：如果找不到 cover，就随便找第一个 a 标签
               const fallbackEl = card.querySelector('a');
               noteUrl = fallbackEl ? (fallbackEl.href || '') : '';
           }
            
            // 3. 作者名称
            const authorEl = card.querySelector('.name'); 
            const authorName = authorEl ? authorEl.textContent.trim() : '';
            
            // 4. 封面图链接
            const coverEl = card.querySelector('.cover img'); 
            let coverUrl = '';
            
            if (coverEl) {
                if (coverEl.tagName.toLowerCase() === 'img') {
                    coverUrl = coverEl.src || '';
                } else if (coverEl.style && coverEl.style.backgroundImage) {
                    const match = coverEl.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                    if (match && match[1]) {
                        coverUrl = match[1];
                    }
                }
                if (!coverUrl) {
                    coverUrl = coverEl.getAttribute('src') || coverEl.getAttribute('data-src') || '';
                }
            }
            
            items.push({
                title: title,
                noteUrl: noteUrl,
                authorName: authorName,
                coverUrl: coverUrl,
                tags: [] // 初始化为空数组，后续由 popup 处理
            });
            
        } catch (error) {
            console.error('[Content Script] 解析单个卡片节点时出错:', error);
        }
    });
    
    return items;
}
