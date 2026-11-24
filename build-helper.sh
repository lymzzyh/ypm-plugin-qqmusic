#!/usr/bin/env bash
# 构建扫码通道程序。插件使用者无需安装 Go。
set -euo pipefail
cd "$(dirname "$0")/helper"
for target_os in darwin linux windows; do
  for target_arch in amd64 arm64; do
    output="../bin/$target_os-$target_arch/qqmusic-channel"
    if [ "$target_os" = windows ]; then output="$output.exe"; fi
    mkdir -p "$(dirname "$output")"
    CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" go build -trimpath -ldflags='-s -w' -o "$output" .
    if [ "$target_os" = darwin ] && command -v codesign >/dev/null; then codesign --force --sign - "$output"; fi
  done
done
