# 小红书转Notion保存脚本 (增强版)
# 支持提取作者和标签信息
# 使用正确的属性名称：标题, 小红书链接, 简介, 作者, 标签

param(
    [string]$Url,
    [string]$Title,
    [string]$Summary,
    [string]$Author,
    [string]$Tags
)

# 配置
$apiKey = "ntn_u3940930740492DuwPRRfsWKq3vhLzVLY9B14K8S0iC1Wh"
$dbId = "33e0eae5d4b48036abaad89b2e97fa73"
$notionVersion = "2025-09-03"

# 检查参数
if (-not $Url) {
    Write-Host "错误: 需要提供URL"
    exit 1
}

if (-not $Title) {
    $Title = "小红书笔记 - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

if (-not $Summary) {
    $Summary = "从小红书保存的笔记: $Url"
}

Write-Host "正在保存到Notion (增强版)..." -ForegroundColor Cyan
Write-Host "标题: $Title" -ForegroundColor Yellow
Write-Host "小红书链接: $Url" -ForegroundColor Yellow
Write-Host "简介: $Summary" -ForegroundColor Yellow

if ($Author) {
    Write-Host "作者: $Author" -ForegroundColor Green
}

if ($Tags) {
    Write-Host "标签: $Tags" -ForegroundColor Magenta
}

Write-Host ""

# 构建基础JSON请求体
$jsonBase = @"
{
  "parent": {
    "database_id": "$dbId"
  },
  "properties": {
    "title": {
      "title": [
        {
          "text": {
            "content": "$Title"
          }
        }
      ]
    },
    "小红书链接": {
      "url": "$Url"
    },
    "简介": {
      "rich_text": [
        {
          "text": {
            "content": "$Summary"
          }
        }
      ]
    }
"@

# 添加作者信息（如果有）
if ($Author) {
    $jsonBase += @",
    "作者": {
      "rich_text": [
        {
          "text": {
            "content": "$Author"
          }
        }
      ]
    }
"@
}

# 添加标签信息（如果有）
if ($Tags) {
    $jsonBase += @",
    "标签": {
      "multi_select": [
"@
    
    # 解析标签字符串（逗号分隔）
    $tagArray = $Tags -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    
    $tagItems = @()
    foreach ($tag in $tagArray) {
        $tagItems += @"
        {
          "name": "$tag"
        }
"@
    }
    
    $jsonBase += ($tagItems -join ",")
    $jsonBase += @"
      ]
    }
"@
}

# 闭合JSON
$jsonBase += @"
  }
}
"@

# 保存JSON到临时文件
$tempFile = "$env:TEMP\notion_save_enhanced_$(Get-Date -Format 'yyyyMMddHHmmss').json"
$jsonBase | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "发送请求到Notion API..." -ForegroundColor Cyan
Write-Host "使用的属性: 标题, 小红书链接, 简介" -NoNewline

if ($Author) {
    Write-Host ", 作者" -NoNewline -ForegroundColor Green
}

if ($Tags) {
    Write-Host ", 标签" -NoNewline -ForegroundColor Magenta
}

Write-Host ""

try {
    # 使用curl发送请求
    $response = curl.exe -s -X POST "https://api.notion.com/v1/pages" `
        -H "Authorization: Bearer $apiKey" `
        -H "Notion-Version: $notionVersion" `
        -H "Content-Type: application/json" `
        -d "@$tempFile"
    
    # 检查响应
    if ($response -match '"object":"error"') {
        Write-Host "❌ 保存失败" -ForegroundColor Red
        Write-Host "错误响应: $response" -ForegroundColor Red
        
        # 尝试解析错误
        try {
            $errorObj = $response | ConvertFrom-Json
            if ($errorObj.message) {
                Write-Host "错误信息: $($errorObj.message)" -ForegroundColor Red
                
                # 检查是否是缺少属性错误
                if ($errorObj.message -match "不是数据库中的属性") {
                    Write-Host "⚠️ 提示: 数据库可能缺少'作者'或'标签'属性" -ForegroundColor Yellow
                    Write-Host "建议在Notion数据库中添加对应的属性：" -ForegroundColor Yellow
                    Write-Host "  - '作者' (Rich text类型)" -ForegroundColor Yellow
                    Write-Host "  - '标签' (Multi-select类型)" -ForegroundColor Yellow
                }
            }
        } catch {
            # 忽略解析错误
        }
        
        # 清理临时文件
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        
        return $false
    } else {
        # 解析响应获取页面ID
        $responseObj = $response | ConvertFrom-Json
        Write-Host "✅ 成功保存到Notion！" -ForegroundColor Green
        Write-Host ""
        Write-Host "📄 页面信息：" -ForegroundColor Cyan
        Write-Host "页面ID: $($responseObj.id)" -ForegroundColor White
        Write-Host "页面链接: https://notion.so/$($responseObj.id)" -ForegroundColor White
        Write-Host "创建时间: $($responseObj.created_time)" -ForegroundColor White
        
        # 显示保存的属性
        Write-Host ""
        Write-Host "📋 保存的属性：" -ForegroundColor Cyan
        if ($responseObj.properties.作者) {
            Write-Host "作者: $($responseObj.properties.作者.rich_text[0].plain_text)" -ForegroundColor Green
        }
        if ($responseObj.properties.标签) {
            $savedTags = $responseObj.properties.标签.multi_select | ForEach-Object { $_.name }
            Write-Host "标签: $($savedTags -join ', ')" -ForegroundColor Magenta
        }
        
        # 清理临时文件
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        
        return $true
    }
    
} catch {
    Write-Host "❌ 保存失败" -ForegroundColor Red
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
    
    # 清理临时文件
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    
    return $false
}