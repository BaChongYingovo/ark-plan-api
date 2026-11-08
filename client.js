/* ark-plan-api —— 浏览器半侧（手写 client bundle，无构建步骤）。
 *
 * 作用：在「侧栏 → 插件 → ark-plan-api → 配置」里给出一页表单，让用户直接粘贴
 * 五个方舟 Key。保存时调用宿主凭据服务（ctx.remote.credentials.set），值只落在
 * DSH 凭据库（~/.dsh/.credentials.yaml），不会写进本插件的任何文件。
 *
 * 为什么不做成插件的配置字段：插件的配置字段会经 config-editor 持久化到 profile
 * 的 cordis.patch.yml（明文 YAML）。凭据库才是 DSH 里 Key 的家，且和「设置 → 模型」
 * 页写的是同一份，llm-pi-ai 请求时按 apiKeyEnv 直接命中，不需要重启。
 */
window.__ModuleLoader__.load({
  id: 'ark-plan-api',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const { useCallback, useEffect, useMemo, useState } = React
    const h = React.createElement

    /* ── 插槽契约 ─────────────────────────────────────────────────────────── */
    // @deepseek-ai/dsh-client-ui-plugin-manager：plugins.row.config 的 key 是
    // `<包名>#<行 id>`，两个值都必须与 cordis.patch.yml 里 insert 的那一行一致。
    const SLOT_NAME = 'plugins.row.config'
    const PACKAGE_NAME = 'ark-plan-api'
    const ROW_ID = 'ark-plan-api'
    const ROW_KEY = PACKAGE_NAME + '#' + ROW_ID
    const SUMMARY_LABEL = '填 API Key'

    /* ── 五个 route：ref 必须等于 cordis.patch.yml 里的 apiKeyEnv ─────────── */
    const ROUTES = [
      {
        provider: 'ark-agent-plan-cn',
        ref: 'ARK_AGENT_PLAN_CN_API_KEY',
        title: 'Agent Plan（国内）',
        baseURL: 'https://ark.cn-beijing.volces.com/api/plan',
        models: 10,
      },
      {
        provider: 'ark-coding-plan-cn',
        ref: 'ARK_CODING_PLAN_CN_API_KEY',
        title: 'Coding Plan（国内）',
        baseURL: 'https://ark.cn-beijing.volces.com/api/coding',
        models: 8,
      },
      {
        provider: 'ark-coding-plan-byteplus',
        ref: 'ARK_CODING_PLAN_BYTEPLUS_API_KEY',
        title: 'Coding Plan（BytePlus 海外）',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/coding',
        models: 2,
      },
      {
        provider: 'ark-cn',
        ref: 'ARK_CN_API_KEY',
        title: '后付费（国内 v3）',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3/compatible',
        models: 3,
      },
      {
        provider: 'ark-byteplus',
        ref: 'ARK_BYTEPLUS_API_KEY',
        title: '后付费（BytePlus 海外）',
        baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3/compatible',
        models: 1,
      },
    ]

    /** provider 派生 ref 的规则（与 llm-pi-ai / scripts/check.mjs 同一套）。 */
    function credentialRefOf(provider) {
      return String(provider).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
    }

    /** 展开成字符串，给 __test 与列表渲染共用。 */
    function routeRefs(routes) {
      const list = routes === undefined ? ROUTES : routes
      return list.map((route) => route.ref)
    }

    /** Key 只做 trim；长度与形状给个温和提示，不拦保存（方舟 Key 前缀是 ark-）。 */
    function cleanKey(raw) {
      return typeof raw === 'string' ? raw.trim() : ''
    }

    function looksLikeArkKey(key) {
      return /^ark-[A-Za-z0-9_-]{8,}$/.test(key)
    }

    /** describe() 的一项 → 三态。 */
    function statusOf(entry) {
      if (entry === undefined || entry === null) return 'unknown'
      return entry.configured === true ? 'configured' : 'missing'
    }

    const STATUS_TEXT = {
      configured: '已配置',
      missing: '未配置',
      unknown: '未知',
    }

    /* ── 宿主服务 ─────────────────────────────────────────────────────────── */
    /**
     * 取凭据服务。插件上下文里拿到它的两种写法都试：ctx.remote.credentials
     * （官方页面用这个）与 ctx.get('remote.credentials')。取不到就返回 undefined，
     * 页面显示提示而不是白屏。
     */
    function resolveServices(ctx) {
      const services = { credentials: void 0 }
      if (ctx === null || typeof ctx !== 'object') return services
      // 注意：cordis 的插件上下文是 Proxy —— 取一个没写进 inject 的服务名会**抛错**
      // （`cannot get property "remote" without inject`），不是返回 undefined。
      // 所以两条取法都必须包在 try 里，否则一次取不到就把整个 web boot 打崩。
      const get = (name) => {
        try {
          return typeof ctx.get === 'function' ? ctx.get(name) : void 0
        } catch (error) {
          return void 0
        }
      }
      const property = (name) => {
        try {
          return ctx[name]
        } catch (error) {
          return void 0
        }
      }
      const remote = property('remote') !== void 0 ? property('remote') : get('remote')
      const direct = get('remote.credentials')
      const credentials = remote !== void 0 && remote !== null && remote.credentials !== void 0
        ? remote.credentials
        : direct
      if (credentials !== void 0 && credentials !== null && typeof credentials.describe === 'function') {
        services.credentials = credentials
      }
      return services
    }

    function errorText(response, fallback) {
      if (response !== void 0 && response !== null && response.error !== void 0 && response.error !== null && typeof response.error.message === 'string' && response.error.message.length > 0) {
        return response.error.message
      }
      return fallback
    }

    /** 批量读「有没有配」，只拿存在性，不拿值（宿主也不返回值）。 */
    async function readStatuses(credentials, refs) {
      const statuses = {}
      for (const ref of refs) statuses[ref] = 'unknown'
      if (credentials === void 0) {
        return { statuses, error: '当前 DSH 没有把凭据服务暴露给插件，这一页只能看不能填。可以先在「设置 → 模型」页里填 Key。' }
      }
      try {
        const response = await credentials.describe(refs)
        if (response !== void 0 && response !== null && response.ok === true && response.value !== void 0 && response.value !== null) {
          for (const ref of refs) statuses[ref] = statusOf(response.value[ref])
          return { statuses, error: null }
        }
        return { statuses, error: errorText(response, '读取凭据状态失败') }
      } catch (error) {
        return { statuses, error: String(error !== void 0 && error !== null && error.message !== void 0 ? error.message : error) }
      }
    }

    /* ── 写、清（抽出来是为了能单测：页面只管状态，逻辑在这里） ───────────── */
    async function writeKey(credentials, ref, raw) {
      const key = cleanKey(raw)
      if (key.length === 0) return { ok: false, message: '先粘贴 Key 再保存' }
      if (credentials === void 0) return { ok: false, message: '这一页拿不到凭据服务，请在「设置 → 模型」页填写' }
      try {
        const response = await credentials.set(ref, key)
        if (response !== void 0 && response !== null && response.ok === true) {
          return {
            ok: true,
            message: looksLikeArkKey(key) ? '已保存到凭据库' : '已保存（形状不像 ark- 开头的方舟 Key，请确认没粘错）',
          }
        }
        return { ok: false, message: errorText(response, '保存失败') }
      } catch (error) {
        return { ok: false, message: String(error) }
      }
    }

    async function clearKey(credentials, ref) {
      if (credentials === void 0) return { ok: false, message: '这一页拿不到凭据服务' }
      try {
        const response = await credentials.unset(ref)
        if (response !== void 0 && response !== null && response.ok === true) return { ok: true, message: '已清除' }
        return { ok: false, message: errorText(response, '清除失败') }
      } catch (error) {
        return { ok: false, message: String(error) }
      }
    }

    /* ── 样式：只用 DSH 设计变量，跟随明暗主题 ────────────────────────────── */
    const CSS = [
      '.apa-root{display:flex;flex-direction:column;gap:14px;max-width:720px}',
      '.apa-title{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px;margin:0}',
      '.apa-intro{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}',
      '.apa-banner{border-radius:var(--dsw-radius-md);padding:10px 12px;font-size:12px;line-height:18px}',
      '.apa-bannerError{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}',
      '.apa-bannerWarn{background:color-mix(in srgb,var(--dsw-alias-state-warn-label) 14%,transparent);color:var(--dsw-alias-state-warn-label)}',
      '.apa-list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}',
      '.apa-card{border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l3));background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1));border-radius:var(--dsw-radius-xl);padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
      '.apa-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.apa-name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}',
      '.apa-provider{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      '.apa-dot{width:8px;height:8px;border-radius:50%;flex:none}',
      '.apa-dotConfigured{background:var(--dsw-alias-state-success-primary)}',
      '.apa-dotMissing{background:var(--dsw-alias-state-error-primary)}',
      '.apa-dotUnknown{background:var(--dsw-alias-label-dimmed)}',
      '.apa-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);margin-left:auto}',
      '.apa-meta{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;word-break:break-all;margin:0}',
      '.apa-row{display:flex;gap:8px;align-items:center}',
      '.apa-input{box-sizing:border-box;flex:1 1 auto;min-width:0;height:32px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;padding:0 10px}',
      '.apa-input:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
      '.apa-input::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.apa-button{box-sizing:border-box;height:32px;border-radius:var(--dsw-radius-md);border:none;padding:0 14px;font:inherit;font-size:13px;line-height:20px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}',
      '.apa-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.apa-secondary{background:transparent;border:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
      '.apa-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.apa-button:disabled{opacity:.45;cursor:default}',
      '.apa-note{font-size:12px;line-height:18px;margin:0}',
      '.apa-noteOk{color:var(--dsw-alias-state-success-primary)}',
      '.apa-noteError{color:var(--dsw-alias-state-error-primary)}',
      '.apa-footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:.5px solid var(--dsw-alias-border-l2);padding-top:10px}',
      '.apa-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0;flex:1 1 240px}',
    ].join('')

    function StyleTag() {
      return h('style', { dangerouslySetInnerHTML: { __html: CSS } })
    }

    /* ── 页面 ─────────────────────────────────────────────────────────────── */
    /**
     * 造页面组件。用工厂而不是闭包直挂，是为了 scripts/check-client.mjs 能塞一个
     * 假凭据服务进来，把渲染与状态流转跑一遍。
     */
    function createPage(services) {
      const credentials = services === undefined ? void 0 : services.credentials

      return function ArkPlanApiPage() {
        const refs = useMemo(() => routeRefs(ROUTES), [])
        const [statuses, setStatuses] = useState({})
        const [loadError, setLoadError] = useState(null)
        const [loading, setLoading] = useState(true)
        const [drafts, setDrafts] = useState({})
        const [busy, setBusy] = useState({})
        const [notes, setNotes] = useState({})

        const refresh = useCallback(async () => {
          setLoading(true)
          const result = await readStatuses(credentials, refs)
          setStatuses(result.statuses)
          setLoadError(result.error)
          setLoading(false)
        }, [credentials, refs])

        useEffect(() => {
          let alive = true
          readStatuses(credentials, refs).then((result) => {
            if (!alive) return
            setStatuses(result.statuses)
            setLoadError(result.error)
            setLoading(false)
          })
          return () => {
            alive = false
          }
        }, [credentials, refs])

        const setNote = (ref, note) => setNotes((current) => ({ ...current, [ref]: note }))
        const setBusyFor = (ref, value) => setBusy((current) => ({ ...current, [ref]: value }))
        const setDraft = (ref, value) => setDrafts((current) => ({ ...current, [ref]: value }))

        const save = useCallback(async (route) => {
          setBusyFor(route.ref, true)
          setNote(route.ref, null)
          const result = await writeKey(credentials, route.ref, drafts[route.ref])
          if (result.ok) {
            setDraft(route.ref, '')
            setStatuses((current) => ({ ...current, [route.ref]: 'configured' }))
          }
          setNote(route.ref, { kind: result.ok ? 'ok' : 'error', text: result.message })
          setBusyFor(route.ref, false)
        }, [credentials, drafts])

        const clear = useCallback(async (route) => {
          setBusyFor(route.ref, true)
          setNote(route.ref, null)
          const result = await clearKey(credentials, route.ref)
          if (result.ok) setStatuses((current) => ({ ...current, [route.ref]: 'missing' }))
          setNote(route.ref, { kind: result.ok ? 'ok' : 'error', text: result.message })
          setBusyFor(route.ref, false)
        }, [credentials])

        const cards = ROUTES.map((route) => {
          const status = statuses[route.ref] === undefined ? 'unknown' : statuses[route.ref]
          const dotClass = status === 'configured' ? 'apa-dot apa-dotConfigured'
            : status === 'missing' ? 'apa-dot apa-dotMissing' : 'apa-dot apa-dotUnknown'
          const note = notes[route.ref]
          const isBusy = busy[route.ref] === true
          const draft = drafts[route.ref] === undefined ? '' : drafts[route.ref]
          return h('li', { key: route.ref, className: 'apa-card' },
            h('div', { className: 'apa-head' },
              h('span', { className: dotClass, 'aria-hidden': 'true' }),
              h('span', { className: 'apa-name' }, route.title),
              h('span', { className: 'apa-provider' }, route.provider),
              h('span', { className: 'apa-status' }, loading ? '读取中…' : STATUS_TEXT[status]),
            ),
            h('p', { className: 'apa-meta' }, route.baseURL + ' · ' + String(route.models) + ' 个模型 · ' + route.ref),
            h('div', { className: 'apa-row' },
              h('input', {
                className: 'apa-input',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: status === 'configured' ? '已配置；粘贴新 Key 可覆盖' : '粘贴 Key（ark-…）',
                value: draft,
                disabled: isBusy,
                onChange: (event) => setDraft(route.ref, event !== void 0 && event !== null && event.target !== void 0 ? event.target.value : ''),
              }),
              h('button', {
                type: 'button',
                className: 'apa-button apa-primary',
                disabled: isBusy,
                onClick: () => { save(route) },
              }, isBusy ? '…' : '保存'),
              h('button', {
                type: 'button',
                className: 'apa-button apa-secondary',
                disabled: isBusy || status !== 'configured',
                onClick: () => { clear(route) },
              }, '清除'),
            ),
            note === null || note === undefined ? null : h('p', {
              className: 'apa-note ' + (note.kind === 'ok' ? 'apa-noteOk' : 'apa-noteError'),
            }, note.text),
          )
        })

        // 凭据服务缺失是「能力不到」而不是「读失败」，直接写死一条提示：
        // 不依赖异步状态，页面第一帧就能看见，用户不会对着一排输入框发懵。
        const capabilityNotice = credentials === void 0
          ? '当前 DSH 没有把凭据服务暴露给插件，这一页只能看不能填。可以先在「设置 → 模型」页里填 Key。'
          : null
        const banner = capabilityNotice === null ? loadError : capabilityNotice

        return h('div', { className: 'apa-root' },
          h(StyleTag, null),
          h('h2', { className: 'apa-title' }, '火山方舟 API Key'),
          h('p', { className: 'apa-intro' }, '这里填的 Key 写进 DSH 凭据库（~/.dsh/.credentials.yaml），不会写进插件的任何文件，也不会出现在 profile 配置里。填完即时生效，不用重启。'),
          banner === null || banner === undefined ? null : h('div', {
            className: 'apa-banner ' + (capabilityNotice === null ? 'apa-bannerError' : 'apa-bannerWarn'),
          }, banner),
          h('ul', { className: 'apa-list' }, cards),
          h('div', { className: 'apa-footer' },
            h('p', { className: 'apa-hint' }, '只想配一条 route 也行；没填的 route 在模型选择器里会报 MISSING_CREDENTIAL，不会影响其他 route。'),
            h('button', {
              type: 'button',
              className: 'apa-button apa-secondary',
              disabled: loading,
              onClick: () => { refresh() },
            }, loading ? '读取中…' : '刷新状态'),
          ),
        )
      }
    }

    /* ── 注册 ─────────────────────────────────────────────────────────────── */
    function extractDisposers(handle) {
      if (handle === void 0 || handle === null) return []
      return Array.isArray(handle) ? handle.filter((item) => typeof item === 'function') : [handle]
    }

    function apply(ctx) {
      // 这里必须整体兜住异常：DSH 的 web 端把「某个插件 apply 抛错」当成致命错误，
      // 整个界面会停在 "Failed to load plugins / ark-plan-api: failed" —— 一个填
      // Key 的页面不该有把宿主打崩的权力。出错就记一条 console.error，然后安静退出。
      try {
        const slots = ctx !== void 0 && ctx !== null && typeof ctx.get === 'function' ? ctx.get('slots')
          : (() => {
            try {
              return ctx !== void 0 && ctx !== null ? ctx.slots : void 0
            } catch (error) {
              return void 0
            }
          })()
        if (slots === void 0 || slots === null || typeof slots.register !== 'function') {
          console.warn('[ark-plan-api] 宿主没有 slots 服务，「填 API Key」页未注册')
          return
        }
        const services = resolveServices(ctx)
        const Page = createPage(services)
        const disposers = []
        const handle = slots.inject(SLOT_NAME, () => slots.register({
          name: SLOT_NAME,
          key: ROW_KEY,
        }, (props) => {
          const view = props !== void 0 && props !== null ? props.view : void 0
          if (view === 'summary') return SUMMARY_LABEL
          return h(Page, null)
        }))
        for (const dispose of extractDisposers(handle)) disposers.push(dispose)
        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => {
            for (const dispose of disposers.splice(0)) {
              try {
                dispose()
              } catch (error) {
                /* 已经卸掉了 */
              }
            }
          }, 'ark-plan-api:row-config')
        }
      } catch (error) {
        const detail = String((error && error.stack) || error)
        window.__ARK_PLAN_API_ERROR__ = detail
        console.error('[ark-plan-api] 注册「填 API Key」页失败，插件已跳过（不影响宿主启动）：' + detail)
      }
    }

    exports.name = PACKAGE_NAME
    // inject 三件事都不能少：
    // - slots：插槽注册表；
    // - remote：cordis 的上下文是 Proxy，**没声明就取 ctx.remote 会直接抛**
    //   `cannot get property "remote" without inject`（0.2.0 崩溃的真因）；
    // - remote.credentials：凭据服务，官方 Models 页也是这么声明的。
    exports.inject = ['slots', 'remote', 'remote.credentials']
    exports.apply = apply
    exports.__test = {
      ROUTES,
      ROW_KEY,
      SLOT_NAME,
      credentialRefOf,
      routeRefs,
      cleanKey,
      looksLikeArkKey,
      statusOf,
      resolveServices,
      readStatuses,
      writeKey,
      clearKey,
      createPage,
    }
    return module.exports
  },
})
