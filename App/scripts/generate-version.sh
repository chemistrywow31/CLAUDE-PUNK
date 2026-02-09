#!/bin/bash

# 從 Git commit 時間生成版號
# 格式: YYYY.MM.DD.HHMM

# 取得最新 commit 的時間
COMMIT_DATE=$(git log -1 --format="%ci")

# 提取年月日時分
YEAR=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%Y")
MONTH=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%m")
DAY=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%d")
HOUR=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%H")
MINUTE=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%M")

# 組合版號
VERSION="${YEAR}.${MONTH}.${DAY}.${HOUR}${MINUTE}"

echo "$VERSION"
