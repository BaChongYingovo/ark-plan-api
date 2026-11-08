#!/usr/bin/env node
/**
 * 密钥扫描（零依赖）：确认这个包里、以及 git 历史里，没有用户真实的 API Key。
 *
 * 为什么单独一个脚本：插件的作用就是「让用户填 Key」，所以最容易被误伤的就是
 * 有人图省事把 Key 写进 cordis.patch.yml、README 示例或一次性提交里。这里把
 * 会落盘的东西全扫一遍：
 *   1. 仓库里被 git 跟踪的文件、以及还没提交的新文件；
 *   2. 根目录的 *.tgz（npm pack 产物，二进制也要扫）；
 *   3. git 的**全部历史**（每个提交的完整补丁），防止「当年提交过、后来删了」；
 *   4. 明确禁止的落点：任何 *.credentials.yaml / .env 被跟踪、以及任何文件里出现
 *      「ARK_XXX_API_KEY = 真值」这种赋值。
 *
 * 判定规则刻意收紧，避免把 provider id（如 ark-coding-plan-byteplus）当密钥：
 * 真实方舟 Key 形如 `ark-` 后面跟 40+ 位，而 provider id 只有 20 多位。
 *
 * 用法：node scripts/scan-secrets.mjs    （或 npm run check:secrets）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PATTERNS = [
  {
    id: 'ark-key',
    // 真实 Key：ark- 后 40+ 位。provider id 最长也就 24 位，不会撞上。
    re: /\bark-[A-Za-z0-9_-]{40,}\b/g,
    skip: (hit) => /^ark-x+$/i.test(hit) || /^ark-$/.test(hit),
  },
  {
    id: 'sk-key',
    re: /\bsk-[A-Za-z0-9_-]{24,}\b/g,
    skip: (hit) => /x{8,}$/i.test(hit),
  },
  {
    id: 'uuid',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  },
  {
    id: 'env-assignment',
    // ARK_X_API_KEY = "ark-…" 这种把真值写在配置文件里的写法
    re: /\b[A-Z][A-Z0-9_]*_API_KEY\b\s*[:=]\s*["']?(ark-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{10,})/g,
  },
]

const PROBLEMS = []

function mask(hit) {
  if (hit.length <= 12) return `${hit.slice(0, 4)}…`
  return `${hit.slice(0, 6)}…${hit.slice(-4)}（${hit.length} 位）`
}

function scanText(text, where) {
  for (const { id, re, skip } of PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const hit = match[0]
      if (skip !== undefined && skip(hit)) continue
      const before = text.slice(0, match.index)
      const line = before.split(/\r?\n/).length
      PROBLEMS.push(`${where}:${line} 命中 [${id}] ${mask(hit)}`)
    }
  }
}

function scanFile(relative) {
  const absolute = path.join(ROOT, relative)
  let text
  try {
    text = readFileSync(absolute, 'latin1')
  } catch {
    return
  }
  scanText(text, relative)
}

function trackedFiles() {
  const files = new Set()
  try {
    const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' })
    for (const item of out.split('\0')) if (item.length > 0) files.add(item)
  } catch {
    // 不是 git 仓库也要能扫
  }
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(entry.name)) continue
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative)
      else files.add(relative)
    }
  }
  walk('.', '')
  for (const file of [...files]) {
    if (file.endsWith('.tgz') || file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.woff2')) continue
    if (file.includes('node_modules/')) continue
  }
  return [...files].filter((file) => !file.includes('node_modules/'))
}

// ---------------------------------------------------------------------------
// 1 + 2. 工作区文件、以及 npm pack 产物
// ---------------------------------------------------------------------------
const files = trackedFiles().filter((file) => !/\.(png|jpe?g|gif|webp|woff2?|ttf)$/i.test(file))
for (const file of files) scanFile(file)

for (const entry of readdirSync(ROOT)) {
  if (!entry.endsWith('.tgz')) continue
  scanFile(entry) // 二进制按 latin1 读，字符串照样能匹配到
}

// ---------------------------------------------------------------------------
// 3. git 全部历史：每个提交的完整补丁
// ---------------------------------------------------------------------------
let historyScanned = false
try {
  const log = execFileSync('git', ['-C', ROOT, 'log', '--all', '--full-history', '-p', '--unified=0'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  historyScanned = true
  scanText(log, '<git history>')
} catch (err) {
  console.log(`  · 跳过历史扫描：${err.message.split('\n')[0]}`)
}

// ---------------------------------------------------------------------------
// 4. 禁止入库的落点
// ---------------------------------------------------------------------------
for (const file of files) {
  const base = path.basename(file)
  if (base === '.env' || base.endsWith('.credentials.yaml') || base === 'credentials.yaml') {
    PROBLEMS.push(`${file}: 凭据类文件不允许进仓库`)
  }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------
console.log('\nark-plan-api — 密钥扫描\n')
console.log(`  · 扫描文件 ${files.length} 个${historyScanned ? '，含 git 全部历史' : '，未扫历史'}`)

if (PROBLEMS.length) {
  console.log(`\n✗ 发现 ${PROBLEMS.length} 处疑似密钥：\n`)
  for (const problem of PROBLEMS) console.log(`  - ${problem}`)
  console.log('\n  真实 Key 只能存在于 ~/.dsh/.credentials.yaml（由凭据服务管理），不得进仓库。\n')
  process.exit(1)
}
console.log('  ✓ 未发现密钥；Key 只应存在于 ~/.dsh/.credentials.yaml\n')
