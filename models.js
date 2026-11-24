import { t } from './i18n.js';

export const list = (value) => Array.isArray(value) ? value : [];
export const clean = (value) => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const image = (value) => /^https?:\/\//.test(value || '') ? value.replace(/^http:/, 'https:') : '';
const cover = (type, mid) => mid ? `https://y.gtimg.cn/music/photo_new/${type}R500x500M000${encodeURIComponent(mid)}.jpg` : '';
export const songCache = new Map();

export function artist(value = {}) {
  const id = String(value.mid || value.singerMid || value.singerMID || value.singer_mid || value.SingerMid || value.id || value.singerID || '');
  return { id, name: clean(value.name || value.title || value.singerName || value.singer_name) || t('未知歌手'), imageUrl: image(value.singerPic || value.singer_pic || value.pic || value.picurl) || cover('T001', value.singer_pmid || value.pmid || id) };
}
export function album(value = {}) {
  const id = String(value.mid || value.albumMid || value.albumMId || value.album_mid || value.albummid || value.id || value.albumID || '');
  const singers = value.singers || value.singer_list || value.v_singer || value.singer;
  let released = value.publishDate || value.publish_date || value.time_public || value.release_time || value.pub_time || '';
  if (!released && Number(value.pubtime) > 0) released = new Date(Number(value.pubtime) * 1000).toISOString().slice(0, 10);
  return { id, name: clean(value.name || value.title || value.albumName || value.album_name) || t('未知专辑'), imageUrl: image(value.pic || value.picurl || value.pic_url) || cover('T002', value.pmid || id), artists: list(singers).map(artist), trackCount: value.totalNum ?? value.total_song_num ?? value.songnum ?? value.song_num ?? 0, released: String(released), kind: 'album' };
}
export function track(raw = {}) {
  const value = raw.songInfo || raw.song_info || raw.musicData || raw;
  const id = String(value.mid || value.songmid || value.songMid || value.id || value.songid || '');
  if (id) { songCache.delete(id); songCache.set(id, value); while (songCache.size > 512) songCache.delete(songCache.keys().next().value); }
  return {
    id, name: clean(value.title || value.name || value.songname) || t('未知歌曲'), artists: list(value.singer || value.singers).map(artist),
    album: album(value.album || { mid: value.albummid, name: value.albumname }), duration: Number(value.interval || value.duration || 0) * 1000,
    url: `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`, unavailable: !id || value.status === -1,
  };
}
export function playlist(value = {}, mine = false) {
  const id = String(value.tid || value.dissid || value.disstid || value.id || '');
  return {
    id, name: clean(value.title || value.dissname || value.name || value.diss_name) || t('未命名歌单'),
    imageUrl: image(value.picurl || value.logo || value.pic_url || value.bigpicUrl || value.imgurl),
    description: clean(value.desc || value.descinfo || value.description), owner: clean(value.nick || value.nickname || value.host_nick || value.creator?.name || value.creator?.nick),
    trackCount: Number(value.songnum || value.song_cnt || value.total_song_num || 0), plays: Number(value.play_cnt || value.visitnum || 0),
    // 首版不导出歌单编辑能力，避免把不完整的写接口暴露给用户。
    mine: false, saved: value.saved === true, fixed: Number(value.dirid) === 201,
  };
}
