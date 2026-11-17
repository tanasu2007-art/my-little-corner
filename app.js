/* ✿ my little corner — app ✿
   Plain JavaScript, no build step. Sections:
   1. setup & helpers   2. storage (Supabase or demo)   3. pieces of UI
   4. pages             5. jot overlay                 6. sign in & start          */
(() => {
'use strict';

/* ───────────── 1. setup & helpers ───────────── */
const CFG = window.CORNER_CONFIG || {};
const configured = /^https:\/\//.test(CFG.SUPABASE_URL || '') && CFG.SUPABASE_ANON_KEY && !/YOUR_/.test(CFG.SUPABASE_ANON_KEY);
const sb = configured && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
let DEMO = !sb;
const NAME = (CFG.YOUR_NAME || '').trim();
const app = document.getElementById('app');
let user = null;
let HOSTED = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const todayKey = () => keyOf(new Date());
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const fmt = (d, o) => d.toLocaleDateString('en-US', o).toLowerCase();
const validDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k || '') && !isNaN(dateOf(k));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const scatter = id => { const h = hash(id); return `--rot:${((h % 80) / 10 - 4).toFixed(1)}deg;--dx:${((h >> 4) % 24) - 12}px;--mb:${32 + ((h >> 9) % 40)}px`; };
function when(ts) {
  const d = new Date(ts), k = keyOf(d), t = todayKey();
  if (k === t) return 'today · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (k === addDays(t, -1)) return 'yesterday';
  return fmt(d, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); }
function fail(err) { console.error(err); toast("hmm, that didn't save — check your connection and try again"); }

const COLORS = { cream: 'var(--cream)', pink: 'var(--pink)', sage: 'var(--sage)', butter: 'var(--butter)', lav: 'var(--lav)', peach: 'var(--peach)', red: 'var(--red)' };
const SWATCHES = ['cream', 'pink', 'sage', 'butter', 'lav', 'red'];

function burstPath() { let d = ''; const n = 16; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? 39 : 50, a = Math.PI * i / n; d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (50 + r * Math.sin(a)).toFixed(1); } return d + 'Z'; }
const BURST = burstPath();
const burst = (color, text, style = '') => `<div class="burst" style="${style}" aria-hidden="true"><svg viewBox="0 0 100 100"><path d="${BURST}" fill="${color}"/></svg><span>${text}</span></div>`;
const sparkle = (style, color = 'var(--cream)') => `<svg class="sparkle" style="${style}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z" fill="${color}"/></svg>`;

async function shrink(file, max, quality) {
  try {
    if (!window.createImageBitmap) return file;
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    return blob || file;
  } catch (e) { return file; }
}
const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

/* ───────────── 2. storage ─────────────
   Same functions either way: "remote" talks to your Supabase project,
   "local" keeps everything in this browser (demo mode).                */
const must = ({ data, error }) => { if (error) throw error; return data; };
const remote = {
  listThoughts: async () => must(await sb.from('thoughts').select('*').order('created_at', { ascending: false })),
  addThought: async t => must(await sb.from('thoughts').insert({ ...t, user_id: user.id }).select().single()),
  updateThought: async (id, p) => must(await sb.from('thoughts').update(p).eq('id', id)),
  deleteThought: async id => must(await sb.from('thoughts').delete().eq('id', id)),
  async listPhotos() {
    const rows = must(await sb.from('photos').select('*').order('created_at', { ascending: false }));
    if (!rows.length) return rows;
    const signed = must(await sb.storage.from('photos').createSignedUrls(rows.map(r => r.path), 60 * 60 * 12));
    return rows.map((r, i) => ({ ...r, url: signed[i] && signed[i].signedUrl }));
  },
  async addPhoto(file) {
    const small = await shrink(file, 2000, 0.86);
    const path = `${user.id}/${newId()}.jpg`;
    must(await sb.storage.from('photos').upload(path, small, { contentType: small.type || 'image/jpeg' }));
    const row = must(await sb.from('photos').insert({ path, caption: '', user_id: user.id }).select().single());
    const s = must(await sb.storage.from('photos').createSignedUrl(path, 60 * 60 * 12));
    return { ...row, url: s.signedUrl };
  },
  updatePhoto: async (id, p) => must(await sb.from('photos').update(p).eq('id', id)),
  async deletePhoto(p) { await sb.storage.from('photos').remove([p.path]); must(await sb.from('photos').delete().eq('id', p.id)); },
  listTodos: async day => must(await sb.from('todos').select('*').eq('day', day).order('position').order('created_at')),
  addTodo: async (day, text, position) => must(await sb.from('todos').insert({ day, text, position, user_id: user.id }).select().single()),
  updateTodo: async (id, p) => must(await sb.from('todos').update(p).eq('id', id)),
  deleteTodo: async id => must(await sb.from('todos').delete().eq('id', id)),
  listJournal: async () => must(await sb.from('journal').select('day,text,updated_at').neq('text', '').order('day', { ascending: false })),
  saveJournal: async (day, text) => must(await sb.from('journal').upsert({ user_id: user.id, day, text, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })),
};

