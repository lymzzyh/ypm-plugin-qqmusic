import { cgi, clearSession, credentialFrom, epoch, fail, guid, session, verify } from './client.js';
import { t } from './i18n.js';
import { decodeQr } from './qr.js';
import { routingPath } from './routing.js';
import { decodePackets, encodeConnect, encodeSubscribe, encodePuback, encodePingreq } from './mqtt.js';

let attempt = 0;
let stopActive = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const binary = (text) => Uint8Array.from(atob(text), (x) => x.charCodeAt(0));
const encoded = (bytes) => btoa(String.fromCharCode(...bytes));

function helperPath() {
  const arch = { amd64: 'amd64', x64: 'amd64', x86_64: 'amd64', arm64: 'arm64' }[host.arch];
  if (!arch || !['darwin', 'windows', 'linux'].includes(host.platform)) fail('unsupported', '此平台暂不支持 QQ 音乐 App 扫码');
  return `bin/${host.platform}-${arch}/qqmusic-channel${host.platform === 'windows' ? '.exe' : ''}`;
}

async function prepareHelper() {
  if (host.platform === 'windows') return;
  // 宿主从 ZIP 安装时不保留可执行位；只修复本插件附带程序的权限。
  try {
    const process = host.spawn('/bin/chmod', ['u+x', `${host.dir}/${helperPath()}`]);
    if (await process.wait() !== 0) fail('setup', '无法启动 QQ 音乐扫码程序，请重新安装插件');
  } catch (_) { fail('setup', '请在插件菜单中开启“允许运行本机程序”，以连接 QQ 音乐 App 扫码通道'); }
}

async function createCode(check) {
  const result = await cgi('music.login.LoginServer', 'CreateQRCode', { tmeAppID: 'qqmusic' }, { platform: 'android', session: {} });
  check();
  if (!result.qrcodeID || !/^data:image\/png;base64,/.test(result.qrcode || '')) fail('failed', 'QQ音乐未返回登录二维码，请稍后重试');
  let qr;
  try { qr = decodeQr(binary(result.qrcode.split(',')[1])); }
  catch (_) { fail('failed', '无法识别 QQ 音乐二维码，请重新登录'); }
  const url = new URL(qr);
  if (url.protocol !== 'https:' || !['c6.y.qq.com', 'y.qq.com', 'c.y.qq.com'].includes(url.hostname)) fail('failed', 'QQ 音乐返回了非官方扫码地址');
  return { id: result.qrcodeID, qr };
}

