import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { runtime, root } from './runtime.mjs';

const manifest=JSON.parse(readFileSync(root+'/plugin.json'));
const keys=new Set([manifest.name,manifest.description,...manifest.navigation.map(n=>n.title).filter(Boolean)]);
for(const file of ['index.js','client.js','login.js','models.js']) {
 for(const m of readFileSync(root+'/'+file,'utf8').matchAll(/'([^'\n]*[\u3400-\u9fff][^'\n]*)'/g))keys.add(m[1]);
}
const locales=readdirSync(root+'/locales').map(x=>x.replace(/\.json$/,''));
test('九种语言完整覆盖文案与占位符',()=>{
 assert.deepEqual(locales.sort(),['de','en','es','fr','ja','ko','ru','zh-CN','zh-TW']);
 const slots=s=>[...s.matchAll(/\{\w+\}/g)].map(x=>x[0]).sort();
 for(const locale of locales) {
  const d=JSON.parse(readFileSync(root+'/locales/'+locale+'.json'));
  assert.deepEqual(Object.keys(d).sort(),[...keys].sort(),locale);
  for(const key of keys) {assert.ok(d[key].length>0,locale+':'+key);assert.deepEqual(slots(d[key]),slots(key));if(locale==='zh-CN')assert.equal(d[key],key);}
 }
});
for(const language of locales)test(language+'：提示和错误跟随当前语言，音乐元数据保留原文',async()=>{
 const r=await runtime({language,spawn:()=>{throw Error('denied');}});
 const d=JSON.parse(readFileSync(root+'/locales/'+language+'.json'));
 assert.equal(r.module('models.js').track({mid:'s1',title:'原始歌名'}).name,'原始歌名');
 assert.equal(r.module('models.js').album({mid:'al1'}).name,d['未知专辑']);
 await assert.rejects(r.plugin.signIn(),e=>e.message===d['请在插件菜单中开启“允许运行本机程序”，以连接 QQ 音乐 App 扫码通道']);
 r.state.reply=()=>({code:12345});
 await assert.rejects(r.plugin.search({query:'test'}),e=>e.message.includes('12345')&&!e.message.includes('{code}'));
});
