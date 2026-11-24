import { hash33, sign } from './crypto.js';
import { t } from './i18n.js';

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';
export function fail(code, message, retryable = false) { throw Object.assign(new Error(t(message)), { code, retryable }); }
export function resourceId(value) {
  const s = String(value ?? '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(s)) fail('unavailable', '无效的 QQ 音乐资源编号');
  return s;
}
export function session() { return host.storage.get('session') || {}; }
export function epoch() { return host.storage.get('sessionEpoch') || 0; }
export function clearSession() {
  host.storage.set('sessionEpoch', epoch() + 1);
  for (const key of ['session', 'account', 'likedTracks']) host.storage.remove(key);
}
export function requireAccount() {
  const user = host.storage.get('account');
  if (!session().musickey || !user) fail('signIn', '请先登录QQ音乐');
  return user;
}
export function guid() {
  let value = host.storage.get('guid');
  if (!value) { value = host.crypto.md5(`${Date.now()}:${Math.random()}`); host.storage.set('guid', value); }
  return value;
}

export async function cgi(module, method, param = {}, options = {}) {
  const credential = options.session ?? session();
  const userId = credential.uin || '0';
  const numeric = Number(userId);
  const uin = Number.isSafeInteger(numeric) ? numeric : userId;
  const key = credential.musickey || '';
  const gTk = hash33(key, 5381);
  const comm = options.platform === 'android'
    ? { ct: 11, cv: 20090008, v: 20090008, chid: '10003505', tmeAppID: 'qqmusic', guid: guid(), ...(key ? { qq: userId, authst: key } : {}) }
    : options.platform === 'desktop' ? { ct: 19, cv: 2201, guid: guid(), uin }
    : { ct: 24, cv: 4747474, platform: 'yqq.json', uin, g_tk: gTk, g_tk_new_20200303: gTk, format: 'json', inCharset: 'utf-8', outCharset: 'utf-8', notice: 0, need_new_code: 1 };
  const text = JSON.stringify({ comm: { ...comm, ...(key ? { tmeLoginType: credential.loginType || 6 } : {}), ...options.comm }, req_0: { module, method, param } });
  const cookie = key ? `uin=${userId}; qqmusic_uin=${userId}; qm_keyst=${key}; qqmusic_key=${key}; guid=${guid()}; tmeLoginType=${credential.loginType || 6}` : '';
  let response;
  try {
    response = await fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${sign(text)}`, {
      method: 'POST', body: text,
      headers: { 'Content-Type': 'application/json;charset=utf-8', Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': options.platform === 'android' ? 'QQMusic 20090008(android 14)' : BROWSER_UA, ...(cookie ? { Cookie: cookie } : {}) },
      signal: AbortSignal.timeout(15000),
    });
  } catch (_) { fail('failed', '无法连接QQ音乐，请检查网络或稍后重试', true); }
  if (!response.ok) fail('failed', t('QQ音乐服务暂时不可用（HTTP {status}），请稍后重试', { status: response.status }), response.status === 429 || response.status >= 500);
  let json;
  try { json = await response.json(); } catch (_) { fail('failed', 'QQ音乐返回了无法识别的响应，请稍后重试', true); }
  const result = json.req_0;
  const code = Number(json.code || result?.code || result?.data?.code || 0);
  if (code !== 0 || !result || !Object.prototype.hasOwnProperty.call(result, 'data')) {
    if ([1000, 104400, 104401].includes(code)) fail('signIn', 'QQ音乐登录已失效，请重新登录');
    if ([20277, 20278, 20279, 20450, 104604].includes(code)) fail('signIn', 'QQ 音乐账号受限或设备数量已达上限，请在官方 App 检查后重试');
    fail('failed', t('QQ音乐请求失败（{code}）：{message}', { code, message: t('请稍后重试') }));
  }
  return result.data;
}

export function credentialFrom(data) {
  const source = { ...(data?.data || {}), ...data };
  const id = [source.str_musicid, source.musicid, source.uin].find((x) => typeof x === 'string' && /^\d+$/.test(x) && x !== '0')
    || [source.musicid, source.uin].find((x) => Number.isSafeInteger(x) && x > 0);
  if (!id || typeof source.musickey !== 'string' || !source.musickey) fail('signIn', 'QQ音乐未签发正式登录凭据，请重新扫码');
  const result = { uin: String(id), musickey: source.musickey, loginType: source.loginType ?? 6 };
  for (const key of ['refresh_token', 'refresh_key', 'openid', 'access_token', 'unionid', 'str_musicid', 'expired_at', 'encryptUin']) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

export async function verify(credential = session(), check = () => {}) {
  if (!credential.musickey) fail('signIn', '请先登录QQ音乐');
  const data = await cgi('music.UserInfo.userInfoServer', 'GetLoginUserInfo', {}, { session: credential, platform: 'android' });
  const info = data.info || data.userInfo || data.user;
  if (!info || !(info.nick || info.nickname || info.logo || info.uin)) fail('signIn', '无法确认QQ音乐账号，请重新登录');
  check();
  const user = { id: credential.uin, name: info.nick || info.nickname || t('QQ音乐用户'), imageUrl: info.logo || info.headurl || info.avatar || '' };
  const old = host.storage.get('account');
  if (old?.id !== user.id) host.storage.remove('likedTracks');
  host.storage.set('session', { ...credential, encryptUin: data.encryptUin || info.encryptUin || credential.encryptUin || '' });
  host.storage.set('account', user);
  return user;
}
