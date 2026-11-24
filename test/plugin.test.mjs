import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { runtime, root } from './runtime.mjs';

const qr = 'data:image/png;base64,' + readFileSync(root + '/test/fixtures/music-qr.png').toString('base64');
const clone = (x) => JSON.parse(JSON.stringify(x));
function loginFixture(r, modes = ['authorized']) {
  let created = 0, killed = 0;
  const mqtt = r.module('mqtt.js');
  const msg = (b) => JSON.stringify({event:'message',data:Buffer.from(b).toString('base64')});
  const publish = (type, payload = {}) => msg(mqtt.encodePublish('management.qrcode_login/fixture',new TextEncoder().encode(JSON.stringify(payload)),{type},1));
  r.state.reply = ({method,param},comm) => {
    if(method === 'CreateQRCode') { assert.equal(param.tmeAppID,'qqmusic'); return {qrcodeID:'fixture-'+(++created),qrcode:qr}; }
    if(method === 'Login') { assert.equal(param.token,'temporary-token'); assert.equal(comm.tmeLoginType,6); return {musicid:42,musickey:'formal-key',encryptUin:'enc-42',refresh_key:'refresh-key',refresh_token:'refresh-token'}; }
    if(method === 'GetLoginUserInfo') return {code:0,info:{nick:'测试账号',logo:'https://y.qq.com/avatar.jpg'},encryptUin:'enc-42'};
    throw Error('未预期的接口 '+method);
  };
  r.state.spawn = (program,args) => {
    if(program==='/bin/chmod') {assert.deepEqual(clone(args),['u+x',root.replace(/\/$/,'')+'/bin/darwin-amd64/qqmusic-channel']);return {wait:async()=>0};}
    const mode=modes.shift()||'authorized';
    const lines=[JSON.stringify({event:'open'}),msg([0x20,3,0,0,0]),msg([0x90,4,0,1,0,0]),publish('scanned')];
    if(mode.startsWith('redirect:')) {
      const ref=new TextEncoder().encode(mode.slice(9));
      lines.splice(1,lines.length-1,msg([0x20,6+ref.length,0,157,3+ref.length,0x1c,0,ref.length,...ref]));
    }
    if(mode==='expired') lines.push(publish('timeout'));
    else if(mode==='authorized') lines.push(publish('cookies',{cookies:{qqmusic_uin:{value:'42'},qqmusic_key:{value:'temporary-token'}}}));
    else if(mode==='cancelled') lines.push(publish('canceled'));
    let release;
    return {write:()=>{},wait:async()=>0,readLine:async()=>lines.length?lines.shift():await new Promise(resolve=>{release=resolve;}),kill:()=>{killed++;release?.(null);}};
  };
  return {get created(){return created;},get killed(){return killed;}};
}

test('QQ 音乐 App 扫码：正式凭据兑换、账号确认、退出清理',async()=>{
 const r=await runtime(),f=loginFixture(r);
 const user=await r.plugin.signIn();
 assert.equal(user.id,'42');assert.equal(f.created,1);assert.ok(f.killed>0);
 assert.equal(r.store.get('session').musickey,'formal-key');
 assert.ok(!JSON.stringify([...r.store]).includes('temporary-token'));
 assert.ok(r.prompts.some(p=>p?.qr==='https://c6.y.qq.com/base/fcgi-bin/u?__=plugin-test'&&p.text.includes('QQ 音乐 App')));
 assert.ok(r.requests.every(q=>!q.req_0.module.includes('QQConnect')&&!q.req_0.method.includes('QQLogin')));
 r.plugin.signOut();assert.equal(await r.plugin.account(),null);assert.equal(r.store.has('session'),false);
});

test('二维码过期自动换新，再次登录也创建新码',async()=>{
 const r=await runtime(),f=loginFixture(r,['expired','authorized','authorized']);
 await r.plugin.signIn();assert.equal(f.created,2);
 assert.ok(r.prompts.some(p=>p?.text.includes('二维码已过期')));
 await r.plugin.signIn();assert.equal(f.created,3);
});

