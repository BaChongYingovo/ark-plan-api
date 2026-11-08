#!/usr/bin/env node
/**
 * ark-plan-api 浏览器半侧自检（零依赖、无浏览器）。
 *
 * 宿主不会给插件一个「跑一下看看」的机会，所以这里用假 window / 假 React / 假
 * 凭据服务把 client.js 真跑一遍，校验的是：
 *   - bundle 形式正确（window.__ModuleLoader__.load，id 与包名一致）；
 *   - apply 真的注册了 plugins.row.config，注册 key 是 <包名>#<行 id>；
 *   - 五个 route 的 ref 严格等于 provider 派生出的凭据名（否则 Key 存了也读不到）；
 *   - 页面渲染得出来，且把五个 route、baseURL、按钮都画了；
 *   - 保存 / 清除真的调到了凭据服务，传入的 ref 与 trim 后的值对不对；
 *   - 拿不到凭据服务、宿主返回错误时，给的是提示而不是抛异常。
 *
 * 用法：node scripts/check-client.mjs    （或 npm run check:client）
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const passed = []

const fail = (msg) => problems.push(msg)
const ok = (msg) => passed.push(`  ✓ ${msg}`)
const assert = (cond, msg) => {
  if (cond) ok(msg)
  else fail(msg)
}

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const clientPath = path.join(ROOT, 'client.js')
const source = readFileSync(clientPath, 'utf8')

// ---------------------------------------------------------------------------
// 1. 按宿主的加载方式跑 bundle：window.__ModuleLoader__.load({ id, factory })
// ---------------------------------------------------------------------------
let definition
const fakeWindow = {
  __ModuleLoader__: {
    load(def) {
      definition = def
    },
  },
}

try {
  new Function('window', 'console', source)(fakeWindow, console)
} catch (err) {
  fail(`client.js 顶层执行抛错：${err.message}`)
}

assert(definition !== undefined, 'client.js 调用了 window.__ModuleLoader__.load')
assert(definition?.id === pkg.name, `bundle id (${definition?.id}) 等于包名 (${pkg.name})`)
assert(typeof definition?.factory === 'function', 'load 传入了 factory 函数')

// ---------------------------------------------------------------------------
// 2. 假 React：hook 返回稳定值，createElement 记录树
// ---------------------------------------------------------------------------
const reactStub = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useRef(initial) {
    return { current: initial }
  },
  useEffect() {},
  useMemo(factory) {
    return factory()
  },
  useCallback(fn) {
    return fn
  },
  Fragment: 'Fragment',
}

const otherStub = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'then') return undefined
      return () => undefined
    },
  },
)

const requireStub = (name) => {
  if (name === 'react') return reactStub
  if (name === 'react-dom') return otherStub
  throw new Error(`未预期的 require('${name}')：client bundle 只能用宿主共享的模块`)
}

let mod
try {
  mod = definition.factory(requireStub)
} catch (err) {
  fail(`factory 抛错：${err.message}`)
}

assert(typeof mod?.name === 'string' && mod.name === pkg.name, `导出 name = ${mod?.name}`)
assert(Array.isArray(mod?.inject) && mod.inject.includes('slots'), '导出 inject 含 slots')
assert(Array.isArray(mod?.inject) && mod.inject.includes('remote.credentials'), '导出 inject 含 remote.credentials')
assert(typeof mod?.apply === 'function', '导出 apply 函数')
assert(mod?.__test !== undefined, '导出 __test（给本自检用）')

const t = mod?.__test ?? {}
const ROUTES = t.ROUTES ?? []

// ---------------------------------------------------------------------------
// 3. route 与凭据 ref 的一致性
// ---------------------------------------------------------------------------
assert(Array.isArray(ROUTES) && ROUTES.length === 5, `route 数量 = ${ROUTES.length}（应为 5）`)
const refs = ROUTES.map((route) => route.ref)
assert(new Set(refs).size === refs.length, 'route 的凭据名互不重复')
for (const route of ROUTES) {
  assert(
    typeof t.credentialRefOf === 'function' && t.credentialRefOf(route.provider) === route.ref,
    `${route.provider} 的 ref (${route.ref}) 等于派生规则结果`,
  )
  assert(typeof route.baseURL === 'string' && route.baseURL.startsWith('https://'), `${route.provider} 的 baseURL 是 https`)
  assert(Number.isInteger(route.models) && route.models > 0, `${route.provider} 声明的模型数 = ${route.models}`)
}

// ---------------------------------------------------------------------------
// 4. 注册：plugins.row.config + <包名>#<行 id>
// ---------------------------------------------------------------------------
const registrations = []
const injected = []
const fakeSlots = {
  inject(name, contribute) {
    injected.push(name)
    const handle = contribute()
    return Array.isArray(handle) ? handle : [handle]
  },
  register(entry, render) {
    registrations.push({ entry, render })
    return () => {}
  },
}

const fakeCtx = {
  get(name) {
    return name === 'slots' ? fakeSlots : undefined
  },
  effect() {},
}

try {
  mod.apply(fakeCtx)
} catch (err) {
  fail(`apply 抛错：${err.message}`)
}

assert(injected.includes('plugins.row.config'), 'apply 向 plugins.row.config 注入')
assert(registrations.length === 1, `注册条目数 = ${registrations.length}`)
assert(registrations[0]?.entry?.name === 'plugins.row.config', '注册的插槽名 = plugins.row.config')
assert(
  registrations[0]?.entry?.key === `${pkg.name}#${pkg.name}`,
  `注册 key = ${registrations[0]?.entry?.key}（应为 <包名>#<行 id>）`,
)

const summary = registrations[0]?.render({ view: 'summary', t: (key) => key })
assert(typeof summary === 'string' && summary.length > 0, `summary 视图返回文案："${summary}"`)

// ---------------------------------------------------------------------------
// 5. 页面渲染（假凭据服务：一条已配置、一条未配置）
// ---------------------------------------------------------------------------
const statusResponse = {
  ok: true,
  value: {
    [refs[0]]: { configured: true, writable: true },
    [refs[1]]: { configured: false, writable: true },
  },
}

const credentialCalls = []
const fakeCredentials = {
  async describe(list) {
    credentialCalls.push({ kind: 'describe', refs: [...list] })
    return statusResponse
  },
  async set(ref, value) {
    credentialCalls.push({ kind: 'set', ref, value })
    return { ok: true }
  },
  async unset(ref) {
    credentialCalls.push({ kind: 'unset', ref })
    return { ok: true }
  },
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const children = node.children ?? []
  const own = node.props && typeof node.props.dangerouslySetInnerHTML === 'object' && node.props.dangerouslySetInnerHTML !== null
    ? ''
    : ''
  return own + children.map(textOf).join('')
}

let tree
try {
  const Page = t.createPage({ credentials: fakeCredentials })
  tree = Page()
} catch (err) {
  fail(`页面渲染抛错：${err.message}`)
}

const pageText = tree === undefined ? '' : textOf(tree)
for (const route of ROUTES) {
  assert(pageText.includes(route.title), `页面画出了 route「${route.title}」`)
  assert(pageText.includes(route.baseURL), `页面画出了 ${route.provider} 的 baseURL`)
  assert(pageText.includes(route.ref), `页面画出了凭据名 ${route.ref}`)
}
assert(pageText.includes('保存'), '页面有保存按钮')
assert(pageText.includes('清除'), '页面有清除按钮')
assert(pageText.includes('~/.dsh/.credentials.yaml'), '页面说明了 Key 的落点')

// 无凭据服务时也要渲染出提示，而不是白屏
try {
  const BarePage = t.createPage({ credentials: undefined })
  const bareText = textOf(BarePage())
  assert(bareText.includes('设置 → 模型'), '拿不到凭据服务时页面给出回退提示')
} catch (err) {
  fail(`无凭据服务时页面渲染抛错：${err.message}`)
}

// ---------------------------------------------------------------------------
// 6. 保存 / 清除的行为
// ---------------------------------------------------------------------------
async function main() {
  const write = await t.writeKey(fakeCredentials, refs[2], '  ark-abcdefgh12345678  ')
  assert(write.ok === true, `writeKey 成功返回 ok（"${write.message}"）`)
  const setCall = credentialCalls.find((call) => call.kind === 'set')
  assert(setCall?.ref === refs[2], `writeKey 传的 ref = ${setCall?.ref}`)
  assert(setCall?.value === 'ark-abcdefgh12345678', 'writeKey 传的值已 trim')

  const empty = await t.writeKey(fakeCredentials, refs[2], '   ')
  assert(empty.ok === false && empty.message.includes('先粘贴'), '空值不提交，给出提示')

  const noService = await t.writeKey(undefined, refs[2], 'ark-abcdefgh12345678')
  assert(noService.ok === false && noService.message.includes('设置 → 模型'), '无凭据服务时提示去模型页')

  const refused = await t.writeKey(
    { async set() { return { ok: false, error: { code: 'credentials/read-only', message: '这个 profile 的凭据库只读' } } } },
    refs[2],
    'ark-abcdefgh12345678',
  )
  assert(refused.ok === false && refused.message.includes('只读'), '宿主拒绝时原样显示错误信息')

  const thrown = await t.writeKey(
    { async set() { throw new Error('网络断了') } },
    refs[2],
    'ark-abcdefgh12345678',
  )
  assert(thrown.ok === false && thrown.message.includes('网络断了'), '凭据服务抛错时被兜住')

  const cleared = await t.clearKey(fakeCredentials, refs[0])
  assert(cleared.ok === true, 'clearKey 成功')
  assert(credentialCalls.some((call) => call.kind === 'unset' && call.ref === refs[0]), 'clearKey 调了 unset(ref)')

  const statuses = await t.readStatuses(fakeCredentials, refs)
  assert(statuses.error === null, 'readStatuses 无错误')
  assert(statuses.statuses[refs[0]] === 'configured', '已配置的 route 读成 configured')
  assert(statuses.statuses[refs[1]] === 'missing', '未配置的 route 读成 missing')
  assert(statuses.statuses[refs[4]] === 'unknown', '没返回的 route 读成 unknown')

  const broken = await t.readStatuses({ async describe() { return { ok: false, error: { message: '凭据库打不开' } } } }, refs)
  assert(broken.error === '凭据库打不开', 'describe 失败时把宿主的错误信息带给页面')

  // -------------------------------------------------------------------------
  // 输出
  // -------------------------------------------------------------------------
  console.log(`\n${pkg.name}@${pkg.version} — 浏览器半侧自检\n`)
  for (const line of passed) console.log(line)

  if (problems.length) {
    console.log(`\n✗ ${problems.length} 个问题：\n`)
    for (const p of problems) console.log(`  - ${p}`)
    console.log()
    process.exit(1)
  }
  console.log('\n✓ 全部通过\n')
}

main().catch((err) => {
  console.log(`\n✗ 自检自身抛错：${err.stack}\n`)
  process.exit(1)
})
