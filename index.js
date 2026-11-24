import { cgi, fail, guid, requireAccount, resourceId, session } from './client.js';
import { t } from './i18n.js';
import * as model from './models.js';
import { lyricText } from './lyrics.js';
// 显式导出，便于宿主安装前静态识别能力。
export { account, signIn, signOut } from './login.js';

const PAGE = 30;
const offsetOf = (value) => Math.max(0, Math.floor(Number(value) || 0));
const numeric = (value) => { const id = resourceId(value); if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) fail('unavailable', '无效的 QQ 音乐资源编号'); return Number(id); };
const encryptedUin = () => { requireAccount(); const id = session().encryptUin; if (!id) fail('signIn', '登录缺少音乐库授权信息，请重新使用 QQ 音乐 App 扫码'); return id; };

export async function search({ query = '', kind = 'tracks', offset = 0 }) {
  const types = { tracks: 0, artists: 1, albums: 2, playlists: 3 };
  if (!(kind in types)) fail('unsupported', '不支持这种搜索类型');
  if (!query.trim()) return { [kind]: [], more: false };
  const start = offsetOf(offset);
  const data = await cgi('music.search.SearchCgiService', 'DoSearchForQQMusicMobile', { query: query.trim(), search_type: types[kind], num_per_page: PAGE, page_num: Math.floor(start / PAGE) + 1, search_id: String(Date.now()) + '0', highlight: 0 }, { platform: 'desktop' });
  const body = data.body || data;
  const item = body[{ tracks: 'item_song', albums: 'item_album', artists: 'singer', playlists: 'item_songlist' }[kind]];
  const items = model.list(item?.items || item || body[{ tracks: 'song', albums: 'album', artists: 'singer', playlists: 'songlist' }[kind]]?.list);
  const map = { tracks: model.track, albums: model.album, artists: model.artist, playlists: model.playlist }[kind];
  const total = Number(data.meta?.sum ?? data.meta?.estimate_sum ?? items.length);
  return { [kind]: items.map((x) => map(x)), total, more: start + items.length < total && items.length > 0 };
}

async function allPages(fetch, field, totalField) {
  const result = [];
  for (let page = 0; page < 100; page++) {
    const data = await fetch(result.length);
    const rows = model.list(field(data));
    result.push(...rows);
    const total = Number(totalField(data));
    if (!rows.length || (Number.isFinite(total) && result.length >= total)) return result;
  }
  fail('unsupported', '该列表过大，暂不支持一次载入，请拆分后再打开');
}

export async function album({ id }) {
  id = resourceId(id);
  const detail = await cgi('music.musichallAlbum.AlbumInfoServer', 'GetAlbumDetail', /^\d+$/.test(id) ? { albumId: numeric(id) } : { albumMId: id });
  const meta = detail.basicInfo || detail.album || detail;
  const al = model.album({ ...meta, singers: detail.singer?.singerList || meta.singers });
  const songs = await allPages((begin) => cgi('music.musichallAlbum.AlbumSongList', 'GetAlbumSongList', { ...(/^\d+$/.test(id) ? { albumId: numeric(id) } : { albumMid: id }), begin, num: 100 }), (j) => j.songList || j.list, (j) => j.totalNum);
  al.trackCount = songs.length;
  return { album: al, tracks: songs.map((x) => ({ ...model.track(x), album: al })) };
}

export async function artist({ id }) {
  id = resourceId(id);
  const [detail, songs, albums] = await Promise.all([
    cgi('music.musichallSinger.SingerInfoInter', 'GetSingerDetail', { singer_mids: [id], group_singer: 1, wiki_singer: 1, ex_singer: 1, pic: 1, photos: 0 }),
    cgi('musichall.song_list_server', 'GetSingerSongList', { singerMid: id, order: 1, number: 50, begin: 0 }),
    cgi('music.musichallAlbum.AlbumListServer', 'GetAlbumList', { singerMid: id, order: 1, number: 100, begin: 0 }),
  ]);
  const singer = detail.singer_list?.[0]?.basic_info || detail.singerList?.[0]?.basicInfo || detail.singer_list?.[0] || detail;
  return { artist: model.artist({ ...singer, mid: id }), tracks: model.list(songs.songList || songs.songlist).map(model.track), albums: model.list(albums.albumList).map((x) => model.album(x.albumInfo || x)), related: [] };
}

