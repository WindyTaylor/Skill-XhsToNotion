@echo off
REM 小红书转Notion保存脚本 (批处理版本)

setlocal enabledelayedexpansion

REM 参数解析
set "URL=%~1"
set "TITLE=%~2"
set "SUMMARY=%~3"
set "AUTHOR=%~4"
set "TAGS=%~5"

REM 检查参数
if "%URL%"=="" (
    echo 错误: 需要提供URL
    exit /b 1
)

if "%TITLE%"=="" (
    set "TITLE=小红书笔记"
)

if "%SUMMARY%"=="" (
    set "SUMMARY=从小红书保存的笔记"
)

echo 正在保存到Notion...
echo 标题: %TITLE%
echo 链接: %URL%
echo 简介: %SUMMARY%

if not "%AUTHOR%"=="" (
    echo 作者: %AUTHOR%
)

if not "%TAGS%"=="" (
    echo 标签: %TAGS%
)

echo.

REM 创建临时JSON文件
set "TEMPFILE=%TEMP%\notion_save_%RANDOM%.json"

REM 构建JSON内容
echo { > "%TEMPFILE%"
echo   "parent": { >> "%TEMPFILE%"
echo     "database_id": "33e0eae5d4b48036abaad89b2e97fa73" >> "%TEMPFILE%"
echo   }, >> "%TEMPFILE%"
echo   "properties": { >> "%TEMPFILE%"
echo     "标题": { >> "%TEMPFILE%"
echo       "title": [ >> "%TEMPFILE%"
echo         { >> "%TEMPFILE%"
echo           "text": { >> "%TEMPFILE%"
echo             "content": "%TITLE%" >> "%TEMPFILE%"
echo           } >> "%TEMPFILE%"
echo         } >> "%TEMPFILE%"
echo       ] >> "%TEMPFILE%"
echo     }, >> "%TEMPFILE%"
echo     "小红书链接": { >> "%TEMPFILE%"
echo       "url": "%URL%" >> "%TEMPFILE%"
echo     }, >> "%TEMPFILE%"
echo     "简介": { >> "%TEMPFILE%"
echo       "rich_text": [ >> "%TEMPFILE%"
echo         { >> "%TEMPFILE%"
echo           "text": { >> "%TEMPFILE%"
echo             "content": "%SUMMARY%" >> "%TEMPFILE%"
echo           } >> "%TEMPFILE%"
echo         } >> "%TEMPFILE%"
echo       ] >> "%TEMPFILE%"
echo     } >> "%TEMPFILE%"

REM 添加作者
if not "%AUTHOR%"=="" (
    echo , >> "%TEMPFILE%"
    echo     "作者": { >> "%TEMPFILE%"
    echo       "rich_text": [ >> "%TEMPFILE%"
    echo         { >> "%TEMPFILE%"
    echo           "text": { >> "%TEMPFILE%"
    echo             "content": "%AUTHOR%" >> "%TEMPFILE%"
    echo           } >> "%TEMPFILE%"
    echo         } >> "%TEMPFILE%"
    echo       ] >> "%TEMPFILE%"
    echo     } >> "%TEMPFILE%"
)

REM 添加标签
if not "%TAGS%"=="" (
    echo , >> "%TEMPFILE%"
    echo     "标签": { >> "%TEMPFILE%"
    echo       "multi_select": [ >> "%TEMPFILE%"
    
    REM 分割标签
    set "TAG_LIST=%TAGS%"
    set "FIRST=1"
    :TAG_LOOP
    for /f "tokens=1* delims=," %%a in ("!TAG_LIST!") do (
        set "TAG=%%a"
        set "TAG_LIST=%%b"
        
        set "TAG=!TAG: =!"
        if not "!TAG!"=="" (
            if "!FIRST!"=="1" (
                echo         { "name": "!TAG!" } >> "%TEMPFILE%"
                set "FIRST=0"
            ) else (
                echo , >> "%TEMPFILE%"
                echo         { "name": "!TAG!" } >> "%TEMPFILE%"
            )
        )
        
        if not "!TAG_LIST!"=="" goto TAG_LOOP
    )
    
    echo       ] >> "%TEMPFILE%"
    echo     } >> "%TEMPFILE%"
)

echo   } >> "%TEMPFILE%"
echo } >> "%TEMPFILE%"

echo 发送请求到Notion API...

REM 使用curl发送请求
curl.exe -X POST "https://api.notion.com/v1/pages" ^
    -H "Authorization: Bearer ntn_u3940930740492DuwPRRfsWKq3vhLzVLY9B14K8S0iC1Wh" ^
    -H "Notion-Version: 2025-09-03" ^
    -H "Content-Type: application/json" ^
    -d "@%TEMPFILE%"

REM 清理临时文件
del "%TEMPFILE%" 2>nul

endlocal