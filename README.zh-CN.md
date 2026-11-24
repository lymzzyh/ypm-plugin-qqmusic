<p align="center"><img src="icon.png" width="72" alt="QQ音乐"></p>

<h1 align="center">QQ 音乐 · YesPlayMusic</h1>

<p align="center">简体中文 | <a href="README.md">English</a></p>

为 [YesPlayMusic 3.0](https://github.com/qier222/YesPlayMusic) 提供 QQ 音乐音乐源。使用手机上的 **QQ 音乐 App** 扫码登录，并在 QQ 音乐 App 内确认。

## 功能

- QQ 音乐 App 扫码登录、登录状态校验与正式凭据续期；没有手机 QQ、微信、密码或 Cookie 输入入口。
- 二维码过期自动刷新；再次点击登录会创建新二维码，旧登录请求无法覆盖新请求。
- 搜索歌曲、专辑、歌手和歌单；浏览新歌、新专辑和排行榜。
- 专辑、歌手、歌单详情，以及账号的歌单、喜欢的歌曲和收藏专辑。
- 标准、高品质与无损播放请求，按服务端授权返回可用音质；歌词和翻译歌词。
- 简体中文、繁体中文、英语、德语、西班牙语、法语、日语、韩语和俄语，自动跟随 YesPlayMusic 的界面语言。

歌单与收藏目前只读。播放取决于账号会员、购买、地区和版权权限，受限歌曲会显示原因，不用试听片段代替完整歌曲。

## 安装与登录

1. 使用 YesPlayMusic **3.0.0 或更新版本**。
2. 如果拿到的是 ZIP，先解压。
3. 打开「设置 → 插件 → 从本地文件夹安装…」，选择包含 `plugin.json` 的 `ypm-plugin-qqmusic` 文件夹。
4. 在插件菜单中开启 **「允许运行本机程序」**。
5. 切换到 QQ 音乐，点击登录，使用 **QQ 音乐 App 的扫一扫** 扫描二维码并确认。

插件已附带 macOS、Windows、Linux 的 x64 / ARM64 扫码通道程序，自动选择当前平台的版本。使用者无需安装 Node.js、Go 或单独部署服务。

### 为什么需要运行本机程序？

QQ 音乐 App 的扫码状态通过官方 MQTT WebSocket 通道推送，当前插件环境没有 WebSocket API。随附的 `qqmusic-channel` 只连接 `wss://mu.y.qq.com`，通过标准输入输出转发数据，不开放本地端口。二维码创建、状态处理、登录凭据兑换与保存均由插件完成。

macOS / Linux 安装时可能丢失程序的可执行权限；插件只对自身随附的程序执行 `/bin/chmod u+x`。没有开启运行权限时，插件会提示开启，不会切换到手机 QQ 登录。

### 常见问题

**二维码无法扫描？** 请使用 QQ 音乐 App，而非手机 QQ 或微信。过期后插件会自动更新；关闭弹窗后再次点击登录也会重新获取二维码。

**提示连接失败？** 检查本机程序开关，以及到 `u.y.qq.com` 和 `mu.y.qq.com` 的网络连接。账号限制、设备数量超限等问题需在 QQ 音乐官方 App 中处理。

**登录成功但音乐库要求重新扫码？** 服务端没有返回音乐库所需的授权信息时，插件会提示重新登录，避免把权限错误显示成空音乐库。

**会员歌曲无法播放？** 插件只能使用服务端对当前账号开放的音频，不能解锁会员或购买权限。

## 开发

代码依据 YesPlayMusic 的[插件接口](https://github.com/qier222/YesPlayMusic/blob/main/docs/plugins.md)编写，所有改动限制在插件目录。

```sh
# JavaScript 回归测试（Node.js 20+）
node --experimental-vm-modules --test test/*.test.mjs

# 检查通道程序（Go 1.23+）
cd helper
go vet ./...
go test ./...
cd ..

# 重新构建六个平台的通道程序
./build-helper.sh

# 打包，生成 dist/YesPlayMusic-qqmusic-0.1.0.zip
python3 package.py
```

测试二维码是无账号信息的固定夹具。自动测试覆盖凭据兑换、取消与重复登录、过期刷新、权限提示、数据结构、播放地址和九种语言；真实账号的扫码确认、音乐库与会员播放需要登录后验证。

## 许可与致谢

原创代码使用 [MIT License](LICENSE)。第三方代码、构建依赖及图标来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这是独立的社区插件，QQ 音乐名称和图标属于其权利人。