export async function playlist({ id }) {
  const params = { disstid: numeric(id), dirid: 0, tag: 1, userinfo: 1, orderlist: 1 };
  let info;
  const rows = await allPages(async (begin) => {
    const data = await cgi('music.srfDissInfo.DissInfo', 'CgiGetDiss', { ...params, song_begin: begin, song_num: 300, onlysonglist: begin ? 1 : 0 });
    const page = data.cdlist?.[0] || data; info ||= page; return page;
  }, (j) => j.songlist, (j) => j.total_song_num ?? j.songnum);
  return { ...model.playlist({ ...info, ...info?.dirinfo, id }), tracks: rows.map(model.track), trackCount: rows.length };
}

export async function playlists() {
  const user = requireAccount();
  const created = await cgi('music.musicasset.PlaylistBaseRead', 'GetPlaylistByUin', { uin: user.id });
  const result = model.list(created.v_playlist).map((x) => model.playlist(x, true));
  if (session().encryptUin) {
    const saved = await allPages((offset) => cgi('music.musicasset.PlaylistFavRead', 'CgiGetPlaylistFavInfo', { uin: encryptedUin(), offset, size: 100 }), (j) => j.v_list, (j) => j.total);
    const ids = new Set(result.map((x) => x.id));
    for (const item of saved) { const p = model.playlist({ ...item, saved: true }); if (!ids.has(p.id)) { result.push(p); ids.add(p.id); } }
  }
  return result;
}

export async function liked({ offset = 0 }) {
  const data = await cgi('music.srfDissInfo.DissInfo', 'CgiGetDiss', { disstid: 0, dirid: 201, enc_host_uin: encryptedUin(), tag: 1, userinfo: 1, orderlist: 1, song_begin: offsetOf(offset), song_num: PAGE });
  const page = data.cdlist?.[0] || data;
  const tracks = model.list(page.songlist).map(model.track);
  return { tracks, more: tracks.length > 0 && offsetOf(offset) + tracks.length < Number(page.total_song_num || page.songnum || tracks.length) };
}

export async function savedAlbums({ offset = 0 }) {
  const data = await cgi('music.musicasset.AlbumFavRead', 'CgiGetAlbumFavInfo', { euin: encryptedUin(), offset: offsetOf(offset), size: PAGE });
  // 收藏专辑必须直接返回数组，兼容 YesPlayMusic 3.0 的音乐库读取路径。
  return model.list(data.v_list).map((x) => ({ ...model.album(x), saved: true }));
}

export async function home() {
  const data = await cgi('newsong.NewSongServer', 'get_new_song_info', { type: 5 });
  return { title: t('QQ音乐'), sections: [{ title: t('推荐新歌'), style: 'songs', tracks: model.list(data.song_list || data.songlist).slice(0, 36).map(model.track) }, { title: t('发现音乐'), links: [{ title: t('排行榜'), page: 'charts' }, { title: t('最新专辑'), page: 'new-albums' }] }] };
}

export async function browse({ page = '' }) {
  if (page === 'new-albums') {
    const data = await cgi('newalbum.NewAlbumServer', 'get_new_album_info', { area: 1, num: 50, start: 0 });
    return { title: t('最新专辑'), sections: [{ style: 'grid', albums: model.list(data.albums).map(model.album) }] };
  }
  if (page.startsWith('top:')) {
    const data = await cgi('music.musicToplist.Toplist', 'GetDetail', { topId: numeric(page.slice(4)), offset: 0, num: 100, withTags: true });
    return { title: data.info?.title || t('排行榜'), sections: [{ tracks: model.list(data.song || data.songInfoList).map(model.track) }] };
  }
  if (page && page !== 'charts') fail('unsupported', '不支持这个发现页面');
  const data = await cgi('music.musicToplist.Toplist', 'GetAll', {});
  return { title: t('排行榜'), sections: model.list(data.group).map((group) => ({ title: group.groupName, style: 'grid', links: model.list(group.toplist).map((item) => ({ title: item.title, subtitle: item.updateTime, imageUrl: item.frontPicUrl || item.headPicUrl, page: `top:${item.topId}` })) })) };
}