const LS = 'my-little-corner-demo';
let L = null;
try { L = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(L)); } catch (e) { toast("this browser's demo storage is full — try smaller pictures"); } };
const nowISO = () => new Date().toISOString();
const local = {
  listThoughts: async () => [...L.thoughts].sort(byNewest),
  async addThought(t) { const r = { id: newId(), created_at: nowISO(), ...t }; L.thoughts.push(r); saveLocal(); return r; },
  async updateThought(id, p) { Object.assign(L.thoughts.find(x => x.id === id) || {}, p); saveLocal(); },
  async deleteThought(id) { L.thoughts = L.thoughts.filter(x => x.id !== id); saveLocal(); },
  listPhotos: async () => [...L.photos].sort(byNewest).map(p => ({ ...p, url: p.data })),
  async addPhoto(file) { const data = await toDataURL(await shrink(file, 1100, 0.8)); const r = { id: newId(), created_at: nowISO(), caption: '', data }; L.photos.push(r); saveLocal(); return { ...r, url: data }; },
  async updatePhoto(id, p) { Object.assign(L.photos.find(x => x.id === id) || {}, p); saveLocal(); },
  async deletePhoto(p) { L.photos = L.photos.filter(x => x.id !== p.id); saveLocal(); },
  listTodos: async day => L.todos.filter(t => t.day === day).sort((a, b) => a.position - b.position),
  async addTodo(day, text, position) { const r = { id: newId(), day, text, done: false, position }; L.todos.push(r); saveLocal(); return r; },
  async updateTodo(id, p) { Object.assign(L.todos.find(x => x.id === id) || {}, p); saveLocal(); },
  async deleteTodo(id) { L.todos = L.todos.filter(x => x.id !== id); saveLocal(); },
  listJournal: async () => L.journal.filter(j => j.text.trim()).sort((a, b) => b.day.localeCompare(a.day)),
  async saveJournal(day, text) { const j = L.journal.find(x => x.day === day); if (j) { j.text = text; j.updated_at = nowISO(); } else L.journal.push({ day, text, updated_at: nowISO() }); saveLocal(); },
};
const svgURL = s => 'data:image/svg+xml,' + encodeURIComponent(s);
function seedDemo() {
  const ago = (d, h = 0) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(t.getHours() - h); return t.toISOString(); };
  const flowers = svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#B1C2A9"/><path d="M150 190 C142 140 118 112 100 88 M152 190 C158 130 172 96 180 70 M154 190 C176 160 196 142 212 122" stroke="#1F1B33" stroke-width="3" fill="none"/><circle cx="100" cy="84" r="20" fill="#D79585"/><circle cx="100" cy="84" r="7" fill="#DECB91"/><circle cx="180" cy="64" r="22" fill="#FBF3E6"/><circle cx="180" cy="64" r="8" fill="#DECB91"/><circle cx="214" cy="118" r="17" fill="#EDD1D4"/><path d="M124 270 C98 260 100 212 126 198 L128 182 L174 182 L176 198 C202 212 204 260 178 270 Z" fill="#FBF3E6"/><path d="M110 230 C132 239 170 239 192 230" stroke="#6778CB" stroke-width="5" fill="none"/></svg>`);
  const windowPic = svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#CFCBE7"/><path d="M85 245 V125 A65 65 0 0 1 215 125 V245 Z" fill="#FBF3E6"/><circle cx="175" cy="150" r="30" fill="#DECB91"/><path d="M150 62 V245 M85 165 H215" stroke="#CFCBE7" stroke-width="6"/><path d="M85 245 V125 A65 65 0 0 1 215 125 V245 Z" fill="none" stroke="#1F1B33" stroke-width="3"/><rect x="60" y="243" width="180" height="10" rx="5" fill="#1F1B33"/><path d="M206 243 h32 l-5 -34 h-22 z" fill="#D79585"/></svg>`);
  const sunset = svgURL(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#E8C2B0"/><stop offset="1" stop-color="#DECB91"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="185" r="56" fill="#FBF3E6"/><rect y="195" width="300" height="105" fill="#6778CB"/><path d="M40 228 h70 M150 245 h90 M70 268 h80" stroke="#FBF3E6" stroke-width="4" stroke-linecap="round" opacity=".7"/></svg>`);
  const today = todayKey();
  L = {
    thoughts: [
      { id: newId(), text: "maybe the point isn't to be productive every day. some days you just water the plants.", color: 'butter', created_at: ago(0, 1) },
      { id: newId(), text: 'call grandma back & ask about the lemon cake ✿', color: 'cream', created_at: ago(1) },
      { id: newId(), text: "idea: a tiny zine about every café i've ever cried in (affectionately)", color: 'red', created_at: ago(3) },
      { id: newId(), text: 'that song from the bookstore is stuck in my head. find it!!', color: 'lav', created_at: ago(5) },
    ],
    photos: [
      { id: newId(), caption: 'sunday flowers', data: flowers, created_at: ago(0, 3) },
      { id: newId(), caption: 'morning light in the kitchen', data: windowPic, created_at: ago(2) },
      { id: newId(), caption: 'golden hour, 6:02', data: sunset, created_at: ago(4) },
    ],
    todos: [
      { id: newId(), day: today, text: 'water the monstera', done: true, position: 0 },
      { id: newId(), day: today, text: 'reply to that email', done: false, position: 1 },
      { id: newId(), day: today, text: '30 min walk, no phone', done: false, position: 2 },
    ],
    journal: [
      { day: addDays(today, -1), text: 'rainy. finished two chapters and ate soup standing up. honestly a perfect day?', updated_at: ago(1) },
    ],
  };
  saveLocal();
}
let db = DEMO ? local : remote;

