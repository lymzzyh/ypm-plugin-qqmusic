# Third-party notices

Original plugin code: Copyright (c) 2026 lymzzyh, MIT; see `LICENSE`.

| Component | Source | License / included notice |
| --- | --- | --- |
| MQTT packet codec (`mqtt.js`), QQ Music signing algorithm adaptation | [qqmusic-api-enhanced](https://github.com/Cosmosuperbaka/qqmusic-api-enhanced), Copyright (c) 2026 BakaGame | MIT, `THIRD_PARTY_MIT_LICENSE` |
| QR decoder (`vendor/jsqr.js`), jsQR 1.4.0 | [cozmo/jsQR](https://github.com/cozmo/jsQR), Copyright (c) 2017 Cozmo | Apache-2.0, `vendor/jsqr.LICENSE` |
| Compression (`vendor/fflate.js`), fflate 0.8.2 | [101arrowz/fflate](https://github.com/101arrowz/fflate), Copyright (c) 2023 Arjun Barrett | MIT, `vendor/fflate.LICENSE` |
| QQ lyric DES variant (`vendor/des.js`) | [lyswhut/lx-music-desktop](https://github.com/lyswhut/lx-music-desktop), via qqmusic-api-enhanced; copyright lyswhut and lx-music-desktop contributors | Apache-2.0, `vendor/des.LICENSE`; SPDX notice retained |
| WebSocket helper dependency, gorilla/websocket 1.5.3 | [gorilla/websocket](https://github.com/gorilla/websocket), Copyright (c) 2013 The Gorilla WebSocket Authors | BSD-2-Clause, `vendor/gorilla-websocket.LICENSE` |
| Go runtime and standard library embedded in helper binaries | [Go](https://go.dev/) | BSD-3-Clause, `vendor/go.LICENSE` |

The jsQR UMD global target was adapted to `globalThis` and an ES-module default export was appended for the plugin runtime. Other imported library notices remain in their source files. The MQTT codec is an ES-module copy of the upstream implementation. The lyric DES implementation is the upstream JavaScript port of the nonstandard QQ lyric cipher.

`icon.png` is a PNG conversion of the official [QQ Music favicon](https://y.qq.com/favicon.ico), used to identify the music source. QQ Music names and logos are trademarks/assets of their respective owners and are not covered by this project's MIT license.

`test/fixtures/music-qr.png` was generated using [qrcode-generator 1.4.4](https://github.com/kazuhikoarase/qrcode-generator) (MIT, Kazuhiko Arase). It encodes only a fixed, nonfunctional test URL and contains no live QR or account credentials. The generator is not bundled or required to run the plugin.