test('官方节点以 IP:端口重定向时保持二维码并重连，然后完成登录',async()=>{
 const r=await runtime(),f=loginFixture(r,['redirect:10.20.30.40:8080','authorized']);
 const user=await r.plugin.signIn();
 assert.equal(user.id,'42');assert.equal(f.created,1);assert.ok(f.killed>=2);
 assert.deepEqual(clone(r.processes.filter(x=>x[0]!=='/bin/chmod').map(x=>x[1])),[[],['/ws/handshake/10.20.30.40:8080']]);
});

test('路由拒绝任意网址、路径穿越、非法 IP 与端口，并限制重连次数',async()=>{
 const r=await runtime(),path=r.module('routing.js').routingPath;
 for(const ref of ['https://example.com','../admin','1.2.3.999:80','1.2.3.4:0','1.2.3.4:65536','1.2.3.4:80?x=1','01.2.3.4:80'])assert.equal(path(ref),null);
 assert.equal(path('node_1'),'/ws/handshake/node_1');
 loginFixture(r,Array(4).fill('redirect:10.20.30.40:8080'));
 await assert.rejects(r.plugin.signIn(),e=>e.code==='failed');
 assert.equal(r.processes.filter(x=>x[0]!=='/bin/chmod').length,4);
 assert.equal(r.store.has('session'),false);
});

test('重新打开登录会取消旧扫码，旧请求不能清空新提示或写入凭据',async()=>{
 const r=await runtime(),f=loginFixture(r,['pending','authorized']);
 let shown;const ready=new Promise(resolve=>{shown=resolve;});r.state.prompt=p=>{if(p?.qr)shown();};
 const first=r.plugin.signIn().then(()=>null,e=>e);await ready;
 const second=r.plugin.signIn();const old=await first;const user=await second;
 assert.equal(old.code,'signIn');assert.equal(user.id,'42');assert.equal(f.created,2);
 assert.equal(r.store.get('session').musickey,'formal-key');
});

test('本机程序权限未开启时明确提示，不创建无法使用的二维码',async()=>{
 const r=await runtime({spawn:()=>{throw Error('denied');}});
 await assert.rejects(r.plugin.signIn(),e=>e.code==='setup'&&e.message.includes('允许运行本机程序'));
 assert.equal(r.requests.length,0);
});

test('手机取消不会保存凭据；临时凭据不能替代正式凭据',async()=>{
 const r=await runtime();loginFixture(r,['cancelled']);
 await assert.rejects(r.plugin.signIn(),e=>e.code==='signIn');assert.equal(r.store.has('session'),false);
 assert.throws(()=>r.module('client.js').credentialFrom({uin:'42',token:'temp'}),e=>e.code==='signIn');
});

test('SHA-1 与 QQ 音乐签名兼容 Unicode',async()=>{
 const r=await runtime();const c=r.module('crypto.js');
 for(const value of ['', 'abc','QQ音乐🎵',JSON.stringify({query:'陈奕迅'})])assert.equal(c.sha1(value).toLowerCase(),createHash('sha1').update(value).digest('hex'));
 assert.match(c.sign('abc'),/^zzc[a-z0-9]+$/);
});

test('PNG 二维码解析和损坏图片边界',async()=>{
 const r=await runtime(),decode=r.module('qr.js').decodeQr;
 assert.equal(decode(new Uint8Array(readFileSync(root+'/test/fixtures/music-qr.png'))),'https://c6.y.qq.com/base/fcgi-bin/u?__=plugin-test');
 assert.throws(()=>decode(new Uint8Array(0)));assert.throws(()=>decode(new Uint8Array(50)));
});

test('MQTT 分帧保留未收完整的数据',async()=>{
 const r=await runtime(),m=r.module('mqtt.js');
 const p=m.encodePublish('test',new Uint8Array([1,2,3]),{type:'cookies'},1,7);
 assert.equal(m.decodePackets(p.slice(0,-1)).packets.length,0);
 const d=m.decodePackets(p);assert.equal(d.rest.length,0);assert.equal(d.packets[0].userProperties.type,'cookies');assert.equal(d.packets[0].packetId,7);
});