/* Claude-hosted version: saves to your Claude account (works on every device you sign in on) */
function artifactStore(col, assets) {
  const docs = new Map();           // doc id -> data, everything loaded once
  const chains = {};                // one write at a time per doc
  const write = (id, fn) => (chains[id] = (chains[id] || Promise.resolve()).catch(() => {}).then(fn));
  const put = (id, data) => { docs.set(id, data); return write(id, () => col.doc(id).set(data)); };
  const del = id => { docs.delete(id); return write(id, () => col.doc(id).delete()); };
  const iso = ms => new Date(ms || Date.now()).toISOString();
  const todoDay = {};               // todo id -> day
  const items = day => {
    const d = docs.get('todo-' + day);
    const list = (d && Array.isArray(d.items) ? d.items : []).map((x, i) => ({ id: x.id || `${day}#${i}`, t: x.t || '', done: !!x.done }));
    list.forEach(x => todoDay[x.id] = day); return list;
  };
  const saveItems = (day, list) => { const prev = docs.get('todo-' + day); return put('todo-' + day, { kind: 'todo', date: day, items: list.map(x => ({ id: x.id, t: x.t, done: x.done })), created: (prev && prev.created) || Date.now() }); };
  const asTodo = (x, day, i) => ({ id: x.id, day, text: x.t, done: x.done, position: i });
  return {
    async load() {
      const snap = await Promise.race([col.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('your notes are taking too long to load — check your connection')), 10000))]);
      snap.docs.forEach(d => docs.set(d.id, { ...d.data() }));
    },
    listThoughts: async () => [...docs].filter(([, d]) => d.kind === 'thought').map(([id, d]) => ({ id, text: d.text || '', color: COLORS[d.color] ? d.color : 'cream', created_at: iso(d.created) })).sort(byNewest),
    async addThought(t) { const id = 't-' + newId(); const d = { kind: 'thought', text: t.text, color: t.color, created: Date.now() }; await put(id, d); return { id, ...t, created_at: iso(d.created) }; },
    async updateThought(id, p) { const d = docs.get(id); if (d) await put(id, { ...d, ...p }); },
    async deleteThought(id) { await del(id); },
    listPhotos: async () => [...docs].filter(([, d]) => d.kind === 'photo' && d.asset).map(([id, d]) => ({ id, asset: d.asset, caption: d.caption || '', url: '/_blob/' + d.asset, created_at: iso(d.created) })).sort(byNewest),
    async addPhoto(file) {
      if (!assets) throw new Error('picture uploads are only available to you, the owner');
      const blob = await shrink(file, 2000, 0.86);
      if (blob.size > 20e6) throw new Error('that picture is over 20 MB');
      const a = await assets.upload(blob);
      const id = 'p-' + newId(); const d = { kind: 'photo', asset: a.id, caption: '', created: Date.now() };
      await put(id, d); return { id, asset: a.id, caption: '', url: '/_blob/' + a.id, created_at: iso(d.created) };
    },
    async updatePhoto(id, p) { const d = docs.get(id); if (d) await put(id, { ...d, ...p }); },
    async deletePhoto(p) { const d = docs.get(p.id); await del(p.id); if (d && d.asset && assets) assets.delete(d.asset).catch(() => {}); },
    listTodos: async day => items(day).map((x, i) => asTodo(x, day, i)),
    async addTodo(day, text) { const list = items(day); const x = { id: newId(), t: text, done: false }; list.push(x); todoDay[x.id] = day; await saveItems(day, list); return asTodo(x, day, list.length - 1); },
    async updateTodo(id, p) { const day = todoDay[id]; if (!day) return; const list = items(day); const x = list.find(i => i.id === id); if (!x) return; if ('done' in p) x.done = p.done; if ('text' in p) x.t = p.text; await saveItems(day, list); },
    async deleteTodo(id) { const day = todoDay[id]; if (!day) return; await saveItems(day, items(day).filter(i => i.id !== id)); },
    listJournal: async () => [...docs].filter(([, d]) => d.kind === 'journal' && (d.text || '').trim()).map(([, d]) => ({ day: d.date, text: d.text, updated_at: iso(d.created) })).sort((a, b) => b.day.localeCompare(a.day)),
    async saveJournal(day, text) { await put('journal-' + day, { kind: 'journal', date: day, text, created: dateOf(day).getTime() }); },
  };
}

/* everything we've loaded, kept in one place */
const S = { loaded: false, thoughts: [], photos: [], journal: [], todos: {} };
async function loadAll() {
  const [t, p, j] = await Promise.all([db.listThoughts(), db.listPhotos(), db.listJournal()]);
  S.thoughts = t; S.photos = p; S.journal = j; S.todos = {}; S.loaded = true;
}
const journalText = day => (S.journal.find(j => j.day === day) || {}).text || '';
function setJournal(day, text) {
  S.journal = S.journal.filter(j => j.day !== day);
  if (text.trim()) { S.journal.push({ day, text, updated_at: nowISO() }); S.journal.sort((a, b) => b.day.localeCompare(a.day)); }
}

