package main

import "testing"

// 防止路由兼容扩大为任意主机或任意路径访问。
func TestRoutingBoundary(t *testing.T) {
	for _, path := range []string{"/ws/handshake", "/ws/handshake/node_1", "/ws/handshake/10.20.30.40:8080"} {
		if !validPath(path) {
			t.Errorf("拒绝了有效路由 %q", path)
		}
	}
	for _, path := range []string{"https://example.com", "/ws/handshake//example.com", "/ws/handshake/../admin", "/ws/handshake/1.2.3.4:0", "/ws/handshake/999.2.3.4:80", "/ws/handshake/1.2.3.4:65536", "/ws/handshake/1.2.3.4:80?host=example.com", "/admin"} {
		if validPath(path) {
			t.Errorf("接受了无效路由 %q", path)
		}
	}
}