test('专辑详情与收藏专辑符合宿主结构，翻页空页返回数组',async()=>{
 const r=await runtime();r.store.set('session',{uin:'42',musickey:'key',encryptUin:'enc'});r.store.set('account',{id:'42'});
 r.state.reply=({method,param})=>method==='CgiGetAlbumFavInfo'?{v_list:param.offset?[]:[{album_mid:'al1',album_name:'专辑',singer_list:[{singerMID:'ar1',singerName:'歌手'}]}]}:method==='GetAlbumDetail'?{basicInfo:{albumMid:'al1',albumName:'专辑'}}:{songList:[{songInfo:{mid:'s1',title:'歌曲',interval:12}}],totalNum:1};
 assert.ok(Array.isArray(await r.plugin.savedAlbums({offset:0})));
 assert.equal((await r.plugin.savedAlbums({offset:30})).length,0);
 const album=await r.plugin.album({id:'al1'});assert.equal(album.album.trackCount,1);assert.equal(album.tracks[0].duration,12000);
 assert.equal(r.module('models.js').artist({singerMID:'ar1',singerName:'歌手'}).id,'ar1');
});

test('播放拒绝试听和外部地址，返回账号获准的完整文件',async()=>{
 const r=await runtime();
 r.module('models.js').track({mid:'song1',file:{media_mid:'media1'}});
 let purl='RS02media1.mp3?vkey=test';
 r.state.reply=()=>({sip:['https://isure.stream.qqmusic.qq.com/'],midurlinfo:[{filename:'M800media1.mp3',purl}]});
 await assert.rejects(r.plugin.stream({id:'song1'}),e=>e.code==='unavailable');
 purl='https://example.com/M800media1.mp3';await assert.rejects(r.plugin.stream({id:'song1'}));
 purl='M800media1.mp3?vkey=test';const stream=await r.plugin.stream({id:'song1'});assert.equal(stream.quality,'high');assert.equal(stream.type,'mp3');assert.ok(stream.url.includes('qqmusic.qq.com'));
});

test('歌词支持 LRC、Base64 和非法密文',async()=>{
 const r=await runtime(),l=r.module('lyrics.js').lyricText;
 assert.equal(l('[00:01.00]测试 &amp; 歌词'),'[00:01.00]测试 & 歌词');
 assert.equal(l(Buffer.from('[00:01.00]测试').toString('base64')),'[00:01.00]测试');assert.equal(l('0'.repeat(16)),'');
});

test('已购歌曲使用官方 aqqmusic CDN，不误判成无版权',async()=>{
 const r=await runtime();
 r.store.set('session',{uin:'42',musickey:'fixture-purchased-session',loginType:2});
 r.module('models.js').track({mid:'purchased1',file:{media_mid:'media2'}});
 r.state.reply=()=>({sip:['http://aqqmusic.tc.qq.com/','http://sjy6.stream.qqmusic.qq.com/'],midurlinfo:[{result:0,filename:'M800media2.mp3',purl:'M800media2.mp3?vkey=fixture'}]});
 const stream=await r.plugin.stream({id:'purchased1'});
 assert.equal(new URL(stream.url).hostname,'aqqmusic.tc.qq.com');assert.equal(new URL(stream.url).protocol,'https:');assert.equal(stream.quality,'high');
 assert.equal(r.requests.at(-1).req_0.param.uin,'42');
});

test('未知音频地址单独报错，合法后备 CDN 可用，伪造域名不会被放行',async()=>{
 const r=await runtime();r.module('models.js').track({mid:'s1',file:{media_mid:'m1'}});
 let sip=['https://aqqmusic.tc.qq.com.evil.example/'];
 r.state.reply=()=>({sip,midurlinfo:[{result:0,filename:'M800m1.mp3',purl:'M800m1.mp3?vkey=fixture'}]});
 await assert.rejects(r.plugin.stream({id:'s1'}),e=>e.code==='failed'&&e.message.includes('音频地址')&&!e.message.includes('版权'));
 sip.push('https://sjy6.stream.qqmusic.qq.com/');
 assert.equal(new URL((await r.plugin.stream({id:'s1'})).url).hostname,'sjy6.stream.qqmusic.qq.com');
});