/* ───────────── 3. pieces of UI ───────────── */
function swatchesHTML(selected = 'cream') {
  return `<div class="swatches" role="radiogroup" aria-label="paper colour">${SWATCHES.map(c => `<button type="button" role="radio" aria-checked="${c === selected}" aria-label="${c}" data-color="${c}" class="${c === selected ? 'on' : ''}" style="background:${COLORS[c]}"></button>`).join('')}</div>`;
}
function bindSwatches(root, onPick) {
  root.querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    root.querySelectorAll('[data-color]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    onPick(b.dataset.color);
  });
}
async function keepThought(text, color) {
  text = text.trim(); if (!text) return false;
  try { const r = await db.addThought({ text, color }); S.thoughts.unshift(r); toast('kept ✿'); return true; }
  catch (e) { fail(e); return false; }
}

function thoughtCard(t) {
  const c = COLORS[t.color] ? t.color : 'cream';
  const tape = hash(t.id) % 5 === 1 ? '<span class="tape"></span>' : '';
  return `<article class="item note" style="${scatter(t.id)};--c:${COLORS[c]};--fg:${c === 'red' ? 'var(--cream)' : 'var(--ink)'}" data-kind="thought" data-id="${esc(t.id)}">${tape}
    <button class="del" data-del aria-label="delete this thought">×</button>
    <div class="txt" contenteditable="true" spellcheck="true" data-edit="text" aria-label="thought">${esc(t.text)}</div>
    <div class="meta">${esc(when(t.created_at))}</div></article>`;
}
function photoCard(p) {
  const shape = ['scallop', 'polaroid', 'arch', 'round'][hash(p.id) % 4];
  const bg = ['var(--sage)', 'var(--lav)', 'var(--peach)', 'var(--butter)'][hash(p.id + 'c') % 4];
  return `<figure class="item pic ${shape}" style="${scatter(p.id)}" data-kind="photo" data-id="${esc(p.id)}">
    <button class="del" data-del aria-label="delete this picture">×</button>
    <div class="frame" style="background:${bg}">${p.url ? `<img src="${esc(p.url)}" alt="${esc(p.caption || 'a favourite picture')}" loading="lazy">` : ''}</div>
    <figcaption class="cap" contenteditable="true" data-edit="caption" aria-label="caption">${esc(p.caption)}</figcaption></figure>`;
}
/* one handler for editing + deleting any card inside a container */
function bindCards(root) {
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del]'); if (!del) return;
    const card = del.closest('[data-id]'), id = card.dataset.id, kind = card.dataset.kind;
    if (!del.classList.contains('sure')) { del.classList.add('sure'); del.textContent = 'delete?'; setTimeout(() => { del.classList.remove('sure'); del.textContent = '×'; }, 3000); return; }
    try {
      if (kind === 'thought') { await db.deleteThought(id); S.thoughts = S.thoughts.filter(x => x.id !== id); }
      else { const p = S.photos.find(x => x.id === id); await db.deletePhoto(p); S.photos = S.photos.filter(x => x.id !== id); }
      refresh();
    } catch (err) { fail(err); }
  });
  root.addEventListener('keydown', e => {
    const ed = e.target.closest('[data-edit]'); if (!ed) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); ed.blur(); }
  });
  root.addEventListener('focusout', async e => {
    const ed = e.target.closest('[data-edit]'); if (!ed) return;
    const card = ed.closest('[data-id]'), id = card.dataset.id, field = ed.dataset.edit;
    const value = ed.innerText.replace(/\n+$/, '');
    const list = card.dataset.kind === 'thought' ? S.thoughts : S.photos;
    const item = list.find(x => x.id === id); if (!item || item[field] === value) return;
    if (field === 'text' && !value.trim()) { ed.textContent = item.text; return; }
    item[field] = value;
    try { card.dataset.kind === 'thought' ? await db.updateThought(id, { text: value }) : await db.updatePhoto(id, { caption: value }); }
    catch (err) { fail(err); }
  });
}
function ringSVG(done, total) {
  const r = 56, c = 2 * Math.PI * r, frac = total ? done / total : 0;
  return `<svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${r}" fill="none" stroke="rgba(251,243,230,.65)" stroke-width="14"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--cobalt)" stroke-width="14" stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="${frac ? 'round' : 'butt'}"/></svg>
    <b>${done}/${total}</b>`;
}
function todoBlock(title) {
  return `<div data-todo-root>
    <div class="list-head"><h2 class="title-caps">${title}</h2><div class="ring" data-ring aria-label="progress"></div></div>
    <div class="todo-card"><div data-todos></div>
      <label class="add-todo"><span></span><input data-add placeholder="add something, press enter" maxlength="300" aria-label="add a to-do"></label></div></div>`;
}
async function mountTodos(root, day) {
  const listEl = root.querySelector('[data-todos]'), ring = root.querySelector('[data-ring]'), input = root.querySelector('[data-add]');
  let items = S.todos[day];
  if (!items) { listEl.innerHTML = '<p class="saved" style="padding:16px 0">loading…</p>'; try { items = S.todos[day] = await db.listTodos(day); } catch (e) { fail(e); items = []; } }
  const draw = () => {
    listEl.innerHTML = items.map(t => `<div class="todo ${t.done ? 'done' : ''}" data-id="${esc(t.id)}">
      <button class="check" aria-label="${t.done ? 'mark not done' : 'mark done'}: ${esc(t.text)}"></button><span class="t">${esc(t.text)}</span>
      <button class="x" aria-label="remove ${esc(t.text)}">×</button></div>`).join('');
    ring.innerHTML = ringSVG(items.filter(i => i.done).length, items.length);
  };
  draw();
  listEl.onclick = async e => {
    const row = e.target.closest('.todo'); if (!row) return;
    const t = items.find(i => i.id === row.dataset.id); if (!t) return;
    try {
      if (e.target.closest('.check')) { t.done = !t.done; draw(); await db.updateTodo(t.id, { done: t.done }); }
      else if (e.target.closest('.x')) { items.splice(items.indexOf(t), 1); draw(); await db.deleteTodo(t.id); }
    } catch (err) { fail(err); }
  };
  input.onkeydown = async e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const v = input.value.trim(); if (!v) return; input.value = '';
    try { const r = await db.addTodo(day, v, items.length); items.push(r); draw(); } catch (err) { fail(err); input.value = v; }
  };
}
let pendingFlush = null;
function journalBlock(day) {
  const d = dateOf(day);
  return `<div class="journal-page" data-journal-root><span class="tape"></span>
    <div class="jp-top"><span class="tag">journal · ${fmt(d, { month: 'short', day: 'numeric' })}</span>
      <span class="daynav" style="font-size:14px;letter-spacing:.06em;opacity:.6"><a href="#/today/${addDays(day, -1)}">‹ yesterday</a>&nbsp;&nbsp;&nbsp;<a href="#/today/${addDays(day, 1)}">tomorrow ›</a></span></div>
    <p class="dear">dear diary,</p>
    <textarea aria-label="journal for ${fmt(d, { month: 'long', day: 'numeric' })}" placeholder="what happened today? what do you want to remember?"></textarea>
    <div class="saved" data-saved></div></div>`;
}
function mountJournal(root, day) {
  const ta = root.querySelector('textarea'), st = root.querySelector('[data-saved]');
  ta.value = journalText(day);
  let timer = null;
  const flush = async () => {
    if (!timer) return; clearTimeout(timer); timer = null;
    const text = ta.value; st.textContent = 'saving…';
    try { await db.saveJournal(day, text); setJournal(day, text); st.textContent = 'saved ✓'; }
    catch (e) { st.textContent = "couldn't save yet"; fail(e); }
  };
  ta.oninput = () => { st.textContent = '…'; clearTimeout(timer); timer = setTimeout(flush, 900); };
  ta.onblur = flush;
  pendingFlush = flush;
}

