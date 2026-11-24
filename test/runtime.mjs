import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function runtime(options = {}) {
  const store = new Map(), prompts = [], requests = [], processes = [];
  const state = { language: 'zh-CN', reply: () => ({}), ...options };
  const context = vm.createContext({
    URL, URLSearchParams, AbortSignal, TextEncoder, TextDecoder, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval, console,
    host: {
      platform: 'darwin', arch: 'amd64', dir: root.replace(/\/$/, ''),
      setting: (key) => state.settings?.[key] ?? '',
      t: (key) => {
        try { return JSON.parse(readFileSync(path.join(root, 'locales', state.language + '.json')))[key] ?? key; }
        catch { return key; }
      },
      storage: { get: (key) => store.get(key), set: (key, value) => store.set(key, value), remove: (key) => store.delete(key) },
      crypto: { md5: (value) => createHash('md5').update(value).digest('hex') },
      signInPrompt: (value) => { prompts.push(value); state.prompt?.(value); },
      spawn: (...args) => { processes.push(args); return state.spawn(...args); },
      openURL: (value) => { state.opened = value; },
    },
    fetch: async (url, init) => {
      const request = JSON.parse(init.body); requests.push(request);
      if (state.live) return fetch(url, init);
      const data = await state.reply(request.req_0, request.comm);
      return { ok: true, status: 200, json: async () => ({ code: 0, req_0: { code: 0, data } }) };
    },
  });
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    if (path.relative(root, file).startsWith('..')) throw new Error('外部模块');
    const mod = new vm.SourceTextModule(readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, mod); return mod;
  }
  const main = load(path.join(root, 'index.js'));
  await main.link((specifier, ref) => load(path.resolve(path.dirname(ref.identifier), specifier)));
  await main.evaluate();
  return { state, store, prompts, requests, processes, plugin: main.namespace,
    module: (file) => modules.get(path.join(root, file)).namespace };
}