// MQTT 连接通过随插件附带的固定主机通道程序传输；所有业务逻辑仍在插件内。
async function listen(code, check) {
  let process, heartbeat, timer, closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat); clearTimeout(timer);
    try { process?.kill(); } catch (_) {}
  };
  stopActive = stop;
  let redirects = 0, path = '/ws/handshake';
  timer = setTimeout(stop, 120000);
  try {
    while (!closed) {
      check();
      try { process = host.spawn(helperPath(), path === '/ws/handshake' ? [] : [path]); }
      catch (_) { fail('setup', '请在插件菜单中开启“允许运行本机程序”，以连接 QQ 音乐 App 扫码通道'); }
      let pending = new Uint8Array(0), redirect = null, subscribed = false;
      const send = (bytes) => process.write(JSON.stringify({ send: encoded(bytes) }) + '\n');
      for (;;) {
        const line = await process.readLine();
        check();
        if (closed) return { state: 'expired' };
        if (line === null) fail('failed', 'QQ 音乐扫码通道已断开，请重新登录', true);
        let event;
        try { event = JSON.parse(line); } catch (_) { fail('failed', 'QQ 音乐扫码通道返回异常'); }
        if (event.event === 'error' || event.event === 'closed') fail('failed', 'QQ 音乐扫码通道已断开，请重新登录', true);
        if (event.event === 'open') {
          send(encodeConnect({ clientId: `${Date.now()}${Math.floor(Math.random() * 9000 + 1000)}`, keepAliveSeconds: 45, authenticationMethod: 'pass', userProperties: { tmeAppID: 'qqmusic', business: 'management', hashTag: code.id, clientTag: 'management.user', userID: code.id } }));
          continue;
        }
        if (event.event !== 'message') continue;
        const bytes = binary(event.data);
        if (pending.length + bytes.length > 512 * 1024) fail('failed', 'QQ 音乐扫码通道返回异常');
        const merged = new Uint8Array(pending.length + bytes.length);
        merged.set(pending); merged.set(bytes, pending.length);
        const decoded = decodePackets(merged); pending = decoded.rest;
        for (const packet of decoded.packets) {
          if (packet.type === 'connack') {
            if (packet.reasonCode === 0) send(encodeSubscribe(1, `management.qrcode_login/${code.id}`, { authorization: 'tmelogin', pubsub: 'unicast' }));
            else if ([156, 157].includes(packet.reasonCode) && routingPath(packet.serverReference) && redirects++ < 3) {
              redirect = routingPath(packet.serverReference);
              break;
            } else fail('failed', 'QQ 音乐扫码通道拒绝连接');
          } else if (packet.type === 'suback') {
            if (packet.reasonCodes.some((x) => x >= 128)) fail('failed', 'QQ 音乐扫码通道拒绝连接');
            if (!subscribed) {
              subscribed = true;
              host.signInPrompt({ qr: code.qr, text: t('请用 QQ 音乐 App 扫码，并在手机上确认登录') });
              heartbeat = setInterval(() => { try { send(encodePingreq()); } catch (_) { stop(); } }, 20000);
            }
          } else if (packet.type === 'publish') {
            if (packet.qos === 1) send(encodePuback(packet.packetId));
            const type = packet.userProperties.type;
            if (type === 'scanned') host.signInPrompt({ qr: code.qr, text: t('已扫码，请在 QQ 音乐 App 确认登录') });
            if (type === 'timeout') return { state: 'expired' };
            if (type === 'canceled') fail('signIn', '已在 QQ 音乐 App 取消登录，请重新扫码');
            if (type === 'cookies') {
              let payload;
              try { payload = JSON.parse(new TextDecoder().decode(packet.payload)); } catch (_) { fail('failed', 'QQ 音乐扫码通道返回异常'); }
              const cookies = payload.cookies || {};
              const uin = cookies.qqmusic_uin?.value || cookies.uin?.value || payload.uin;
              const token = cookies.qqmusic_key?.value || cookies.qm_keyst?.value || payload.musickey;
              if (!uin || !token || !/^\d+$/.test(String(uin))) fail('signIn', 'QQ音乐未签发正式登录凭据，请重新扫码');
              // 推送 token 只能兑换一次，不能直接当作正式 musickey 使用。
              const data = await cgi('music.login.LoginServer', 'Login', { musicid: Number.isSafeInteger(Number(uin)) ? Number(uin) : String(uin), qrCodeID: code.id, token }, { platform: 'android', session: {}, comm: { tmeLoginType: 6 } });
              check();
              return { state: 'authorized', credential: credentialFrom(data) };
            }
          } else if (packet.type === 'disconnect') fail('failed', 'QQ 音乐扫码通道已断开，请重新登录', true);
        }
        if (redirect) { process.kill(); clearInterval(heartbeat); path = redirect; break; }
      }
    }
    return { state: 'expired' };
  } finally { stop(); if (stopActive === stop) stopActive = null; }
}

export async function signIn() {
  const current = ++attempt, generation = epoch();
  stopActive?.();
  const deadline = Date.now() + 8 * 60 * 1000;
  const check = () => {
    if (current !== attempt || generation !== epoch()) fail('signIn', '扫码登录已取消，请重新点击登录');
    if (Date.now() >= deadline) fail('signIn', '扫码登录超时，请重新点击登录');
  };
  try {
    await prepareHelper();
    check();
    for (let failures = 0; Date.now() < deadline;) {
      check();
      host.signInPrompt({ text: t('正在获取新的登录二维码…') });
      try {
        const code = await createCode(check);
        const result = await listen(code, check);
        check();
        if (result.state === 'authorized') return await verify(result.credential, check);
        host.signInPrompt({ text: t('二维码已过期，正在刷新…') });
        failures = 0;
      } catch (e) {
        check();
        if (!e.retryable || failures++ >= 2) throw e;
        host.signInPrompt({ text: t('网络暂时不稳定，正在重试…') });
        await sleep(1500 * failures);
      }
    }
    fail('signIn', '扫码登录超时，请重新点击登录');
  } finally { if (current === attempt) { stopActive?.(); host.signInPrompt(); } }
}

export async function account() {
  const credential = session(), generation = epoch();
  if (!credential.musickey) return null;
  const check = () => { if (generation !== epoch()) fail('signIn', '登录状态已变化，请重新扫码'); };
  try { return await verify(credential, check); }
  catch (e) {
    if (e.code !== 'signIn') throw e;
    // 续期只使用音乐 App 正式签发的字段，不保留或退回扫码临时 token。
    if (credential.refresh_token && credential.refresh_key) {
      try {
        const data = await cgi('music.login.LoginServer', 'Login', { ...credential, musicid: credential.uin, str_musicid: credential.uin, loginMode: 2 }, { platform: 'android', session: credential, comm: { tmeLoginType: credential.loginType || 6 } });
        check();
        return await verify(credentialFrom(data), check);
      } catch (error) { if (error.code !== 'signIn') throw error; }
    }
    if (generation === epoch()) clearSession();
    return null;
  }
}
export function signOut() { attempt++; stopActive?.(); clearSession(); }