async function uploadPhotos(files) {
  files = [...files].filter(f => f.type.startsWith('image/')); if (!files.length) return;
  let ok = 0;
  for (const f of files) {
    toast(`pinning ${files.length > 1 ? `picture ${ok + 1} of ${files.length}` : 'your picture'}…`);
    try { const r = await db.addPhoto(f); S.photos.unshift(r); ok++; } catch (e) { console.error(e); toast(e && e.message ? e.message : "couldn't add that picture"); }
  }
  if (ok) { toast(ok > 1 ? `${ok} pictures pinned ✿` : 'picture pinned ✿'); refresh(); }
}

/* ───────────── 4. pages ───────────── */
function shell(inner, page) {
  const links = ['thoughts', 'pictures', 'today', 'journal'];
  const initial = (NAME || (user && user.email) || '✿').trim()[0].toUpperCase();
  return `${DEMO ? `<div class="demo-banner"><b>demo mode</b> — what you add is only saved in this browser. the guide shows how to connect real storage.</div>` : ''}
  <header class="nav"><a class="logo" href="#/">my little corner</a>
    <nav class="pills" aria-label="pages">${links.map(l => `<a href="#/${l}" class="${page === l ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <button class="btn ink" data-jot>+ jot a thought</button><a class="avatar" href="#/" aria-label="home">${esc(initial)}</a></header>
  <main id="main">${inner}</main>
  <footer class="foot">${burst('var(--butter)', 'hi, you')}
    <div class="foot-grid"><div><p class="big-italic">my little corner</p><p class="sub">a private, slightly messy place on the internet.</p></div>
      <div class="foot-cols"><div><h4>JUMP TO</h4>${links.map(l => `<a href="#/${l}">${l}</a>`).join('')}</div>
        <div><h4>LATELY</h4><div>${S.thoughts.length} thoughts</div><div>${S.photos.length} pictures</div><div>${S.journal.length} diary pages</div>${sb ? '<button data-signout>sign out</button>' : ''}</div></div></div>
    <div class="foot-bottom">© ${new Date().getFullYear()} · made with love</div></footer>
  <nav class="tabbar" aria-label="pages"><a href="#/thoughts" class="${page === 'thoughts' || page === 'home' ? 'on' : ''}">thoughts</a><a href="#/pictures" class="${page === 'pictures' ? 'on' : ''}">pictures</a>
    <button class="plus" data-jot aria-label="jot a thought">+</button><a href="#/today" class="${page === 'today' ? 'on' : ''}">today</a><a href="#/journal" class="${page === 'journal' ? 'on' : ''}">journal</a></nav>`;
}

const pages = {
  home: {
    html() {
      const h = new Date().getHours();
      const g = h < 5 ? 'STILL\nUP?' : h < 12 ? 'GOOD\nMORNING,' : h < 17 ? 'GOOD\nAFTERNOON,' : h < 22 ? 'GOOD\nEVENING,' : 'HELLO,\nNIGHT OWL';
      const now = new Date(), month = keyOf(now).slice(0, 7);
      const thisMonth = S.thoughts.filter(t => keyOf(new Date(t.created_at)).startsWith(month)).length;
      const mixed = [...S.thoughts.slice(0, 7).map(t => ({ ...t, kind: 't' })), ...S.photos.slice(0, 5).map(p => ({ ...p, kind: 'p' }))].sort(byNewest).slice(0, 10);
      return `
      <section class="hero"><div class="checker"></div>${sparkle('left:56%;top:12%')}${sparkle('right:9%;bottom:24%;width:32px;height:32px')}
        <div class="hero-grid"><div>
          <h1 class="greet ${/AFTERNOON|NIGHT/.test(g) ? 'long' : ''}">${g}</h1>
          <div class="datelabel">${fmt(now, { weekday: 'long' }).toUpperCase()} / ${fmt(now, { month: 'long', day: 'numeric' }).toUpperCase()}</div>
          <p>${NAME ? `hi ${esc(NAME)} — ` : ''}a soft place for loose thoughts, favourite pictures, today’s list and a little diary page.</p>
          <div class="seal"><b>${thisMonth}</b><small>THOUGHT${thisMonth === 1 ? '' : 'S'}<br>THIS MONTH</small></div></div>
          <form class="jotcard" id="quickjot">${burst('var(--butter)', 'jot it!')}
            <label class="sr" for="qj">new thought</label><textarea id="qj" placeholder="what’s floating around in your head?"></textarea>
            <div class="jot-foot">${swatchesHTML('cream')}<button class="btn red" type="submit">keep it →</button></div></form>
        </div></section>
      <div class="marquee" aria-hidden="true"><div>${'JOT IT DOWN  •  ANYTIME  •  ANYWHERE  •  THOUGHTS, PICTURES, LISTS & LITTLE DIARY PAGES  •  '.repeat(4)}</div></div>
      <section class="section scrap">${sparkle('right:8%;top:30%', 'var(--ink)')}${sparkle('left:4%;bottom:6%', 'var(--red)')}
        <div class="head-row"><div><h2 class="big-italic">loose thoughts</h2><p class="sub">& the pictures i keep coming back to</p></div>
          <div class="chips"><button class="btn ink" data-jot>+ jot a thought</button><button class="btn ink" data-pick>+ add pictures</button><a class="chip" href="#/thoughts">all thoughts</a><a class="chip" href="#/pictures">all pictures</a></div></div>
        <input type="file" id="file" accept="image/*" multiple class="sr" tabindex="-1">
        <div class="flow" id="flow">${mixed.map(x => x.kind === 't' ? thoughtCard(x) : photoCard(x)).join('') || '<p class="empty">a blank page. jot a thought or pin a picture ✿</p>'}</div>
        ${mixed.length ? '<a class="more" href="#/thoughts">see everything ↓</a>' : ''}</section>
      <section class="section today-sec"><div class="today-grid">${todoBlock('today’s<br>little list')}${journalBlock(todayKey())}</div></section>`;
    },
    mount() {
      const f = document.getElementById('quickjot'); let color = 'cream';
      bindSwatches(f, c => color = c);
      const ta = f.querySelector('textarea');
      f.onsubmit = async e => { e.preventDefault(); if (await keepThought(ta.value, color)) { ta.value = ''; refresh(); } };
      ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) f.requestSubmit(); };
      const input = document.getElementById('file');
      document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => input.click());
      input.onchange = () => { uploadPhotos(input.files); input.value = ''; };
      bindCards(document.getElementById('flow'));
      mountTodos(document.querySelector('[data-todo-root]'), todayKey());
      mountJournal(document.querySelector('[data-journal-root]'), todayKey());
    }
  },

  thoughts: {
    filter: 'all',
    html() {
      const months = [...new Set(S.thoughts.map(t => keyOf(new Date(t.created_at)).slice(0, 7)))];
      if (this.filter !== 'all' && !months.includes(this.filter)) this.filter = 'all';
      const list = this.filter === 'all' ? S.thoughts : S.thoughts.filter(t => keyOf(new Date(t.created_at)).startsWith(this.filter));
      const label = m => fmt(dateOf(m + '-01'), { month: 'long', year: m.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' });
      return `<section class="section thoughts-sec">
        <h1 class="big-italic">thoughts</h1><p class="sub">${S.thoughts.length} so far — newest first</p>
        <form class="jotbar" id="jotbar"><label class="sr" for="jb">new thought</label><textarea id="jb" rows="1" placeholder="what’s floating around in your head?"></textarea>
          ${swatchesHTML('cream')}<button class="btn red" type="submit">keep it →</button></form>
        ${months.length > 1 ? `<div class="chips" style="margin-top:34px" id="months"><button class="chip ${this.filter === 'all' ? 'on' : ''}" data-m="all">everything</button>${months.map(m => `<button class="chip ${this.filter === m ? 'on' : ''}" data-m="${m}">${label(m)}</button>`).join('')}</div>` : ''}
        <div class="flow" id="flow">${list.map(thoughtCard).join('') || '<p class="empty">no thoughts yet — they’ll land here.</p>'}</div></section>`;
    },
    mount() {
      const f = document.getElementById('jotbar'); let color = 'cream';
      bindSwatches(f, c => color = c);
      const ta = f.querySelector('textarea');
      f.onsubmit = async e => { e.preventDefault(); if (await keepThought(ta.value, color)) { ta.value = ''; refresh(); } };
      ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } };
      const m = document.getElementById('months');
      if (m) m.onclick = e => { const b = e.target.closest('[data-m]'); if (b) { this.filter = b.dataset.m; refresh(); } };
      bindCards(document.getElementById('flow'));
    }
  },

  pictures: {
    html() {
      return `<section class="section pics-sec">
        <div class="head-row"><div><h1 class="big-italic">pictures</h1><p class="sub">${S.photos.length} little moment${S.photos.length === 1 ? '' : 's'} i want to keep</p></div>
          <button class="btn ink" data-pick>+ add pictures</button></div>
        <div class="drop" id="drop" role="button" tabindex="0" data-pick>drop photos here, or tap to choose ✿</div>
        <input type="file" id="file" accept="image/*" multiple class="sr" tabindex="-1">
        <div class="flow" id="flow">${S.photos.map(photoCard).join('') || '<p class="empty">no pictures yet — add your favourites.</p>'}</div></section>`;
    },
    mount() {
      const input = document.getElementById('file'), drop = document.getElementById('drop');
      document.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => input.click(); b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } }; });
      input.onchange = () => { uploadPhotos(input.files); input.value = ''; };
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); uploadPhotos(e.dataTransfer.files); };
      bindCards(document.getElementById('flow'));
    }
  },

  today: {
    html(arg) {
      const day = validDay(arg) ? arg : todayKey(), d = dateOf(day), t = todayKey();
      const diff = Math.round((d - dateOf(t)) / 864e5);
      const rel = diff === 0 ? 'a fresh page — what’s on for today?' : diff === -1 ? 'looking back at yesterday' : diff === 1 ? 'planning ahead for tomorrow' : diff < 0 ? `${-diff} days ago` : `${diff} days from now`;
      return `<section class="section today-sec" style="padding-bottom:40px">
          <div class="head-row"><div><div class="daynav"><a class="arrow" href="#/today/${addDays(day, -1)}" aria-label="previous day">‹</a>
            <h1 class="dayname">${fmt(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
            <a class="arrow" href="#/today/${addDays(day, 1)}" aria-label="next day">›</a></div><p class="sub" style="margin-left:56px">${rel}</p></div>
          ${diff !== 0 ? '<a class="btn ghost" href="#/today">back to today</a>' : ''}</div>
          <div class="today-grid">${todoBlock('to do')}${journalBlock(day)}</div></section>`;
    },
    mount(arg) {
      const day = validDay(arg) ? arg : todayKey();
      mountTodos(document.querySelector('[data-todo-root]'), day);
      mountJournal(document.querySelector('[data-journal-root]'), day);
    }
  },

  journal: {
    html(arg) {
      const now = new Date();
      const month = /^\d{4}-\d{2}$/.test(arg || '') ? arg : keyOf(now).slice(0, 7);
      const first = dateOf(month + '-01'), y = first.getFullYear(), m = first.getMonth();
      const days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
      const written = new Set(S.journal.map(j => j.day)), t = todayKey();
      const prev = keyOf(new Date(y, m - 1, 1, 12)).slice(0, 7), next = keyOf(new Date(y, m + 1, 1, 12)).slice(0, 7);
      const tints = ['var(--pink)', 'var(--sage)', 'var(--lav)', 'var(--peach)'];
      let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="dow">${d}</span>`).join('') + '<span></span>'.repeat(lead);
      for (let d = 1; d <= days; d++) {
        const k = `${month}-${pad(d)}`;
        cells += `<a href="#/today/${k}" class="${written.has(k) ? 'has' : ''} ${k === t ? 'today' : ''} ${k > t ? 'future' : ''}" style="--c:${tints[d % 4]}" aria-label="${fmt(dateOf(k), { month: 'long', day: 'numeric' })}${written.has(k) ? ', written' : ''}">${d}</a>`;
      }
      const entries = S.journal.filter(j => j.day.startsWith(month));
      const year = String(now.getFullYear()), count = S.journal.filter(j => j.day.startsWith(year)).length;
      return `<section class="section journal-sec">
        <div class="head-row"><div><h1 class="big-italic">journal</h1><p class="sub">${count} page${count === 1 ? '' : 's'} this year — tap a day to read it</p></div>
          <a class="btn ink" href="#/today">+ write today’s page</a></div>
        <div class="arch-grid"><div class="cal"><div class="cal-head"><a href="#/journal/${prev}" aria-label="previous month" style="text-decoration:none;opacity:.5">‹</a>
          <span>${fmt(first, { month: 'long', year: 'numeric' })}</span><a href="#/journal/${next}" aria-label="next month" style="text-decoration:none;opacity:.5">›</a></div>
          <div class="cal-grid">${cells}</div><p class="saved" style="margin-top:18px">● a written page</p></div>
        <div class="entries"><p class="label" style="margin:0">today’s page — write here</p>${journalBlock(todayKey())}<p class="label" style="margin:14px 0 0">${fmt(first, { month: 'long' })} pages</p>${entries.map((j, i) => `<a class="entry" href="#/today/${j.day}" style="--rot:${[1, -1, 1.5, -.5][i % 4]}deg"><h3>${fmt(dateOf(j.day), { weekday: 'long', month: 'short', day: 'numeric' })}</h3><p>${esc(j.text)}</p></a>`).join('')
          || '<p class="empty">no pages this month yet.</p>'}</div></div></section>`;
    },
    mount() { mountJournal(document.querySelector('[data-journal-root]'), todayKey()); }
  }
};

