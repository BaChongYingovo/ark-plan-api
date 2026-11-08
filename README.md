# ark-plan-api

> 一个 DeepSeek Harness 插件（bundle）：装好后，火山方舟 **Ark** 的 Agent Plan / Coding Plan / 后付费 API 会直接出现在 DSH 的模型选择列表里，你只需要填一个 API Key。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4a90d9.svg)](https://github.com/BaChongYingovo/ark-plan-api)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

*English: `ark-plan-api` registers five Volcengine Ark provider routes (Agent Plan, Coding Plan, post-paid, CN and BytePlus) on DSH's native pi-ai adapter via a `cordis.patch.yml` bundle patch. You supply only an API key — no code, no build step.*

---

## 为什么需要它

DSH 原生支持"在设置里手填 provider"，但每个 Ark 套餐都要自己抄 Base URL、协议、模型 id 和上下文长度，抄错一个字段就连不上。这个插件把这些配置**作为设置的 base 层**预先写好：装完即用，你在 UI 里填的 Key 会正好落到每个 route 读取的位置。

默认协议是 **Anthropic Messages API**（`anthropic-messages`）——Ark 的 plan / coding 端点讲的就是这个协议。

## 已注册的 Route

| Route（Provider ID）       | 定位            | Base URL                                                    | 协议                 |
| -------------------------- | --------------- | ----------------------------------------------------------- | -------------------- |
| `ark-agent-plan-cn`        | Agent Plan      | `https://ark.cn-beijing.volces.com/api/plan`                | `anthropic-messages` |
| `ark-coding-plan-cn`       | Coding Plan     | `https://ark.cn-beijing.volces.com/api/coding`              | `anthropic-messages` |
| `ark-coding-plan-byteplus` | Coding Plan 海外 | `https://ark.ap-southeast.bytepluses.com/api/coding`        | `anthropic-messages` |
| `ark-cn`                   | 后付费 API      | `https://ark.cn-beijing.volces.com/api/v3/compatible`       | `anthropic-messages` |
| `ark-byteplus`             | 后付费 API 海外  | `https://ark.ap-southeast.bytepluses.com/api/v3/compatible` | `anthropic-messages` |

> Base URL **不含** `/v1` 后缀：pi-ai 把它交给 Anthropic SDK，由 SDK 自己追加 `/v1/messages`。

预置模型（可在 `cordis.patch.yml` 里自由增删）：

| Route | 模型 |
| --- | --- |
| `ark-agent-plan-cn` | `doubao-seed-evolving`、`doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-2.0-lite`、`doubao-seed-2.0-mini`、`glm-5.3`、`kimi-k3`、`deepseek-v4-pro`、`deepseek-v4-flash`、`minimax-m3` |
| `ark-coding-plan-cn` | `doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-evolving`、`doubao-seed-2.0-lite`、`glm-5.3`、`deepseek-v4-pro`、`deepseek-v4-flash`、`minimax-m3` |
| `ark-coding-plan-byteplus` | `doubao-seed-2.1-turbo`、`doubao-seed-2.1-pro` |
| `ark-cn` | `doubao-seed-2.1-pro`、`doubao-seed-2.1-turbo`、`doubao-seed-evolving` |
| `ark-byteplus` | `doubao-seed-2.1-turbo` |

`doubao-seed-*` 系列支持多模态（`input: [text, image]`）。

## 安装

### 方式一：从目录装入（推荐，可随时改源码）

```sh
git clone https://github.com/BaChongYingovo/ark-plan-api.git ~/dsh-plugins/ark-plan-api
dsh plugin --profile desktop add ~/dsh-plugins/ark-plan-api
dsh --profile desktop          # 重启 DSH
```

`dsh plugin add` 会把该目录写进 profile 的 `dependencies`，并自动加入 `bundles` 列表。

### 方式二：从 tarball 装入

```sh
npm pack                                  # 产出 ark-plan-api-0.1.0.tgz
dsh plugin --profile desktop add ./ark-plan-api-0.1.0.tgz
```

### 方式三：手动登记

编辑 `$DSH_HOME/profiles/<profile>/package.json`：

```jsonc
{
  "dependencies": {
    "ark-plan-api": "link:C:/Users/you/dsh-plugins/ark-plan-api"   // 或 file:...tgz
  },
  "dsh": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "ark-plan-api"                                                // ← 加这一行
    ]
  }
}
```

然后在 profile 目录执行 `pnpm install` 并重启。

### 检查是否装好

```sh
dsh --profile desktop --dump-config | grep -A2 llm-pi-ai     # 应看到 "patched by ark-plan-api"
```

卸载：`dsh plugin --profile desktop remove ark-plan-api`。

## 填 API Key

装好后有两条路，写进去的是同一份凭据库（`$DSH_HOME/.credentials.yaml`），随便选一条：

**① 插件自带的「填 API Key」页（推荐）**

侧栏 **插件** 页 → 插件列表 → 找到 `ark-plan-api` 这一行 → 点行尾的 **填 API Key**：

- 按套餐分成 5 张卡片（Agent Plan / Coding Plan 国内 / Coding Plan BytePlus / 后付费国内 v3 / 后付费 BytePlus），一张卡一条 Key；
- 每条都显示凭据名（如 `ARK_AGENT_PLAN_CN_API_KEY`）和「已配置 / 未配置」，页面**不回显** Key；
- 点「保存」即时写入凭据服务，不用重启，「设置 → 模型」那边立刻能读到；点「清除」删除；
- Key 只进凭据库：不写进插件文件、不写进 profile 配置、不进日志。

**② 设置 → 模型（Models）**

选中一个 Ark route（例如 *Ark Agent Plan*），粘贴对应套餐的 Key，和配置官方 provider 一样。两条路等价 —— 只是这个页面把 5 个套餐的凭据名摆在一起，不用猜该填哪个。

Key 的落点由每个 route 的 `apiKeyEnv` 决定，用的是 DSH 的派生规则：

```js
PROVIDER_ID.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_API_KEY'
// ark-agent-plan-cn -> ARK_AGENT_PLAN_CN_API_KEY
```

所以无论从哪条路保存，Key 都会正好写进 route 读取的凭据名。你也可以改用环境变量提供同名 Key，例如 `ARK_AGENT_PLAN_CN_API_KEY=...`（存储值优先于环境变量）。

各套餐 Key 的获取入口（火山方舟控制台）：

- Agent Plan：<https://console.volcengine.com/ark/region:cn-beijing/openManagement?advancedActiveKey=agentPlan>
- Coding Plan：<https://console.volcengine.com/ark/region:cn-beijing/openManagement?advancedActiveKey=subscribe>
- 后付费 API Key：<https://console.volcengine.com/ark/region:cn-beijing/apikey>

## 工作原理

DSH 以"休眠"状态挂载了 `@deepseek-ai/dsh-llm-pi-ai`（零 provider）。本插件的 `cordis.patch.yml` 做两件事：

1. `insert` 一行属于本 bundle 的空载插件（`ark-plan-api`，`index.js` 导出 `name` / `apply`，`apply` 是空函数）——这样插件在 **设置 → 插件 → 插件列表** 里有一个真实条目和活跃 fiber（宿主只枚举 Loader 条目），也满足插件市场"声明的入口文件必须存在"的要求。
2. 给 `llm-pi-ai` 那一行补上 `config.providers`，作为设置的 **base 层**。设置服务会把它和用户的 `settings.yaml` **按 provider 逐键深合并**，因此：
   - 安装后 provider 立刻出现在原生模型列表；
   - 你在"设置 → 模型"里手加的 provider 与它共存；
   - 你在 yaml 里覆盖某个 route 的字段，只影响那个 route。

行 patch 会整行替换目标行的 `config`；`dsh-base` 挂载 `llm-pi-ai` 时没有 config，所以这里只写 `providers` 是安全的。

浏览器半侧（`client.js`）只负责 **填 API Key 那一页**：它向插件管理页的 `plugins.row.config` 插槽注册 `ark-plan-api#ark-plan-api`，页面用宿主的 `ctx.remote.credentials`（`describe` / `set` / `unset`）读写凭据库。也就是说 Key 走的是 DSH 自己的凭据服务 —— 插件不碰 `.credentials.yaml`，不自己存 Key，也不把 Key 写进任何配置。宿主没暴露凭据服务时，页面会明说「只能在设置 → 模型里填」，而不是假装保存成功。

## 自定义

直接改 `cordis.patch.yml`，重启后生效：

```yaml
ark-cn:
  displayName: Ark (后付费)
  apiKeyEnv: ARK_CN_API_KEY          # 换名字 = 换一个凭据槽位
  api: anthropic-messages            # 也可改 pi-ai 支持的其他协议
  baseURL: https://ark.cn-beijing.volces.com/api/v3/compatible
  models:
    - id: doubao-seed-2.1-pro        # 方舟上的真实模型 id / 推理接入点 ep-xxx
      name: Doubao Seed 2.1 Pro      # 选择器里显示的名字
      contextWindow: 256000
      maxTokens: 65536
      input: [text, image]
```

- **加模型**：在对应 route 的 `models` 里加一条；`id` 也可以填 `ep-xxxxxxxx` 形式的推理接入点。
- **加地区/新套餐**：复制一整个 route 块，换 provider id、`apiKeyEnv`、`baseURL`。
- **想用 OpenAI 兼容协议**：把 `api` 改成 pi-ai 里对应的 id，并把 `baseURL` 指向兼容端点。

改完跑一遍自检（见下），能提前发现 id 拼错、Key 名对不上这类问题。

## 常见问题

**装完模型列表里没有 Ark？**
1. 确认 profile 对了：`dsh --profile <name> --dump-config` 里 `llm-pi-ai` 行应显示 *patched by ark-plan-api*；
2. 确认插件在 `dsh.bundles` 里，而不只是 `dependencies`；
3. 改完要重启宿主进程，Web 端刷新页面即可。

**401 / 模型不存在？**
Key 属于哪个套餐就选哪个 route。拿 Agent Plan 的 Key 去调 `ark-cn`（后付费）会认证失败，反之亦然。

**「填 API Key」页在哪？点了没反应？**
在侧栏 **插件** 页的插件列表里，`ark-plan-api` 那一行的行尾（设置 → 插件 里那份是只读清单，没有按钮）。行尾按钮不出现时，通常是宿主版本较老、没有 `plugins.row.config` 这个插槽 —— 那时用 **设置 → 模型** 填，效果一样。页面顶部若提示「没有把凭据服务暴露给插件」，同理，去模型页填。

**填完 Key 还要重启吗？**
不用。凭据是运行时读取的；只要插件本身是这次启动时装进去的（首次安装需要重启宿主让它加载 `client.js`），之后填 Key 立即生效。

**装完 DSH 起不来，界面停在 “Failed to load plugins / ark-plan-api: failed”？**
那是 0.2.0 的 bug：`client.js` 读了 `ctx.remote` 却没在 `inject` 里声明 `remote`，cordis 的上下文是 Proxy，
取未声明的服务名会抛错，宿主把插件 `apply` 抛错当成致命 boot 错误。**升级到 0.2.1** 即可；临时救急的办法是把
`ark-plan-api` 从 profile `package.json` 的 `dsh.profile.bundles` 里去掉再启动。0.2.1 起 `apply` 全程兜住异常，
插件自己出问题只会打印一条 `console.error`，不会再拦住宿主启动。

**会覆盖我自己加的 provider 吗？**
不会。这些只是 base 层默认值，与你在 UI 里加的 provider 逐键深合并；同名 route 时你的设置优先。

**插件会读我的 Key / 上传数据吗？**
`index.js` 是空函数，`apply` 什么都不做。插件只贡献配置，不发请求、不读凭据；请求全部由 DSH 自己的 pi-ai 适配器发出。

## 开发与自检

无第三方依赖，不需要构建（`client.js` 是手写 bundle，React 由宿主提供）。

```sh
npm run check          # 结构自检：入口可加载、patch 可解析、route/Key 名/模型字段自洽
npm run check:client   # 浏览器半侧自检：假 window / 假 React / 假凭据服务真跑一遍
npm run check:secrets  # 密钥扫描：工作区 + npm pack 产物 + git 全部历史
npm test               # 上面三个一起跑
npm pack               # 打 tarball
```

`scripts/check.mjs` 校验项（结构）：

- `index.js` 可 import，导出 `name` 与 `apply`；
- `package.json` 的 `dsh.bundle.patch` 指向真实文件，`files` 覆盖入口/patch/文档/client；
- patch 里每个 route 都有 `displayName` / `apiKeyEnv` / `api` / `baseURL` / `models`；
- `apiKeyEnv` 与 provider id 严格符合 DSH 的派生规则（否则 UI 里保存的 Key 会读不到）；
- `baseURL` 是 https 且不带 `/v1` 后缀；
- 每个模型都有 `id` / `name` / 正整数 `contextWindow` / 正整数 `maxTokens` / 合法 `input`；
- provider id、模型 id 在各自作用域内不重复；
- 浏览器半侧：`dsh.client.platform` 为 web、`exports["./client"]` 指向真实文件、bundle 走 `window.__ModuleLoader__.load`、注册的插槽与 key 和 patch 里的行 id 对得上、`client.js` 里的凭据名与 patch 的 `apiKeyEnv` 双向一致。

`scripts/check-client.mjs` 校验项（行为，不需要浏览器）：

- bundle 的 id / factory / 导出（`name` / `inject` / `apply`）形状正确；
- 真的注册到了 `plugins.row.config`，key 是 `<包名>#<行 id>`；
- 五个 route 的凭据名都等于派生规则结果；
- 页面画得出来：5 张卡片、5 个 baseURL、5 个凭据名、保存/清除按钮、Key 落点说明；
- 保存走 `credentials.set(ref, 值)`（值会 trim）、空值不提交、宿主拒绝时原样透出错误、抛错被兜住；
- 清除走 `credentials.unset(ref)`；状态读取把 `configured` / `missing` / `unknown` 分得清；
- 拿不到凭据服务时，页面给的是「去设置 → 模型」的提示，而不是白屏或假成功。

`scripts/scan-secrets.mjs` 校验项（不泄漏）：

- 工作区与 `*.tgz` 里没有形如 `ark-` + 40 位、`sk-` + 24 位、UUID 的字符串；
- 没有 `ARK_XXX_API_KEY = <真值>` 这种把 Key 写进配置的写法；
- **git 全部历史**里也没有（含已删除的提交）；
- 没有任何 `.credentials.yaml` / `.env` 被跟踪。

> 判定规则故意收紧：provider id（如 `ark-coding-plan-byteplus`，`ark-` 后 24 位）不算命中，只认真实 Key 的长度。

## 验证记录

在已安装的 **DeepSeek Harness.app**（`@deepseek-ai/dsh-desktop@0.2.1-rc.5`、Electron 44.7.0、node 24.21.0）上验证：

- 5 个 route 均通过 schema 与可服务性校验，正常出现在 `ctx.llm.listConfigurableProviders()` / `listProviders()` / `listModels()`；
- `dsh --dump-config` 显示该行 *patched by ark-plan-api*；
- 装入 bundle 后 web host 干净启动（无 loader 报错）；
- 用真实 Key 对 `ark-agent-plan-cn`（`doubao-seed-evolving`，`anthropic-messages`）**实测调通**，返回正文 + CoT 思考块。

0.2.0 新增的填 Key 页（`npm test` 三个自检）：

- 结构自检：6 组断言全过（入口、patch、5 route / 24 模型、client 半侧、插槽 key、凭据名对齐）；
- 浏览器半侧自检：63 条断言全过 —— 假 window 抓到 bundle 定义、假 React 渲染出 5 张卡片、
  保存/清除真的调到假凭据服务（ref 与 trim 后的值都对）、宿主拒绝与抛错都被兜住；
- 密钥扫描：工作区 12 个文件 + `*.tgz` + git 全部历史，0 命中；
- 真机渲染（重启宿主后目视确认按钮与卡片）留待使用者确认，不在本仓库的自动校验范围内。

0.2.1 崩溃修复的真机验证（隔离 `DSH_HOME`，独立端口，未动正在用的实例）：

- 复现：0.2.0 装进测试 profile 后 web 端 boot 失败，renderer 抛
  `Error: cannot get property "remote" without inject`，界面渲染 “Failed to load plugins / ark-plan-api: failed”，`#root` 被加 `inert`；
- 修复后同环境重新启动：boot 成功，页面正常渲染；侧栏 **插件** → `ark-plan-api` 卡片 → **查看** → 组件行出现
  `aria-label="配置 ark-plan-api"` 的可点按钮；
- 点开行配置页：标题「火山方舟 API Key」、5 张卡片（`ark-agent-plan-cn` / `ark-coding-plan-cn` /
  `ark-coding-plan-byteplus` / `ark-cn` / `ark-byteplus`）、每张显示凭据名与「未配置」、5 个 `type=password` 输入框；
- 在 `ark-agent-plan-cn` 卡片里填测试值后点「保存」：状态变「已配置」并提示「已保存到凭据库」；
  点「清除」：回到「未配置」并提示「已清除」——Key 全程只进 `$DSH_HOME/.credentials.yaml`；
- 无浏览器控制台异常，`window.__ARK_PLAN_API_ERROR__` 为空。

## 安全说明

- 仓库不含任何 API Key；Key 由使用者在本地填写，落在 `$DSH_HOME/.credentials.yaml` 或环境变量。
- 插件不会把 Key 写进 `cordis.patch.yml` / profile 配置 / 日志：`index.js` 是空函数，填 Key 的页面只调用宿主的凭据服务，页面永不回显已保存的值。
- `npm run check:secrets` 会扫工作区、`*.tgz` 和 **git 全部历史**，提交前跑一遍（`npm test` 里已包含）。
- 请勿把 `--dump-config` 的完整输出或 `.credentials.yaml` 贴到 issue 里。

## License

[MIT](LICENSE) © 2026 BaChongYingovo

本项目与火山引擎 / BytePlus 无隶属关系，Ark、Doubao 等名称归其各自所有者。
