// 节点引用只作为固定官方主机下的路径，不接受 URL、查询串或任意路径。
export function routingPath(reference) {
  if (typeof reference !== 'string') return null;
  if (/^[A-Za-z0-9_-]{1,256}$/.test(reference)) return '/ws/handshake/' + reference;
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(reference);
  if (!match || match[1].split('.').some((n) => Number(n) > 255 || (n.length > 1 && n[0] === '0')) || Number(match[2]) < 1 || Number(match[2]) > 65535) return null;
  return '/ws/handshake/' + reference;
}