async function songDetail(id) {
  id = resourceId(id);
  const existing = model.songCache.get(id);
  if (existing?.file?.media_mid) return existing;
  const j = await cgi('music.pf_song_detail_svr', 'get_song_detail_yqq', /^\d+$/.test(id) ? { song_id: numeric(id) } : { song_mid: id });
  const song = j.track_info;
  if (!song) fail('unavailable', '歌曲暂不可用');
  model.track(song);
  return song;
}

export async function stream({ id, quality = 'high' }) {
  const choices = ['standard', 'high', 'lossless'];
  const setting = typeof host.setting === 'function' ? host.setting('quality') : '';
  // 插件选择可以高于宿主默认的 high，不采用“音质上限”的限制方式。
  quality = choices.includes(setting) ? setting : choices.includes(quality) ? quality : 'high';
  const song = await songDetail(id);
  const mid = resourceId(song.mid || id), media = song.file?.media_mid;
  const formats = quality === 'lossless' ? [['F000', '.flac', 'lossless', 0], ['M800', '.mp3', 'high', 320000], ['M500', '.mp3', 'standard', 128000]]
    : quality === 'standard' ? [['M500', '.mp3', 'standard', 128000]] : [['M800', '.mp3', 'high', 320000], ['M500', '.mp3', 'standard', 128000]];
  const names = formats.map(([prefix, ext]) => `${prefix}${media ? resourceId(media) : mid + mid}${ext}`);
  const data = await cgi('music.vkey.GetVkey', 'UrlGetVkey', { filename: names, guid: guid(), songmid: names.map(() => mid), songtype: names.map(() => song.type || 0), uin: session().uin || '0', loginflag: session().musickey ? 1 : 0, platform: '20', ctx: 0 });
  let unsupportedAddress = false;
  // 服务端返回顺序不保证音质排序，按请求的优先级选择完整音频。
  const ordered = names.flatMap((name) => model.list(data.midurlinfo).filter((item) => item.filename === name));
  for (const item of ordered) {
    const pos = names.indexOf(item.filename);
    if (pos < 0 || !item.purl || Number(item.result || 0) !== 0 || item.isTry || item.is_try || item.trial || /(?:^|\/)RS02|(?:^|[?&])(?:fromtag=preview|trial=1)/i.test(item.purl)) continue;
    unsupportedAddress = true;
    const bases = model.list(data.sip).filter((x) => /^https?:\/\//.test(x));
    if (!bases.length) bases.push('https://isure.stream.qqmusic.qq.com/');
    for (const base of bases) {
      let url;
      try { url = new URL(item.purl, base.replace(/^http:/, 'https:')); } catch (_) { continue; }
      // aqqmusic 是官方返回的独立 CDN 名称，并非 qqmusic.tc.qq.com 的子域名。
      const official = url.hostname === 'aqqmusic.tc.qq.com' || url.hostname.endsWith('.qqmusic.qq.com') || url.hostname.endsWith('.qqmusic.tc.qq.com');
      if (url.protocol !== 'https:' || !official || url.username || url.password || (url.port && url.port !== '443')) continue;
      if (url.pathname.split('/').pop() !== names[pos]) continue;
      return { url: url.href, type: formats[pos][1].slice(1), quality: formats[pos][2], bitRate: formats[pos][3] };
    }
  }
  if (unsupportedAddress) fail('failed', 'QQ音乐返回了暂不支持的音频地址，请更新插件或稍后重试');
  fail('unavailable', session().musickey ? '此歌曲需要会员、单独购买，或当前地区无版权；不会以试听片段代替完整歌曲' : '此歌曲需要登录或相应会员权限，请先扫码登录QQ音乐');
}

export async function lyrics({ id }) {
  id = resourceId(id);
  const data = await cgi('music.musichallSong.PlayLyricInfo', 'GetPlayLyricInfo', { ...(/^\d+$/.test(id) ? { songId: numeric(id) } : { songMid: id }), crypt: 1, lrc_t: 0, qrc: 0, qrc_t: 0, trans: 1, trans_t: 0, roma: 0, type: 1 });
  return { lrc: lyricText(data.lyric), translation: lyricText(data.trans) };
}
export function trackMenu() { return [{ id: 'open-qqmusic', title: t('在 QQ 音乐网页打开') }]; }
export function menuAction({ id, track }) {
  if (id !== 'open-qqmusic') fail('unsupported', '未知菜单操作');
  host.openURL(`https://y.qq.com/n/ryqq/songDetail/${resourceId(track.id)}`);
  return {};
}
