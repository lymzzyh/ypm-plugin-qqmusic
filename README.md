<p align="center"><img src="icon.png" width="72" alt="QQ Music"></p>

<h1 align="center">QQ Music for YesPlayMusic</h1>

<p align="center"><a href="README.zh-CN.md">简体中文</a> | English</p>

A QQ Music source for [YesPlayMusic 3.0](https://github.com/qier222/YesPlayMusic). Scan and confirm sign-in using the **QQ Music mobile app**.

## Features

- QR sign-in with the QQ Music app, session validation, and renewal using issued refresh credentials. No QQ messenger, WeChat, password, or manual Cookie sign-in.
- Automatic QR renewal on expiry. Starting sign-in again creates a new code and cancels the previous attempt.
- Search tracks, albums, artists, and playlists; browse new tracks, new albums, and charts.
- Album, artist, and playlist pages; account playlists, liked tracks, and saved albums.
- Standard, high, and lossless playback requests, subject to server authorization; lyrics and translated lyrics.
- Nine interface languages following YesPlayMusic: English, Simplified Chinese, Traditional Chinese, German, Spanish, French, Japanese, Korean, and Russian.

Playlists and collections are currently read-only. Playback follows subscription, purchase, regional, and licensing permissions. Restricted tracks show an error instead of playing a preview as a full track.

## Install and sign in

1. Use YesPlayMusic **3.0.0 or later**.
2. Extract the plugin ZIP if applicable.
3. Open Settings → Plugins → Install from local folder, and select `ypm-plugin-qqmusic`, containing `plugin.json`.
4. Enable **Allow running native programs** in the plugin menu.
5. Select QQ Music and sign in. Use the scanner in the **QQ Music mobile app**, then confirm on your phone.

The plugin includes native QR channel helpers for macOS, Windows, and Linux, in x64 and ARM64 variants. It automatically selects the matching helper. Users do not need Node.js, Go, or a separately deployed server.

### Why is a native helper needed?

The QQ Music app sends QR sign-in events over its MQTT WebSocket channel. The current plugin environment has no WebSocket API. The bundled `qqmusic-channel` connects only to `wss://mu.y.qq.com` and forwards bytes through standard input/output, without opening local ports. QR creation, event handling, credential exchange, and storage remain in the plugin.

On macOS and Linux, installation may drop the executable permission. The plugin uses `/bin/chmod u+x` only on its own bundled helper. Without permission to run programs, it asks you to enable it; it never falls back to QQ messenger sign-in.

## Troubleshooting

- **Unable to scan:** use QQ Music, rather than QQ messenger or WeChat. Expired codes refresh automatically; reopening sign-in also creates a new code.
- **Connection failed:** check the native-program permission and connectivity to `u.y.qq.com` and `mu.y.qq.com`. Resolve account restrictions or device limits in the official QQ Music app.
- **Library authorization missing:** sign in again when prompted. The plugin reports missing authorization instead of presenting an empty library.
- **Subscription tracks unavailable:** the plugin can only play audio authorized for your account. It cannot unlock subscription or purchased content.

## Development

Implements the YesPlayMusic [plugin interface](https://github.com/qier222/YesPlayMusic/blob/main/docs/plugins.md). All changes are contained in this plugin.

```sh
# JavaScript regression tests (Node.js 20+)
node --experimental-vm-modules --test test/*.test.mjs

# Check the channel helper (Go 1.23+)
cd helper
go vet ./...
go test ./...
cd ..

# Rebuild all six native helpers
./build-helper.sh

# Create dist/YesPlayMusic-qqmusic-0.1.0.zip
python3 package.py
```

The QR test fixture contains no account information. Automated tests cover credential exchange, cancellation and repeated sign-in, expiry, permission errors, response shapes, playback URLs, and all nine languages. Account confirmation, personal libraries, and subscription playback require validation with a signed-in account.

## License and acknowledgements

Original code is licensed under [MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party code, build dependencies, and icon attribution. This is an independent community plugin. The QQ Music name and icon belong to their respective owners.
