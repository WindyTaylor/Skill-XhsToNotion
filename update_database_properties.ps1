# 更新Notion数据库属性，添加作者和标签字段

$apiKey = "ntn_u3940930740492DuwPRRfsWKq3vhLzVLY9B14K8S0iC1Wh"
$dbId = "33e0eae5d4b48036abaad89b2e97fa73"
$notionVersion = "2025-09-03"

Write-Host "更新Notion数据库属性..." -ForegroundColor Cyan
Write-Host "数据库ID: $dbId" -ForegroundColor Yellow
Write-Host ""

# 构建更新请求
$updateJson = @"
{
  "properties": {
    "作者": {
      "rich_text": {}
    },
    "标签": {
      "multi_select": {}
    }
  }
}
"@

# 保存到临时文件
$tempFile = "$env:TEMP\update_db_$(Get-Date -Format 'yyyyMMddHHmmss').json"
$updateJson | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "正在添加属性:" -ForegroundColor Cyan
Write-Host "  - 作者 (Rich text类型)" -ForegroundColor Green
Write-Host "  - 标签 (Multi-select类型)" -ForegroundColor Magenta
Write-Host ""

try {
    # 发送更新请求
    Write-Host "发送更新请求到Notion API..." -ForegroundColor Yellow
    $response = curl.exe -s -X PATCH "https://api.notion.com/v1/databases/$dbId" `
        -H "Authorization: Bearer $apiKey" `
        -H "Notion-Version: $notionVersion" `
        -H "Content-Type: application/json" `
        -d "@$tempFile"
    
    # 检查响应
    if ($response -match '"object":"error"') {
        Write-Host "❌ 更新失败" -ForegroundColor Red
        Write-Host "错误响应: $response" -ForegroundColor Red
        
        # 尝试解析错误
        try {
            $errorObj = $response | ConvertFrom-Json
            if ($errorObj.message) {
                Write-Host "错误信息: $($errorObj.message)" -ForegroundColor Red
            }
        } catch {
            # 忽略解析错误
        }
        
    } else {
        Write-Host "✅ 数据库更新成功！" -ForegroundColor Green
        Write-Host ""
        Write-Host "已添加的属性:" -ForegroundColor Cyan
        Write-Host "  1. 作者 (Rich text类型) - 用于保存笔记作者信息" -ForegroundColor White
        Write-Host "  2. 标签 (Multi-select类型) - 用于保存笔记标签" -ForegroundColor White
        Write-Host ""
        Write-Host "现在数据库包含以下属性:" -ForegroundColor Yellow
        Write-Host "  - 标题 (Title类型)" -ForegroundColor White
        Write-Host "  - 小红书链接 (URL类型)" -ForegroundColor White
        Write-Host "  - 简介 (Rich text类型)" -ForegroundColor White
        Write-Host "  - 作者 (Rich text类型)" -ForegroundColor Green
        Write-Host "  - 标签 (Multi-select类型)" -ForegroundColor Magenta
    }
    
    # 清理临时文件
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    
} catch {
    Write-Host "❌ 更新失败" -ForegroundColor Red
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
    
    # 清理临时文件
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
}