let lastPage = null, rendering = false;
function route() { const h = location.hash.replace(/^#\/?/, ''); const [page, arg] = h.split('/'); return { page: pages[page] ? page : 'home', arg }; }
async function render(keep) {
  if (rendering) return; rendering = true;
  try {
    if (pendingFlush) { const f = pendingFlush; pendingFlush = null; await f(); }
    if (!DEMO && !user) { signIn(); return; }
    const r = route();
    if (!S.loaded) {
      app.innerHTML = `<div class="section"><p class="empty">opening your corner…</p></div>`;
      try { await loadAll(); }
      catch (e) { console.error(e); app.innerHTML = `<div class="section"><p class="empty">couldn’t open your corner: ${esc(e.message || e)}<br><small style="font-family:var(--sans);font-size:15px">if you just set things up, double-check setup.sql ran and config.js has the right keys.</small></p></div>`; return; }
    }
    const p = pages[r.page];
    app.innerHTML = shell(p.html(r.arg), r.page);
    p.mount && p.mount(r.arg);
    app.querySelectorAll('[data-jot]').forEach(b => b.onclick = openJot);
    const so = app.querySelector('[data-signout]'); if (so) so.onclick = () => sb.auth.signOut();
    const key = r.page + '/' + (r.arg || '');
    if (!keep && key !== lastPage) window.scrollTo(0, 0);
    lastPage = key;
    document.title = (r.page === 'home' ? '' : r.page + ' · ') + 'my little corner';
  } finally { rendering = false; }
}
async function refresh() { const y = window.scrollY; await render(true); window.scrollTo(0, y); }
window.addEventListener('hashchange', () => render());

/* ───────────── 5. jot overlay ───────────── */
function openJot() {
  if (document.querySelector('.veil')) return;
  const v = document.createElement('div'); v.className = 'veil';
  v.innerHTML = `<form class="jot-sheet" role="dialog" aria-modal="true" aria-label="new thought"><p class="label" style="margin:0 0 6px">new thought</p>
    <textarea placeholder="what’s floating around in your head?" aria-label="new thought"></textarea>
    <div class="jot-foot">${swatchesHTML('butter')}<div class="actions"><button type="button" class="btn plain" data-close>close</button><button class="btn red" type="submit">keep it →</button></div></div></form>`;
  document.body.appendChild(v);
  const f = v.querySelector('form'), ta = f.querySelector('textarea'); let color = 'butter';
  const close = () => { v.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bindSwatches(f, c => { color = c; f.style.background = COLORS[c]; f.style.color = c === 'red' ? 'var(--cream)' : ''; });
  v.onclick = e => { if (e.target === v) close(); };
  f.querySelector('[data-close]').onclick = close;
  f.onsubmit = async e => { e.preventDefault(); if (await keepThought(ta.value, color)) { close(); refresh(); } };
  ta.onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) f.requestSubmit(); };
  setTimeout(() => ta.focus(), 50);
}
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey || !S.loaded) return;
  if (e.key === 'n' || e.key === 't') { e.preventDefault(); openJot(); }
  if (e.key === 'd') { location.hash = '#/today'; }
});

