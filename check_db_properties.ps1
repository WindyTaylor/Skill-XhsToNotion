# 检查数据库属性

$apiKey = "ntn_u3940930740492DuwPRRfsWKq3vhLzVLY9B14K8S0iC1Wh"
$dbId = "33e0eae5d4b48036abaad89b2e97fa73"
$notionVersion = "2025-09-03"

Write-Host "检查Notion数据库属性..." -ForegroundColor Cyan

try {
    # 获取数据库信息
    $response = curl.exe -s -X GET "https://api.notion.com/v1/databases/$dbId" `
        -H "Authorization: Bearer $apiKey" `
        -H "Notion-Version: $notionVersion"
    
    Write-Host "响应:" -ForegroundColor Yellow
    Write-Host $response
    
    # 尝试解析响应
    try {
        $dbInfo = $response | ConvertFrom-Json
        
        if ($dbInfo.properties) {
            Write-Host "`n数据库属性列表:" -ForegroundColor Green
            foreach ($prop in $dbInfo.properties.PSObject.Properties) {
                $propName = $prop.Name
                $propType = $prop.Value.type
                Write-Host "  - $propName ($propType)" -ForegroundColor White
            }
        } else {
            Write-Host "`n⚠️ 未找到属性信息" -ForegroundColor Yellow
            Write-Host "可能需要更新数据库以包含'作者'和'标签'属性" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "解析响应失败: $_" -ForegroundColor Red
    }
    
} catch {
    Write-Host "请求失败: $_" -ForegroundColor Red
}