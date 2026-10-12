import { createApp, markRaw } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const PURIFY = { ADD_TAGS: ['navcard'] }
const md2html = md => DOMPurify.sanitize(marked.parse(md), PURIFY)
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const lf = s => s.replace(/\r\n?/g, '\n')

// ---------- IndexedDB ----------
const db = new Promise((ok, no) => {
  const r = indexedDB.open('nav', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('kv')
  r.onsuccess = () => ok(r.result)
  r.onerror = () => no(r.error)
})
const idb = (mode, fn) => db.then(d => new Promise((ok, no) => {
  const t = d.transaction('kv', mode), r = fn(t.objectStore('kv'))
  t.oncomplete = () => ok(r.result)
  t.onerror = () => no(t.error)
}))
const loadPages = () => idb('readonly', s => s.get('pages'))
const savePages = pages => idb('readwrite', s => s.put(pages.map(p => ({ name: p.name, content: p.content })), 'pages'))

// ---------- 图标 ----------
// mdi:xxx / simple-icons:xxx → iconify；原生 emoji 直接显示；其余视为图片 URL；空 → 网站 favicon
function iconHTML({ icon, url, name }) {
  icon = (icon || '').trim()
  if (/^[\w-]+:[\w-]+$/.test(icon)) return `<iconify-icon icon="${esc(icon)}" width="1em" height="1em"></iconify-icon>`
  if (/^\p{Extended_Pictographic}/u.test(icon)) return `<b class="emoji">${esc(icon)}</b>`
  let src = icon
  if (!src) try { src = `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico` } catch {}
  return src ? `<img src="${esc(src)}" alt="" data-letter="${esc((name || '?')[0])}" loading="lazy">`
             : `<b class="letter">${esc((name || '?')[0])}</b>`
}
// 图标集全部名称（Iconify collection API），内存缓存
const PAGE = 160
// 标签名：第一个 # 标题，没有就取第一句话
const titleOf = md => {
  const line = md.match(/^#{1,6}\s+(.+)/m)?.[1] ?? md.split('\n').find(l => l.trim() && !/^\s*</.test(l)) ?? ''
  return line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^[\s>*+-]+|[*_`#]/g, '')
    .split(/[。！？!?]|\.(?:\s|$)/)[0].trim().slice(0, 20)
}
const collections = {}
const loadCollection = prefix => collections[prefix] ||= fetch(`https://api.iconify.design/collection?prefix=${prefix}`)
  .then(r => r.json())
  .then(({ categories = {}, uncategorized = [] }) => ({
    cats: categories,
    all: [...new Set([...Object.values(categories).flat(), ...uncategorized])].sort(),
  }))

// 图片加载失败 → 首字母
addEventListener('error', e => {
  const img = e.target
  if (img.tagName === 'IMG' && img.dataset.letter) img.outerHTML = `<b class="letter">${esc(img.dataset.letter)}</b>`
}, true)

// ---------- navCard：DOM → 数据 → md ----------
function readItem(li) {
  const a = li.querySelector('a'), text = li.textContent.trim()
  const icon = (text.match(/\{\s*([^{}]*?)\s*\}$/) || [])[1] || ''
  return { name: (a ? a.textContent : text.replace(/\{[^{}]*\}$/, '')).trim(), url: a?.getAttribute('href') || '', icon }
}

function cardHTML(c, n) {
  const items = c.items.map((it, i) => `<a class="item" href="${esc(it.url)}" target="_blank" rel="noopener" data-i="${i}">
    ${iconHTML(it)}<span class="name">${esc(it.name)}</span><span class="del" data-act="del">✕</span></a>`).join('')
  return `<section class="card">
    <h3>${esc(c.title)}<span class="tools"><span data-act="title">✎</span><span data-act="delcard">✕</span></span></h3>
    <div class="grid" data-card="${n}">${items}<a class="item add" data-act="add">＋</a></div></section>`
}

function cardMD({ title, items }) {
  const line = it => {
    const url = /[\s()]/.test(it.url) ? `<${it.url}>` : it.url
    return `- [${it.name.replace(/([[\]])/g, '\\$1')}](${url})${it.icon ? ` {${it.icon}}` : ''}`
  }
  return `<navCard${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}>\n\n${items.map(line).join('\n')}\n\n</navCard>`
}

// 用 marked 的 token 定位第 n 个 <navCard> … </navCard> 在原文中的 [start, end)
function navBlocks(md) {
  const out = []
  let pos = 0, open = -1
  for (const t of marked.lexer(md)) {
    const at = md.indexOf(t.raw, pos)
    if (at < 0) continue
    pos = at + t.raw.length
    if (open < 0 && t.type === 'html' && /^\s*<navcard[\s>]/i.test(t.raw)) open = at
    const close = open >= 0 && /<\/navcard\s*>/i.exec(t.raw)
    if (close) { out.push([open, at + close.index + close[0].length]); open = -1 }
  }
  return out
}

let cards = [] // 当前页解析出的卡片 [{title, items}]

// 首次打开的默认标签：[名称, 文件]
const defaults = [['导航', 'default.md'], ['备忘录', 'memo.md'], ['关于', 'README.md']]
const saved = await loadPages()
const pages = saved?.length ? saved : await Promise.all(defaults.map(async ([name, file]) => ({
  name,
  content: lf(await fetch(file, { cache: 'no-cache' }).then(r => r.ok ? r.text() : '', () => '') || `# ${name}\n`),
})))

// 网址 #页面名 指定打开哪一页，方便分享
const hashPage = () => pages.findIndex(p => p.name === decodeURIComponent(location.hash.slice(1)))

const app = createApp({
  template: '#tpl',
  data: () => ({
    pages,
    cur: hashPage() >= 0 ? hashPage() : Math.min(+localStorage.getItem('cur') || 0, pages.length - 1),
    editing: false,
    source: false,
    fresh: false, // 刚新建的标签，保存源码时按内容取名
    draft: '',
    dlg: null, // {n, i, name, url, icon}
    // 图标集：[名称, 代表图标, 官网, GitHub, 许可]
    sets: {
      logos: ['SVG Logos', 'logos:svg', 'https://svgporn.com', 'https://github.com/gilbarbara/logos', 'CC0'],
      'fluent-emoji-flat': ['Fluent Emoji', 'fluent-emoji-flat:grinning-face', '', 'https://github.com/microsoft/fluentui-emoji', 'MIT'],
      'fluent-color': ['Fluent Color', 'fluent-color:apps-24', 'https://fluent2.microsoft.design/iconography', 'https://github.com/microsoft/fluentui-system-icons', 'MIT'],
      'simple-icons': ['Simple Icons', 'simple-icons:simpleicons', 'https://simpleicons.org', 'https://github.com/simple-icons/simple-icons', 'CC0 1.0'],
      mdi: ['Material Design Icons', 'mdi:material-design', 'https://pictogrammers.com/library/mdi', 'https://github.com/Templarian/MaterialDesign', 'Apache 2.0'],
    },
    prefix: 'logos',
    q: '',
    cat: '',
    limit: PAGE,
    coll: null, // 当前图标集 {cats: {分类: [名称]}, all: [名称]}
    asking: null, // 页内输入/确认框 {text, value, done}
  }),
  computed: {
    page() { return this.pages[this.cur] },
    results() {
      if (!this.coll) return []
      const q = this.q.trim().toLowerCase().replace(/\s+/g, '-')
      return (this.cat ? this.coll.cats[this.cat] : this.coll.all).filter(n => n.includes(q))
    },
  },
  watch: {
    cur(v) { localStorage.setItem('cur', v) },
    'page.name': { immediate: true, handler(n) { if (n) history.replaceState(null, '', '#' + encodeURIComponent(n)) } },
    pages: { deep: true, handler: savePages },
    editing(v) { this.tabSort?.option('disabled', !v) },
    q() { this.limit = PAGE },
    cat() { this.limit = PAGE },
  },
  mounted() {
    this.render()
    this.$watch(() => [this.cur, this.page?.content, this.editing, this.pages.map(p => p.name).join()], () => this.render(), { flush: 'post' })
    addEventListener('hashchange', () => { const i = hashPage(); if (i >= 0) this.cur = i })
    addEventListener('keydown', e => { if (e.key === 'Escape') { this.dlg = null; this.answer(null) } })
  },
  methods: {
    iconHTML,

    async render() {
      const box = this.$refs.page
      if (!box || !this.page) return
      box.innerHTML = md2html(this.page.content)
      cards = [...box.querySelectorAll('navcard')].map((el, n) => {
        // <navCard> 内没有空行时里面不会被当作 markdown，补一次解析
        if (!el.querySelector('li') && el.textContent.trim()) el.innerHTML = md2html(el.textContent)
        const c = { title: el.getAttribute('title') || '', items: [...el.querySelectorAll('li')].map(readItem) }
        el.outerHTML = cardHTML(c, n)
        return c
      })
      if (!this.editing) {
        localStorage.setItem('snap', document.getElementById('app').innerHTML)
        return
      }
      // 「新导航卡片」按钮放在最后一张卡片后面，没有卡片就放页尾
      const btn = '<button class="ghost addcard" data-act="addcard">＋ 新导航卡片</button>'
      const last = [...box.querySelectorAll('.card')].pop()
      last ? last.insertAdjacentHTML('afterend', btn) : box.insertAdjacentHTML('beforeend', btn)
      const { default: Sortable } = await import('sortablejs')
      this.tabSort ||= Sortable.create(this.$refs.tabs, { animation: 150, onEnd: this.moveTab })
      for (const g of box.querySelectorAll('.grid')) Sortable.create(g, {
        group: 'nav', animation: 150, draggable: '.item:not(.add)', onEnd: this.moveItem,
      })
    },

    // 修改第 n 个卡片并写回 md；card 为 null 表示删除
    setCards(changes) {
      let md = this.page.content
      const blocks = navBlocks(md)
      for (const [n, card] of [...changes].sort((a, b) => b[0] - a[0])) { // 从后往前替换，前面的偏移不变
        const [s, e] = blocks[n]
        md = md.slice(0, s) + (card ? cardMD(card) : '') + md.slice(e)
      }
      this.page.content = md
    },

    // 代替 prompt/confirm：传 value 是输入框（返回字符串或 null），不传是确认框（返回 true/false）
    ask(text, value) {
      this.$nextTick(() => document.querySelector('.ask input, .ask .primary')?.focus())
      return new Promise(done => this.asking = { text, value, done })
    },
    answer(v) {
      this.asking?.done(this.asking.value == null ? !!v : v)
      this.asking = null
    },

    async onPage(e) {
      if (!this.editing) return
      const item = e.target.closest('.item'), act = e.target.closest('[data-act]')?.dataset.act
      if (item) e.preventDefault()
      if (act === 'addcard') return this.addCard()
      const grid = e.target.closest('.card')?.querySelector('.grid')
      if (!grid) return
      const n = +grid.dataset.card, c = cards[n], i = item ? +item.dataset.i : null
      if (act === 'del') { c.items.splice(i, 1); this.setCards([[n, c]]) }
      else if (act === 'add') this.openItem(n, null)
      else if (act === 'title') {
        const t = await this.ask('卡片标题', c.title)
        if (t != null) { c.title = t.trim(); this.setCards([[n, c]]) }
      }
      else if (act === 'delcard') { if (await this.ask(`删除卡片「${c.title}」？`)) this.setCards([[n, null]]) }
      else if (item) this.openItem(n, i)
    },

    moveItem({ from, to, oldDraggableIndex: a, newDraggableIndex: b }) {
      const f = +from.dataset.card, t = +to.dataset.card
      if (f === t && a === b) return
      cards[t].items.splice(b, 0, ...cards[f].items.splice(a, 1))
      this.setCards(f === t ? [[f, cards[f]]] : [[f, cards[f]], [t, cards[t]]])
    },

    async addCard() {
      const t = await this.ask('卡片标题', '新卡片')
      if (t == null) return
      // 插在最后一张卡片后面
      const md = this.page.content, end = navBlocks(md).pop()?.[1] ?? md.length
      const rest = md.slice(end).replace(/^\s+/, '')
      this.page.content = md.slice(0, end).replace(/\s*$/, '\n\n') + cardMD({ title: t.trim(), items: [] }) + '\n' + (rest && '\n' + rest)
    },

    openItem(n, i) {
      const it = i == null ? { name: '', url: '', icon: '' } : cards[n].items[i]
      this.dlg = { n, i, ...it }
      this.q = ''
      const set = it.icon.split(':')[0]
      this.loadSet(set in this.sets ? set : this.prefix)
    },

    saveItem() {
      const { n, i, name, url, icon } = this.dlg, c = cards[n]
      const it = { name: name.trim(), url: url.trim(), icon: icon.trim() }
      i == null ? c.items.push(it) : (c.items[i] = it)
      this.setCards([[n, c]])
      this.dlg = null
    },

    async loadSet(prefix) {
      this.prefix = prefix
      this.cat = ''
      this.limit = PAGE
      this.coll = null
      const coll = await loadCollection(prefix)
      if (this.prefix === prefix) this.coll = markRaw(coll)
    },
    more(e) { // 滚动到底部加载更多
      const el = e.target
      if (el.scrollTop + el.clientHeight > el.scrollHeight - 80) this.limit += PAGE
    },

    // ---------- 标签页 ----------
    uniq(name, skip) {
      name = name.replace(/[\\/:*?"<>|]/g, '').trim() || '未命名'
      let s = name, k = 2
      while (this.pages.some((p, i) => i !== skip && p.name === s)) s = `${name} (${k++})`
      return s
    },
    addTab() {
      let k = this.pages.length + 1
      while (this.pages.some(p => p.name === `page ${k}`)) k++
      this.pages.push({ name: `page ${k}`, content: '' })
      this.cur = this.pages.length - 1
      this.fresh = true
      this.openSource()
    },
    async renameTab(i) {
      const name = await this.ask('重命名', this.pages[i].name)
      if (name) this.pages[i].name = this.uniq(name, i)
    },
    async delTab(i) {
      const last = this.pages.length === 1
      if (!await this.ask(last ? `删除最后一个标签「${this.pages[i].name}」？\n全部删除后会恢复默认页面。` : `删除标签「${this.pages[i].name}」？`)) return
      if (last) {
        // 隐藏功能：全部删除 = 清空本地数据，重新加载默认页
        await savePages([])
        localStorage.removeItem('snap')
        localStorage.removeItem('cur')
        return location.reload()
      }
      this.pages.splice(i, 1)
      this.cur = Math.min(this.cur, this.pages.length - 1)
    },
    moveTab({ item, from, oldIndex: a, newIndex: b }) {
      // 还原 Sortable 的 DOM 改动，交给 Vue 渲染
      from.removeChild(item)
      from.insertBefore(item, from.children[a] || null)
      const curName = this.page.name
      this.pages.splice(b, 0, ...this.pages.splice(a, 1))
      this.cur = this.pages.findIndex(p => p.name === curName)
    },

    // ---------- 源码 ----------
    openSource() {
      this.draft = this.page.content
      this.source = true
      this.$nextTick(() => document.querySelector('.source textarea')?.focus())
    },
    saveSource() {
      this.page.content = lf(this.draft)
      if (this.fresh) this.page.name = this.uniq(titleOf(this.page.content) || this.page.name, this.cur)
      this.fresh = this.source = false
    },
    cancelSource() {
      // 新建后什么都没写就取消，直接删掉这个标签
      if (this.fresh && !this.page.content && this.pages.length > 1) {
        this.pages.splice(this.cur, 1)
        this.cur = this.pages.length - 1
      }
      this.fresh = this.source = false
    },

    // ---------- 导入导出 ----------
    download(name, blob) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
    exportMd() {
      this.download(`${this.page.name}.md`, new Blob([this.page.content], { type: 'text/markdown' }))
    },
    async exportZip() {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      this.pages.forEach((p, i) => zip.file(`${String(i + 1).padStart(2, '0')}_${p.name}.md`, p.content))
      this.download('nav.zip', await zip.generateAsync({ type: 'blob' }))
    },
    async importFiles(e) {
      const got = [] // [{file, content}]
      for (const f of e.target.files) {
        if (/\.zip$/i.test(f.name)) {
          const { default: JSZip } = await import('jszip')
          const zip = await JSZip.loadAsync(f)
          for (const z of Object.values(zip.files))
            if (!z.dir && /\.(md|markdown)$/i.test(z.name) && !z.name.startsWith('__MACOSX'))
              got.push({ file: z.name.split('/').pop(), content: await z.async('string') })
        } else got.push({ file: f.name, content: await f.text() })
      }
      e.target.value = ''
      if (!got.length) return
      got.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }))
      const list = got.map(g => ({ name: g.file.replace(/\.\w+$/, '').replace(/^\d+_/, ''), content: lf(g.content) }))
      const dup = list.filter(g => this.pages.some(p => p.name === g.name))
      const overwrite = dup.length > 0 && await this.ask(`已存在同名标签：${dup.map(d => d.name).join('、')}\n确定 = 覆盖，取消 = 保留两份`)
      for (const g of list) {
        const old = this.pages.find(p => p.name === g.name)
        if (old && overwrite) old.content = g.content
        else this.pages.push({ name: this.uniq(g.name), content: g.content })
      }
      this.cur = this.pages.findIndex(p => p.name === list[0].name)
    },
  },
})

app.config.compilerOptions.isCustomElement = tag => tag === 'iconify-icon'
app.mount('#app')
