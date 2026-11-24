// QQ 音乐扫码推送通道：仅连接固定官方主机，不提供本地端口或通用代理能力。
package main

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

func validPath(path string) bool {
	if path == "/ws/handshake" {
		return true
	}
	const prefix = "/ws/handshake/"
	if !strings.HasPrefix(path, prefix) {
		return false
	}
	ref := strings.TrimPrefix(path, prefix)
	if regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`).MatchString(ref) {
		return true
	}
	if !regexp.MustCompile(`^([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{1,5}$`).MatchString(ref) {
		return false
	}
	address, port, err := net.SplitHostPort(ref)
	if err != nil || net.ParseIP(address) == nil {
		return false
	}
	n, err := strconv.Atoi(port)
	return err == nil && n > 0 && n <= 65535
}

func main() {
	path := "/ws/handshake"
	if len(os.Args) == 2 {
		path = os.Args[1]
	}
	if len(os.Args) > 2 || !validPath(path) {
		os.Exit(2)
	}
	var lock sync.Mutex
	emit := func(v any) { lock.Lock(); defer lock.Unlock(); _ = json.NewEncoder(os.Stdout).Encode(v) }
	dialer := websocket.Dialer{Proxy: http.ProxyFromEnvironment, HandshakeTimeout: 12 * time.Second, Subprotocols: []string{"mqtt"}, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}}
	conn, _, err := dialer.Dial("wss://mu.y.qq.com"+path, http.Header{"Origin": []string{"https://y.qq.com"}})
	if err != nil {
		emit(map[string]string{"event": "error", "code": "connect"})
		return
	}
	defer conn.Close()
	conn.SetReadLimit(512 * 1024)
	_ = conn.SetReadDeadline(time.Now().Add(6 * time.Minute))
	emit(map[string]string{"event": "open"})
	go func() {
		defer conn.Close()
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 4096), 1024*1024)
		for scanner.Scan() {
			var cmd struct {
				Send string `json:"send"`
			}
			if json.Unmarshal(scanner.Bytes(), &cmd) != nil {
				return
			}
			data, err := base64.StdEncoding.DecodeString(cmd.Send)
			if err != nil || len(data) > 512*1024 {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(12 * time.Second))
			if conn.WriteMessage(websocket.BinaryMessage, data) != nil {
				return
			}
		}
	}()
	for {
		kind, data, err := conn.ReadMessage()
		if err != nil {
			emit(map[string]string{"event": "closed"})
			return
		}
		if kind == websocket.BinaryMessage {
			emit(map[string]string{"event": "message", "data": base64.StdEncoding.EncodeToString(data)})
		}
	}
}
