document.addEventListener('DOMContentLoaded', () => {
    const startScrapeBtn = document.getElementById('start-scrape-btn');
    const pauseScrapeBtn = document.getElementById('pause-scrape-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportHtmlBtn = document.getElementById('export-html-btn');
    const exportMdBtn = document.getElementById('export-md-btn');
    const syncNotionBtn = document.getElementById('sync-notion-btn');
    const pauseSyncBtn = document.getElementById('pause-sync-btn');
    const syncStatus = document.getElementById('sync-status');
    const notionTokenInput = document.getElementById('notion-token');
    const databaseIdInput = document.getElementById('database-id');
    const maxCountInput = document.getElementById('max-count');
    const openDedicatedTabBtn = document.getElementById('open-dedicated-tab-btn');
    const incrementalModeCheckbox = document.getElementById('incremental-mode-checkbox');

    // 在独立网页中打开逻辑 (防断电)
    if (openDedicatedTabBtn) {
        if (window.innerWidth > 600) {
            openDedicatedTabBtn.style.display = 'none'; // 如果已经在独立页面中，隐藏该按钮
        } else {
            openDedicatedTabBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
            });
        }
    }
    
    // 初始化时从 storage 读取之前保存的配置
    chrome.storage.local.get(['notionToken', 'databaseId'], (result) => {
        if (result.notionToken) notionTokenInput.value = result.notionToken;
        if (result.databaseId) databaseIdInput.value = result.databaseId;
    });

    // 监听输入框变化并保存
    notionTokenInput.addEventListener('input', (e) => {
        chrome.storage.local.set({ notionToken: e.target.value });
    });
    databaseIdInput.addEventListener('input', (e) => {
        chrome.storage.local.set({ databaseId: e.target.value });
    });

    // 暂存抓取的数据，供导出按钮使用
    let scrapedData = [];
    let isSyncPaused = false;

    // 延时函数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 注入到后台标签页执行的标签提取函数
    function extractTagsInTab(authorNameToFilter) {
        let tags = [];
        let foundInInitialState = false;

        // 优先级 1: 读取底层内存数据
        const scriptNodes = document.querySelectorAll('script');
        for (const script of scriptNodes) {
            if (script.textContent && script.textContent.includes('window.__INITIAL_STATE__=')) {
                try {
                    const tagsMatch = script.textContent.match(/"tags":\s*\[(.*?)\]/);
                    if (tagsMatch && tagsMatch[1]) {
                        // 升级正则：严格匹配 "type":"topic" 以排除用户和地点类型
                        const nameMatches = tagsMatch[1].match(/"name":\s*"([^"]+)","type":\s*"topic"/g);
                        if (nameMatches) {
                            nameMatches.forEach(nameStr => {
                                const match = nameStr.match(/"name":\s*"([^"]+)"/);
                                if (match && match[1]) {
                                    const tagText = match[1].replace(/#/g, '').trim();
                                    if (tagText) {
                                        tags.push(tagText);
                                    }
                                }
                            });
                            foundInInitialState = true;
                        }
                    }
                } catch (e) {
                    console.warn('[Popup -> Tab Script] 从 __INITIAL_STATE__ 提取标签失败:', e);
                }
                break;
            }
        }

        // 优先级 2: DOM 提取兜底
        if (!foundInInitialState || tags.length === 0) {
            const tagNodes = document.querySelectorAll('.tag, #hash-tag, a.tag'); 
            if (tagNodes && tagNodes.length > 0) {
                tagNodes.forEach(node => {
                    const originalText = node.textContent.trim();
                    // 升级过滤：只提取以 # 开头的字符串，排除 @ 等
                    if (originalText.startsWith('#')) {
                        const tagText = originalText.replace(/#/g, '').trim();
                        if (tagText) {
                            tags.push(tagText);
                        }
                    }
                });
            }
        }
        
        // 终极数据清洗：去重并且彻底剔除等于作者名称的干扰项
        let cleanTags = [...new Set(tags)];
        if (authorNameToFilter) {
            cleanTags = cleanTags.filter(tag => tag !== authorNameToFilter);
        }
        
        return cleanTags;
    }

    // Notion 查重函数
    async function checkIfNoteExists(databaseId, notionToken, noteUrl) {
        try {
            const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${notionToken}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter: {
                        property: '笔记链接',
                        url: {
                            equals: noteUrl
                        }
                    }
                })
            });
            if (response.ok) {
                const data = await response.json();
                return data.results && data.results.length > 0;
            } else {
                console.error('[Popup] 查重请求失败，状态码:', response.status);
            }
        } catch (error) {
            console.error('[Popup] 查重请求发生错误:', error);
        }
        return false;
    }

    // 暂停/继续抓取按钮点击事件
    pauseScrapeBtn.addEventListener('click', () => {
        chrome.tabs.query({ url: "*://*.xiaohongshu.com/*" }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                chrome.tabs.sendMessage(activeTab.id, { action: "togglePauseScraping" }, (response) => {
                    if (response && response.success) {
                        pauseScrapeBtn.textContent = response.isPaused ? '恢复抓取' : '暂停抓取';
                    }
                });
            } else {
                alert('未找到小红书页面，请确保已经打开小红书！');
            }
        });
    });

    // 暂停/继续同步按钮点击事件
    pauseSyncBtn.addEventListener('click', () => {
        isSyncPaused = !isSyncPaused;
        pauseSyncBtn.textContent = isSyncPaused ? '恢复同步' : '暂停同步';
    });

    // 开始抓取按钮点击事件
    startScrapeBtn.addEventListener('click', () => {
        const maxCount = parseInt(maxCountInput.value, 10);
        console.log(`[Popup] 准备开始抓取，最大数量: ${maxCount}`);
        
        // 1. 获取小红书标签页
        chrome.tabs.query({ url: "*://*.xiaohongshu.com/*" }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const activeTab = tabs[0];
                
                // 禁用按钮，避免重复点击，并提示状态
                startScrapeBtn.disabled = true;
                startScrapeBtn.textContent = '抓取中...';
                pauseScrapeBtn.disabled = false;
                pauseScrapeBtn.textContent = '暂停抓取';
                
                // 2. 向目标标签页注入的 content script 发送指令消息
                chrome.tabs.sendMessage(activeTab.id, {
                    action: "startScraping",
                    maxCount: maxCount
                }, (response) => {
                    // 检查通信是否出错 (比如页面没刷新，content script 没加载)
                    if (chrome.runtime.lastError) {
                        startScrapeBtn.disabled = false;
                        startScrapeBtn.textContent = '开始抓取';
                        pauseScrapeBtn.disabled = true;
                        console.error('[Popup] 发送消息失败:', chrome.runtime.lastError.message);
                        alert('无法连接到页面，请刷新当前的小红书页面后重试！');
                        return;
                    }

                    // 3. 处理抓取回传的结果
                    if (response && response.success) {
                        scrapedData = response.data; // 暂存列表数据
                        console.log(`[Popup] 列表抓取完成！共抓取到 ${scrapedData.length} 条数据`);
                        
                        startScrapeBtn.disabled = false;
                        startScrapeBtn.textContent = '重新抓取';
                        pauseScrapeBtn.disabled = true;
                        alert(`列表抓取成功！共获取 ${scrapedData.length} 条数据，可以点击【导出】或同步到 Notion。`);
                    } else {
                        // 无论成功还是失败，都要恢复按钮状态
                        startScrapeBtn.disabled = false;
                        startScrapeBtn.textContent = '开始抓取';
                        pauseScrapeBtn.disabled = true;
                        console.error('[Popup] 抓取中断或异常:', response?.error);
                        alert(`抓取遇到问题: ${response?.error || '未知错误'}`);
                    }
                });
            } else {
                alert('未找到小红书页面，请确保已经打开小红书！');
            }
        });
    });

    // 直接同步到 Notion 按钮点击事件
    syncNotionBtn.addEventListener('click', async () => {
        if (scrapedData.length === 0) {
            alert('当前没有可同步的数据，请先执行【开始抓取】！');
            return;
        }

        const notionToken = notionTokenInput.value.trim();
        const databaseId = databaseIdInput.value.trim();

        if (!notionToken || !databaseId) {
            alert('请先填写 Notion Integration Token 和 Database ID！');
            return;
        }

        console.log(`[Popup] 准备同步 ${scrapedData.length} 条数据到 Notion Database: ${databaseId}`);
        syncNotionBtn.disabled = true;
        pauseSyncBtn.disabled = false;
        isSyncPaused = false;
        pauseSyncBtn.textContent = '暂停同步';
        
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;

        for (let i = 0; i < scrapedData.length; i++) {
            // 挂起逻辑
            while (isSyncPaused) {
                await new Promise(r => setTimeout(r, 500));
            }

            const item = scrapedData[i];
            syncStatus.textContent = `处理中... (${i + 1}/${scrapedData.length})`;
            syncStatus.style.color = '#333';

            // 1. 查重
            const exists = await checkIfNoteExists(databaseId, notionToken, item.noteUrl);
            const isIncrementalMode = incrementalModeCheckbox && incrementalModeCheckbox.checked;

            if (exists) {
                if (isIncrementalMode) {
                    console.log(`[增量同步熔断] 遇到已同步的老笔记: ${item.noteUrl}，后续内容无需同步，任务提前完成！`);
                    syncStatus.textContent = `[增量同步熔断] 遇到已存在记录，提前完成！`;
                    syncStatus.style.color = '#d93a00';
                    break; // 彻底跳出整个 for 循环
                } else {
                    console.log(`[Popup] 笔记已存在，跳过: ${item.noteUrl}`);
                    skipCount++;
                    continue; // 默认普通模式，继续下一篇
                }
            }

            // 2. 深度提取标签
            if (item.noteUrl) {
                syncStatus.textContent = `提取标签... (${i + 1}/${scrapedData.length})`;
                try {
                    const tab = await new Promise(resolve => {
                        chrome.tabs.create({ url: item.noteUrl, active: false }, (t) => resolve(t));
                    });

                    await new Promise((resolve) => {
                        const listener = (tabId, changeInfo) => {
                            if (tabId === tab.id && changeInfo.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);
                                resolve();
                            }
                        };
                        chrome.tabs.onUpdated.addListener(listener);
                        setTimeout(() => {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }, 15000);
                    });

                    await sleep(2000);

                    const injectionResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: extractTagsInTab,
                        args: [item.authorName]
                    });

                    if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                        item.tags = injectionResults[0].result;
                    } else {
                        item.tags = [];
                    }

                    chrome.tabs.remove(tab.id);
                } catch (error) {
                    console.error(`[Popup] 抓取标签异常:`, error);
                    item.tags = [];
                }
                
                // 提取完标签后防封禁延时
                await sleep(1500 + Math.random() * 1000);
            }

            // 3. 同步到 Notion
            syncStatus.textContent = `同步中... (${i + 1}/${scrapedData.length})`;
            let safeCoverUrl = '';
            if (item.coverUrl) {
                safeCoverUrl = `https://images.weserv.nl/?url=${encodeURIComponent(item.coverUrl)}`;
            }

            const requestBody = {
                parent: { database_id: databaseId },
                cover: safeCoverUrl ? {
                    type: "external",
                    external: { url: safeCoverUrl }
                } : null,
                properties: {
                    "笔记标题": {
                        title: [
                            { text: { content: item.title || "无标题" } }
                        ]
                    },
                    "笔记链接": {
                        url: item.noteUrl || null
                    },
                    "作者名称": {
                        rich_text: [
                            { text: { content: item.authorName || "" } }
                        ]
                    },
                    "标签": {
                        multi_select: (item.tags || []).map(tag => ({ name: tag }))
                    }
                }
            };

            if (!requestBody.cover) {
                delete requestBody.cover;
            }

            try {
                const response = await fetch('https://api.notion.com/v1/pages', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${notionToken}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    successCount++;
                } else {
                    const errorData = await response.json();
                    console.error(`[Popup] 同步第 ${i + 1} 条失败:`, errorData);
                    failCount++;
                }
            } catch (error) {
                console.error(`[Popup] 同步第 ${i + 1} 条时发生网络错误:`, error);
                failCount++;
            }

            if (i < scrapedData.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        syncNotionBtn.disabled = false;
        pauseSyncBtn.disabled = true;
        pauseSyncBtn.textContent = '暂停同步';
        
        if (failCount === 0) {
            syncStatus.textContent = `同步完成！成功 ${successCount} 条，跳过 ${skipCount} 条`;
            syncStatus.style.color = 'green';
            alert(`🎉 同步完成！成功写入 ${successCount} 条，因重复跳过 ${skipCount} 条。`);
        } else {
            syncStatus.textContent = `同步结束：成功 ${successCount}，跳过 ${skipCount}，失败 ${failCount}`;
            syncStatus.style.color = 'red';
            alert(`同步结束，部分失败（成功：${successCount}，跳过：${skipCount}，失败：${failCount}）。`);
        }
    });

    // 导出为 CSV 按钮点击事件
    exportCsvBtn.addEventListener('click', () => {
        if (scrapedData.length === 0) {
            alert('当前没有可导出的数据，请先执行【开始抓取】！');
            return;
        }
        
        console.log('[Popup] 准备导出 CSV 文件');
        const headers = ['笔记标题', '封面图', '作者名称', '笔记链接', '标签'];
        
        const escapeCSV = (field) => {
            if (field === undefined || field === null) return '""';
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = [];
        csvRows.push(headers.join(','));
        
        scrapedData.forEach(item => {
            const row = [
                escapeCSV(item.title),
                escapeCSV(item.coverUrl),
                escapeCSV(item.authorName),
                escapeCSV(item.noteUrl),
                escapeCSV((item.tags || []).join(', ')) // 标签列用逗号拼接
            ];
            csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const bom = '\uFEFF';
        
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'xiaohongshu_bookmarks.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // 导出为 HTML 按钮点击事件
    exportHtmlBtn.addEventListener('click', () => {
        if (scrapedData.length === 0) {
            alert('当前没有可导出的数据，请先执行【开始抓取】！');
            return;
        }
        
        console.log('[Popup] 准备导出 HTML 文件');
        let htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>小红书书签</title>
    <style>
        body { font-family: sans-serif; padding: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; }
        a { color: #ff2442; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h2>小红书书签导出</h2>
    <table>
        <thead>
            <tr>
                <th>笔记标题</th>
                <th>封面图</th>
                <th>作者名称</th>
                <th>笔记链接</th>
            </tr>
        </thead>
        <tbody>
`;
        scrapedData.forEach(item => {
            htmlContent += `
            <tr>
                <td>${item.title || ''}</td>
                <td><img src="${item.coverUrl || ''}" style="width: 100px; border-radius: 8px;" alt="封面"></td>
                <td>${item.authorName || ''}</td>
                <td><a href="${item.noteUrl || '#'}" target="_blank">点击跳转</a></td>
            </tr>`;
        });
        htmlContent += `
        </tbody>
    </table>
</body>
</html>`;
        
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'xiaohongshu_bookmarks.html';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });

    // 导出为 Markdown 按钮点击事件
    exportMdBtn.addEventListener('click', () => {
        if (scrapedData.length === 0) {
            alert('当前没有可导出的数据，请先执行【开始抓取】！');
            return;
        }
        
        console.log('[Popup] 准备导出 Markdown 文件');
        let mdContent = `| 笔记标题 | 封面图 | 作者名称 | 笔记链接 |\n|---|---|---|---|\n`;
        
        scrapedData.forEach(item => {
            const cover = item.coverUrl || '';
            const title = (item.title || '').replace(/\|/g, '&#124;');
            const author = (item.authorName || '').replace(/\|/g, '&#124;');
            const noteLink = item.noteUrl || '';
            
            mdContent += `| ${title} | ${cover} | ${author} | ${noteLink} |\n`;
        });
        
        const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'xiaohongshu_bookmarks.md';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
});