#!/usr/bin/env node
/**
 * ark-plan-api 结构自检（零依赖）。
 *
 * 校验的是"装上去能立刻用"所依赖的那几件事实：
 *   - 入口可 import，且导出 name / apply（插件市场要求入口文件真实存在）；
 *   - package.json 的 dsh.bundle.patch 指向真实文件，files 覆盖必要产物；
 *   - cordis.patch.yml 里每个 route 的字段齐全、baseURL 合法；
 *   - apiKeyEnv 严格符合 DSH 的凭据派生规则（不然 UI 里保存的 Key 读不到）；
 *   - 每个模型字段齐全、数值合理、input 取值合法、id 不重复。
 *
 * 用法：node scripts/check.mjs    （或 npm run check）
 */

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROVIDER_IDS = new Set()
const problems = []
const lines = []

const fail = (msg) => problems.push(msg)
const ok = (msg) => lines.push(`  ✓ ${msg}`)

/** DSH 保存 Key 时使用的凭据名派生规则（与 README 一致）。 */
const credentialNameFor = (providerId) =>
  `${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`

const ALLOWED_APIS = new Set([
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
  'google-generative-ai',
])
const ALLOWED_INPUTS = new Set(['text', 'image', 'audio', 'video', 'pdf'])

// ---------------------------------------------------------------------------
// 1. 入口模块
// ---------------------------------------------------------------------------
const entryPath = path.join(ROOT, 'index.js')
if (!existsSync(entryPath)) {
  fail('index.js 不存在（插件市场会拒绝推广缺少入口的 bundle）')
} else {
  try {
    const mod = await import(pathToFileURL(entryPath).href)
    if (typeof mod.name !== 'string' || !mod.name) fail('index.js 未导出字符串 name')
    else if (typeof mod.apply !== 'function') fail('index.js 未导出函数 apply')
    else ok(`入口可加载：name=${mod.name}，apply 为函数`)
  } catch (err) {
    fail(`index.js 无法 import：${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// 2. package.json
// ---------------------------------------------------------------------------
const pkgPath = path.join(ROOT, 'package.json')
let pkg = {}
if (!existsSync(pkgPath)) {
  fail('package.json 不存在')
} else {
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch (err) {
    fail(`package.json 不是合法 JSON：${err.message}`)
  }
}

const patchRel = pkg?.dsh?.bundle?.patch
if (typeof patchRel !== 'string') {
  fail('package.json 缺少 dsh.bundle.patch')
} else if (!existsSync(path.join(ROOT, patchRel))) {
  fail(`dsh.bundle.patch 指向的文件不存在：${patchRel}`)
} else {
  ok(`dsh.bundle.patch -> ${patchRel}`)
}

const normalize = (p) => (p ?? '').replace(/^\.\//, '')
const shipped = new Set((pkg.files ?? []).map(normalize))
for (const needed of ['index.js', patchRel, 'README.md', 'LICENSE']) {
  if (needed && !shipped.has(normalize(needed))) {
    fail(`package.json 的 files 未包含 ${needed}（npm pack 会把它漏掉）`)
  }
}
if (pkg.license !== 'MIT') lines.push(`  · 注意：license 字段为 ${pkg.license}`)

// ---------------------------------------------------------------------------
// 3. cordis.patch.yml
// ---------------------------------------------------------------------------
const patchPath = path.join(ROOT, patchRel ?? 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const yaml = readFileSync(patchPath, 'utf8')

  // 3a. 载体行：insert 一个以插件名命名的空载 Loader 条目
  const insertMatch = yaml.match(/-\s*insert:\s*\n\s*-\s*id:\s*([\w.-]+)\s*\n\s*name:\s*['"]?([\w.-]+)['"]?/)
  if (!insertMatch) {
    fail('patch 缺少 insert 载体行（插件不会出现在 设置 → 插件 → 插件列表）')
  } else if (insertMatch[1] !== insertMatch[2]) {
    fail(`insert 行的 id 与 name 不一致：${insertMatch[1]} / ${insertMatch[2]}`)
  } else if (pkg.name && insertMatch[1] !== pkg.name) {
    fail(`insert 行的 id (${insertMatch[1]}) 与 package.json 的 name (${pkg.name}) 不一致`)
  } else {
    ok(`载体行：id/name = ${insertMatch[1]}`)
  }

  // 3b. 目标行：llm-pi-ai 的 config.providers
  if (!/^\s*-\s*id:\s*llm-pi-ai\s*$/m.test(yaml)) {
    fail('patch 未 patch llm-pi-ai 行')
  }
  if (!/^\s{2,}providers:\s*$/m.test(yaml)) {
    fail('patch 中找不到 llm-pi-ai 的 config.providers 段')
  }

  // 3c. 逐 route 解析（provider 头在 6 空格缩进）
  const providerHeader = /^ {6}([A-Za-z0-9._-]+):\s*$/gm
  const anchors = [...yaml.matchAll(providerHeader)].map((m) => ({
    id: m[1],
    start: m.index,
  }))

  if (anchors.length === 0) fail('没有解析到任何 provider')

  const summaries = []
  anchors.forEach((anchor, i) => {
    const end = i + 1 < anchors.length ? anchors[i + 1].start : yaml.length
    const block = yaml.slice(anchor.start, end)
    const where = `provider "${anchor.id}"`

    if (PROVIDER_IDS.has(anchor.id)) fail(`${where} 重复定义`)
    PROVIDER_IDS.add(anchor.id)

    const field = (name, re) => {
      const m = block.match(re)
      if (!m) {
        fail(`${where} 缺少 ${name}`)
        return undefined
      }
      return m[1].trim()
    }

    const displayName = field('displayName', /^ {8}displayName:\s*(.+)$/m)
    const apiKeyEnv = field('apiKeyEnv', /^ {8}apiKeyEnv:\s*(\S+)$/m)
    const api = field('api', /^ {8}api:\s*(\S+)$/m)
    const baseURL = field('baseURL', /^ {8}baseURL:\s*(\S+)$/m)

    if (!/^ {8}models:\s*$/m.test(block)) fail(`${where} 缺少 models 段`)

    if (apiKeyEnv && apiKeyEnv !== credentialNameFor(anchor.id)) {
      fail(
        `${where} 的 apiKeyEnv (${apiKeyEnv}) 与派生规则不符，应为 ${credentialNameFor(anchor.id)}` +
          '（否则 UI 里保存的 Key 读不到）',
      )
    }
    if (api && !ALLOWED_APIS.has(api)) {
      fail(`${where} 的 api 取值未知：${api}（可用：${[...ALLOWED_APIS].join(' / ')}）`)
    }
    if (baseURL) {
      if (!baseURL.startsWith('https://')) fail(`${where} 的 baseURL 不是 https：${baseURL}`)
      if (/\/v1(\/|$)/.test(baseURL)) {
        fail(`${where} 的 baseURL 不应带 /v1（Anthropic SDK 会自行追加 /v1/messages）：${baseURL}`)
      }
    }

    // 模型条目：列表项 "- id:" 在 10 空格缩进，同级字段 12 空格
    const modelsIndex = block.search(/^ {8}models:\s*$/m)
    const modelsText = modelsIndex < 0 ? '' : block.slice(modelsIndex)
    const chunks = modelsText.split(/^ {10}- id:\s*/m).slice(1)
    if (modelsIndex >= 0 && chunks.length === 0) fail(`${where} 的 models 为空`)

    const seenModelIds = new Set()
    const models = []
    for (const chunk of chunks) {
      const firstLine = chunk.slice(0, chunk.indexOf('\n'))
      const modelId = firstLine.trim().replace(/^['"]|['"]$/g, '')
      const label = `${where} 模型 "${modelId}"`

      if (!modelId) {
        fail(`${where} 有一个模型缺少 id`)
        continue
      }
      if (seenModelIds.has(modelId)) fail(`${label} 重复`)
      seenModelIds.add(modelId)

      const name = chunk.match(/^ {12}name:\s*(.+)$/m)
      if (!name) fail(`${label} 缺少 name`)

      const ctx = chunk.match(/^ {12}contextWindow:\s*(\S+)$/m)
      const ctxNum = ctx ? Number(ctx[1]) : NaN
      if (!ctx) fail(`${label} 缺少 contextWindow`)
      else if (!Number.isInteger(ctxNum) || ctxNum <= 0) fail(`${label} 的 contextWindow 非法：${ctx[1]}`)

      const maxTok = chunk.match(/^ {12}maxTokens:\s*(\S+)$/m)
      const maxNum = maxTok ? Number(maxTok[1]) : NaN
      if (!maxTok) fail(`${label} 缺少 maxTokens`)
      else if (!Number.isInteger(maxNum) || maxNum <= 0) fail(`${label} 的 maxTokens 非法：${maxTok[1]}`)
      else if (Number.isInteger(ctxNum) && maxNum > ctxNum) {
        fail(`${label} 的 maxTokens (${maxNum}) 大于 contextWindow (${ctxNum})`)
      }

      const input = chunk.match(/^ {12}input:\s*\[([^\]]*)\]$/m)
      if (!input) {
        fail(`${label} 缺少 input`)
      } else {
        const kinds = input[1]
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
        if (kinds.length === 0) fail(`${label} 的 input 为空`)
        for (const kind of kinds) {
          if (!ALLOWED_INPUTS.has(kind)) fail(`${label} 的 input 含未知类型：${kind}`)
        }
      }

      models.push(modelId)
    }

    summaries.push({
      id: anchor.id,
      displayName: displayName ?? '?',
      apiKeyEnv: apiKeyEnv ?? '?',
      api: api ?? '?',
      models: models.length,
    })
  })

  if (summaries.length) {
    ok(`解析到 ${summaries.length} 个 route、${summaries.reduce((n, s) => n + s.models, 0)} 条模型`)
  }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
const label = `${pkg.name ?? 'ark-plan-api'}@${pkg.version ?? '?'}`
console.log(`\n${label} — 结构自检\n`)
for (const line of lines) console.log(line)

if (problems.length) {
  console.log(`\n✗ ${problems.length} 个问题：\n`)
  for (const p of problems) console.log(`  - ${p}`)
  console.log()
  process.exit(1)
}

console.log('\n✓ 全部通过\n')