/* ───────────── 6. sign in & start ───────────── */
function signIn() {
  app.innerHTML = `<section class="signin">${sparkle('left:44%;top:16%')}${sparkle('left:10%;bottom:12%;width:30px;height:30px')}
    <div><h1 class="greet">HELLO\nAGAIN.</h1><p class="sub" style="color:var(--cream);opacity:.9">your little corner is right where you left it.</p></div>
    <form class="card" id="signin">${burst('var(--butter)', 'hi, you', 'color:var(--ink)')}
      <div class="logo">my little corner</div><p class="dear" style="color:var(--red);margin-top:14px">sign in to open it</p>
      <label for="email">EMAIL</label><input id="email" type="email" required autocomplete="email" placeholder="you@example.com">
      <button class="btn red" type="submit">send me a magic link →</button>
      <small id="msg">no password needed — we’ll email you a link that signs you in.</small></form></section>`;
  const f = document.getElementById('signin'), msg = document.getElementById('msg');
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'sending…';
    const { error } = await sb.auth.signInWithOtp({ email: f.email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
    btn.disabled = false; btn.textContent = 'send me a magic link →';
    msg.textContent = error ? `couldn’t send it: ${error.message}` : 'check your inbox ✿ — tap the link on this device and you’re in.';
  };
}
async function start() {
  if (!sb && window.claude && window.claude.use) {
    app.innerHTML = `<div class="section"><p class="empty">opening your corner…</p></div>`;
    try {
      const [cdb, cuser, cassets] = await Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('assets')]);
      const id = cuser ? await cuser.id() : null;
      if (cdb && id) {
        const store = artifactStore(cdb.collection('data/users/' + id), cassets);
        await store.load();
        db = store; DEMO = false; user = { id }; HOSTED = true;
        render(); return;
      }
    } catch (e) { console.error(e); toast(String(e.message || e)); }
  }
  if (DEMO && (!L || !L.thoughts)) seedDemo();
  if (DEMO) { if (configured && !window.supabase) console.warn('Supabase script did not load — running in demo mode.'); render(); return; }
  const { data } = await sb.auth.getSession();
  user = data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((_event, session) => {
    const before = user && user.id; user = session ? session.user : null;
    if (before !== (user && user.id)) { S.loaded = false; if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', location.pathname); render(); }
  });
  if (/access_token|error_description/.test(location.hash) && user) history.replaceState(null, '', location.pathname);
  render();
}
start();
})();
