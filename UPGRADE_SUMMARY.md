# Cloud Mail 本地升级总结

## 升级目标

- 以 `temp/cloud-mail-main` 为源项目最新版基线升级当前项目。
- 保留当前项目已有的 Outlook、邮件预览分享等二改功能。
- 修复排查中确认的邮件 HTML 存储型 XSS 风险。
- 清理 `mail-worker/wrangler.toml` 中的生产隐私信息，并重写相关 Git 分支/标签历史。
- 完成前端构建、Worker 测试和升级差异复核。

## 工作约定

- 每次代码、配置或依赖改动必须同步更新本文档。
- 保留用户要求的 `.gitignore` 修改和 `OUTLOOK_FEATURE_PLAN.md` 删除结果。
- 不在文档中记录生产密钥明文。

## 当前基线

- 当前分支：`main`，升级前提交为 `f22a170`。
- `temp/cloud-mail-main` 已通过全目录比较确认与上游提交 `a6b66fc` 完全一致。
- 当前项目与上游提交 ID 历史不同，但在以下两个提交存在完全相同的源码树：
  - 当前历史：`9ec5345`。
  - 上游历史：`70923fe`。
- 升级已利用该相同源码树建立临时历史桥接并完成三方合并；临时 `git replace` 引用已删除。
- `temp/cloud-mail-main` 的关键依赖版本高于当前项目：
  - Worker：Hono `4.12.16`、Wrangler `^4.90.0`。
  - 前端：Axios `1.15.2`、Element Plus `^2.13.1`，并新增 `@vueuse/components`。
- 已确认线上和本地邮件正文渲染均未消毒 HTML，存在存储型 XSS。
- 已确认上游 XSS PR #436、#441 均未合并，因此升级后仍需单独补齐安全修复。

## 已完成

1. 阅读 `temp/task.md`，确认付款邮件本身不含 XSS，但邮件转发会扩大验证码泄露范围。
2. 对比当前项目、`temp/cloud-mail-main` 和上游仓库，以三方合并完成本地升级并解决 15 个冲突。
3. 保留 Outlook、公开预览、全部邮箱、自定义发件和分别发送等本地能力，并合入上游 AI 验证码、黑名单、Cloudflare Email Sending 等功能。
4. 完成存储型 XSS 纵深修复、生产配置去敏和安全回归测试。
5. 从本地 `main`、`origin/main`、`origin/dev` 的所有旧提交中移除 `mail-worker/wrangler.toml`，并匿名化仓库所有者的提交身份；未改写上游贡献者身份。
6. 前端构建、Worker 5 个测试文件共 25 个用例、依赖零漏洞审计和 Wrangler 4.110.0 部署 dry-run 均已通过。
7. 已使用精确 `--force-with-lease` 将脱敏后的 `main`、`dev` 推送至 zduu 的 `origin`，并回读确认远端指针正确；未向 maillab 源项目写入任何内容。
8. 已补充仓库根目录 pnpm 工作区入口，修复 Cloudflare 在根目录执行 `pnpm install --frozen-lockfile` 时因工作区缺少 `packages` 字段而失败的问题。

## 仓库所有者仍需执行

1. 在 Cloudflare 控制台或不入库的部署配置中填写新的生产 D1、KV、域名和管理员信息。
2. 轮换 JWT 及所有可能暴露的第三方凭据，执行 `wrangler secret put jwt_secret`，并清除旧登录会话。
3. 通知协作者重新克隆仓库，防止旧对象被再次推回。
4. 配置 zduu 仓库的 Actions Secret/Variable 后，手动运行 Cloudflare 部署工作流。

## 变更记录

### 2026-07-14

- 新增 `UPGRADE_SUMMARY.md`，建立升级目标、基线、进度与变更记录。
- 扩展升级范围：清理生产配置隐私信息，并在升级完成后重写相关分支和标签历史。
- 确认 `temp/cloud-mail-main` 与上游 `a6b66fc` 全目录无差异。
- 确认两套历史的最后相同源码树，并确定采用临时历史桥接的三方合并方案。
- 已建立临时历史桥接并开始合并上游 `a6b66fc`。
- 合并产生 15 个冲突，待逐项解决：
  - `mail-vue/src/i18n/en.js`
  - `mail-vue/src/i18n/zh.js`
  - `mail-vue/src/init/init.js`
  - `mail-vue/src/layout/write/index.vue`
  - `mail-vue/src/request/email.js`
  - `mail-vue/src/views/email/index.vue`
  - `mail-vue/src/views/login/index.vue`
  - `mail-worker/src/const/kv-const.js`
  - `mail-worker/src/email/email.js`
  - `mail-worker/src/init/init.js`
  - `mail-worker/src/security/security.js`
  - `mail-worker/src/service/account-service.js`
  - `mail-worker/src/service/email-service.js`
  - `mail-worker/src/service/setting-service.js`
  - `mail-worker/wrangler.toml`
- 新增“旧版本安全问题弥补措施”，按可能已发生入侵的前提规划止血、修复、轮换、审计和部署验证。
- 完成第一批冲突处理：合并前端登录、发件、收件范围、请求参数、国际化，以及 Worker KV 常量和权限路由；同时保留本地“全部邮箱”与上游 `allReceive` 能力。
- 解决账户服务冲突：账户列表同时保留预览邮箱过滤和上游置顶排序、游标分页。
- 解决设置服务冲突：合并自动建表回退、登录域名列表、AI 验证码过滤、项目链接和未登录域名隐藏逻辑，并修正上游分支中误写实体对象的 `projectLink` 赋值。
- 解决收信流程冲突：保留 `waitUntil` 后台附件保存和地址编码容错，同时接入上游黑名单与 AI 验证码识别。
- 解决数据库初始化冲突：保留预览分享和 Outlook 迁移，将上游 `allReceive`、排序、自动刷新字段、AI 验证码和黑名单迁移合并为新的幂等 `v3DB`，避免重复方法名覆盖旧迁移。
- 开始合并邮件服务：先合并本地发件地址校验和上游附件转换依赖，并移除重复的账户实体导入。
- 完成邮件列表查询冲突：统一 `allAccount` 与 `allReceive` 范围，保留账户标签和星标字段，并过滤已删除账户。
- 合并发信前置校验：保留分别发送参数和对象存储检查，接入上游站内收件判断及 `internal` 角色限制。
- 合并发件人和发送服务选择：保留管理员自定义发件地址及域名校验，外部邮件优先使用 Cloudflare Email Sending，否则回退 Resend；站内邮件不再强制要求外部发信凭据。
- 完成增量收信查询冲突：自动刷新同时支持“全部邮箱”和 `allReceive`，保留账户标签、星标、附件，并过滤已删除账户。
- 清理 Wrangler 当前配置：生产 D1/KV、域名、管理员邮箱和 JWT 密钥已从默认配置移除；开发与测试配置改为明确的本地占位值；生产 JWT 要求使用 `wrangler secret put jwt_secret` 注入。
- 完成存储型 XSS 纵深修复：新增前后端 HTML 消毒器；新邮件入库前消毒，历史邮件在 Shadow DOM、公开预览和列表摘要展示时再次消毒；Telegram HTML 页面移除动态脚本并启用 CSP，纯文本模板统一转义；新增安全响应头和 XSS 回归测试。
- 恢复本地“分别发送”语义：按收件人分别调用 Cloudflare Email Sending 或 Resend、分别保存发件记录和附件；站内邮件也按相同分组投递，同时保留合并发送模式。
- 已按合并后的锁文件安装前端和 Worker 依赖，准备执行构建与测试。
- 首次验证被 pnpm 11 的依赖构建策略拦截，尚未进入实际测试；已为前端和 Worker 添加最小 `onlyBuiltDependencies` 白名单，仅允许 `esbuild`、`sharp`、`workerd` 执行必要构建脚本。
- 已按最小构建脚本白名单重新安装依赖，准备重新运行构建和测试。
- pnpm 11 明确忽略 `package.json#pnpm` 配置，已将白名单迁移到前端和 Worker 各自的 `pnpm-workspace.yaml`，确保配置真实生效。
- 使用 `pnpm-workspace.yaml` 重装时仍被当前环境的额外供应链策略拦截，安装退出码为 1；依赖构建脚本尚未完成，不能视为验证通过，正在改用 pnpm 支持的显式审批流程。
- 已仅审批项目实际需要的构建依赖：Worker 的 `esbuild`、`sharp`、`workerd` 已执行构建脚本；前端的 `esbuild`、`@parcel/watcher`、`vue-demi` 已单独审批，`sharp` 已由现有策略处理；未使用 `--all` 放开其他包。
- 前端生产构建已通过；Worker 首次测试因上游 Vitest 配置引用不存在的 `wrangler.jsonc` 而未运行用例，已改为使用去敏后的 `wrangler-test.toml`。
- Worker 第二次测试因当前 Vitest Workers pool 不支持 AI wrapped binding 而无法启动；已仅在测试配置中禁用 AI 绑定，生产 AI 配置不变。
- Worker 第三次测试已执行 7 个用例且全部通过，但全应用测试暴露账户列表 `where(and(...))` 合并时少一个右括号，已修正链式查询结构。
- Worker 第四次测试已执行全部 9 个用例；XSS 与邮件解码测试通过，剩余两个失败来自上游仍期待 `Hello World!` 的过期占位快照，已改为验证真实 Cloud Mail SPA 入口页。
- Worker 最终单元测试通过：3 个测试文件、9 个用例全部成功，其中包含 6 个 XSS 消毒回归用例。
- Wrangler 4.90.0 使用去敏测试配置完成部署 dry-run：前端自定义构建、321 个静态资源读取、Worker 打包和绑定解析全部通过。
- 提交前审计确认 Outlook、邮件预览分享、“全部邮箱”等本地二改仍存在，上游 AI 验证码、黑名单、Cloudflare Email Sending、账户置顶等能力已合入；当前工作树敏感生产值扫描无命中。
- 已创建升级合并提交 `feat: 升级上游版本并修复邮件 XSS`。历史清理将从待推送分支的全部旧提交中移除本地 Wrangler 配置文件，再仅在新历史顶端加入去敏版本。
- 上游合并冲突已全部清零，并恢复用户升级前已有的 `.gitignore` 修改和 `OUTLOOK_FEATURE_PLAN.md` 删除状态。
- 已完成本地历史脱敏：重写 `main`、`origin/main`、`origin/dev` 的可达历史，旧提交不再包含 `mail-worker/wrangler.toml`；仓库所有者提交身份改为通用 noreply 身份，上游贡献者信息保持不变。
- 已删除用于合并的临时 `git replace` 引用，并在新历史顶端重新加入仅含占位说明的 `mail-worker/wrangler.toml`。
- 当前仓库的本地 Git 作者配置已改为通用 noreply 身份，避免后续提交再次写入私人邮箱；该设置只影响本仓库。
- 历史重写前已生成本地恢复包 `/tmp/cloud-mail-before-history-rewrite.bundle`；该临时文件不得提交或上传。
- 历史重写后已重新完成最终验证：前端生产构建通过；Worker 3 个测试文件、9 个用例全部通过；Wrangler 4.90.0 使用去敏测试配置完成部署 dry-run。临时恢复包、reflog 和不可达旧对象已清理。
- 已提交用户原有清理项：`.gitignore` 改为忽略 `temp/`，并删除已完成使命的 `OUTLOOK_FEATURE_PLAN.md`；该提交不影响 Outlook 功能实现。
- 全面推送前审查修复第一组认证链问题：公共 API 在 KV token 未配置时不再匿名放行；批量添加用户改用 SQL 绑定参数并限制分页；OAuth 绑定增加 10 分钟签名授权、前端 OAuth `state` 校验；修复退出登录漏 `await` 导致会话未移除的问题，并在重写 KV 时保留会话 TTL；新增对应安全回归测试。
- 全面推送前审查修复第二组数据与渲染问题：公告 HTML 消毒并限制 CSS 数值；删除预览链接不再误删正式邮箱；Outlook 详情不再回传密码/refresh token，IMAP UID 严格限为数字且邮件正文双重消毒；附件读取统一支持 KV/R2/S3 并正确返回 404；Telegram 查看链接增加 30 天有效期；统一管理员邮箱大小写判断并修复空附件 URL 返回 `NaN`。
- 全面推送前审查修复部署入口：数据库初始化改为 `POST /api/init` 并通过 `Authorization` 头传密钥，避免密钥进入 URL/日志；Resend webhook 强制校验 Svix 签名；JWT、LinuxDo 和 Resend webhook 密钥改为 Worker Secret 注入。
- zduu 远端当前没有 Actions Secret/Variable。为防止强推后误触发失败或意外生产部署，Cloudflare 工作流已改为仅手动触发，并移除自动删除流水线记录的第三方 Action；配置所需变量后再从 Actions 页面执行。
- 部署工作流只允许从 Actions Secret 读取 Cloudflare API Token、JWT、LinuxDo Client Secret 和 Resend webhook secret；移除旧 `sed` 流程遗留的 JWT 字符限制，允许使用完整高熵随机密钥。
- GitHub Actions 的 pnpm 版本现已统一为 10.11.1，与 Cloudflare Workers Builds 和根工作区锁文件一致，避免不同 pnpm 主版本产生安装行为差异。
- 依赖安全审计发现 Worker 的 AWS SDK/fast-xml-parser、Rollup/Undici 等存在 critical/high 公告，已升级 AWS SDK、Cloudflare 工具链、Hono、PostalMime、Resend、Linkedom、UAParser、Vitest 和 Wrangler 到包含修复的兼容版本，待重新执行测试与部署 dry-run。
- Workers Vitest 4 测试池移除了旧的 `/config` 入口且仅提供 ESM，已按新版插件接口迁移为 `vitest.config.mjs`，继续执行全量回归。
- Worker 二次审计确认剩余 high 来自未使用的 `@cloudflare/vite-plugin` 生产依赖及旧版 Drizzle；已移除该无用插件并将 Drizzle 升级至修复 SQL 标识符注入的版本。
- 前端依赖审计发现 Axios、Lodash、defu、Rollup 等 high 公告，已升级 Axios、Lodash、Element Plus、Pinia 持久化插件、Vite 7 及相关 Vue/构建依赖到安全兼容版本，待重新构建和审计。
- 前端首次升级构建通过，但 `@vitejs/plugin-vue` 5.x 的 peer 范围不含 Vite 7，已同步升级到 6.x 以消除依赖声明不兼容。
- 最后两个 moderate 公告来自 UUID 缓冲区边界检查和 ECharts XSS，已分别升级到 UUID 11.1.1+ 与 ECharts 6.1.0+，准备执行零漏洞复审。
- Wrangler 生产打包复验发现 Outlook 服务的本地 `escapeHtml` 与新增同名导入冲突；已移除重复导入并保留原有转义实现，重新开始完整复验。
- 独立静态分析继续修复运行边界：S3 删除改用无需 MD5 的单对象删除，避免 Workers WebCrypto 不支持 MD5；无效邮箱置顶/全部收件返回 404；KV/S3 不再写入字符串 `null` 响应头；删除引用未定义变量的死函数、空测试入口及无用导入，并清理可疑表达式。
- 推送前最终复验通过：Worker 5 个测试文件共 25 项用例全部成功；前端 Vite 7.3.6 生产构建成功；Wrangler 4.110.0 部署 dry-run 成功；Worker/前端生产依赖均为零已知漏洞；peer、冻结锁文件安装、YAML、Shell/Node 语法、合并标记和静态分析错误检查全部通过。
- 已将重写后的 `main`（`919b7fd`）和 `dev`（`0952c93`）强制安全推送到 `git@github.com:zduu/cloud-mail.git`；远端回读一致，Actions 未自动运行，maillab 源仓库未配置为本地远程且未被访问写入。
- Cloudflare 构建日志显示根目录依赖安装失败，报错为 `packages field missing or empty`；确认根目录缺少工作区清单，且两个子项目工作区配置均未声明 `packages`。
- 新增根目录 `package.json` 和 `pnpm-workspace.yaml`，将 `mail-vue`、`mail-worker` 纳入统一工作区，并合并现有最小依赖构建白名单；固定 Cloudflare 当前使用的 pnpm 版本为 10.11.1。
- 使用 pnpm 10.11.1 生成根目录统一锁文件，使 Cloudflare 的 `--frozen-lockfile` 安装可以直接校验两个子项目依赖而无需现场改写锁文件。
- Cloudflare 等价冻结安装已通过；同时将原先已批准的 `@parcel/watcher`、`vue-demi` 补入 pnpm 10 的 `onlyBuiltDependencies`，避免 pnpm 10 忽略 pnpm 11 `allowBuilds` 配置后跳过前端所需构建脚本。
- 根工作区修复复验通过：无 `node_modules` 的临时干净副本可使用 pnpm 10.11.1 离线执行冻结安装，592 个包全部安装且无构建脚本被忽略；前端生产构建成功，Worker 5 个测试文件共 25 项用例通过，Wrangler 4.110.0 部署 dry-run 成功，前后端生产依赖审计均为零已知漏洞。
- Cloudflare 新日志确认其构建根目录为 `mail-worker`：依赖阶段仅安装 Worker 的 157 个包，随后前端构建因 `vite: not found` 失败。
- 删除两个会截断父级工作区查找的子项目 `pnpm-workspace.yaml`；在临时干净副本中从 `mail-worker` 执行冻结安装后，pnpm 已正确继承根工作区并安装全部 592 个包，前端 Vite 可执行文件存在且没有构建脚本被忽略。
- 当前工作树再次从 `mail-worker` 入口完成冻结安装并显示 `Scope: all 3 workspace projects`，随后根部署 dry-run 成功，确认该布局与 Cloudflare 的实际构建根目录一致。
- 线上邮件列表查询暴露旧 D1 核心结构未完整升级：KV schema 版本可能已达到旧上限，但 `email` 新字段、`account.name` 等列或 `star` 表仍可能缺失。自动迁移版本提升至 10，按 `PRAGMA table_info` 幂等补齐当前查询所需结构，并避免非重复列错误被静默吞掉后错误提升版本号。
- 新增旧数据库回归测试：从仅含早期基础字段、KV schema 版本为 9 的数据库出发，验证自动迁移补齐全部邮件列表字段、创建 `star` 表，并能直接执行发生线上错误的邮件列表查询。
- 自动迁移已前置到 Hono 全局中间件和定时任务入口，邮件列表无需依赖设置页缓存刷新或人工初始化；迁移异常仍由统一 API 错误处理返回。测试通过真实 Worker 请求触发迁移后再执行邮件列表查询。
- 核心迁移同时补齐早期 `attachments.status/type`；回归数据库加入真实账户和邮件记录，覆盖邮件列表成功返回后继续加载附件的完整路径。
- 自动迁移修复最终复验通过：Worker 6 个测试文件共 26 项用例全部成功，Wrangler 4.110.0 使用测试配置完成前端构建、320 个静态资源读取和部署 dry-run，Git 差异检查无格式错误。
- 发现 Cloudflare Workers Builds 每次执行 `wrangler deploy` 都会把公开版配置视为绑定权威来源，因生产 D1/KV ID 已去敏而删除控制台手工绑定；`keep_vars` 仅保留普通变量，不能保留资源绑定。
- 生产 Wrangler 配置新增不含资源 ID 的 `unsafe.metadata.keep_bindings`，保留普通变量、Secrets、KV、D1、R2 和 Email Sending 绑定，避免自动部署后反复手工重绑。
- Wrangler 4.110.0 debug dry-run 已确认最终上传元数据包含上述 `keep_bindings`，配置解析和打包均通过；由于现有线上绑定已被前一轮部署删除，需要在本修复部署后最后手工绑定一次，后续自动部署将继续保留。
- 修复部署成功且生产 D1/KV 已重新绑定，公开设置接口恢复 200；准备通过下一次真实 Workers Builds 自动部署验证绑定跨部署持久化。
- 提交 `b341357` 触发的真实 Workers Builds 自动部署成功，部署后公开设置接口仍返回 200 且包含有效数据，确认生产 D1/KV 绑定已跨部署保留，不再需要每次手工重绑。
- 首次修复推送后 Cloudflare 已越过原依赖安装阶段但远端检查仍失败；根 `package.json` 补充 `build`、`test`、`deploy` 转发脚本，兼容 Cloudflare 从仓库根目录调用 `pnpm run deploy` 等构建命令。
- 已从仓库根目录执行 `CI=true pnpm run deploy --dry-run`，前端自定义构建、320 个静态资源读取、Worker 打包和生产配置绑定解析均成功完成。
- 第二次远端构建已持续超过首次根工作区冷安装耗时；为避免 Wrangler 自定义构建重复安装前端并在非交互环境等待模块清理确认，三个 Wrangler 配置均改为只执行前端构建。GitHub Actions 同步改为在仓库根目录使用统一锁文件安装一次全部依赖。
- 去除重复安装后，未设置 `CI=true` 的根目录 `pnpm run deploy --dry-run` 也已通过，确认部署流程不再包含交互式依赖重装步骤。
- 最终回归再次通过：根目录测试脚本执行 5 个 Worker 测试文件共 25 项用例，测试 Wrangler 配置 dry-run 成功，GitHub Actions YAML 可正常解析，Git 差异检查无格式错误。

## 生产部署时需要填写或轮换的信息

以下字段不得继续以生产值提交到公开仓库：

- `domain`：填写新的生产收信域名列表；公开仓库中只保留示例。
- `admin`：填写生产管理员邮箱；如该地址涉及隐私，放入不入库的部署变量。
- `jwt_secret`：生成新的高强度随机值，使用 `wrangler secret put jwt_secret` 注入，禁止写回 TOML。
- `database_name`、`database_id`：填写实际 D1 数据库名称和 ID；这些属于基础设施标识，不再提交到公开历史。
- KV namespace `id`：填写实际 KV 命名空间 ID，不再提交到公开历史。
- `bucket_name`：使用 R2 时填写实际 bucket 名称；S3 访问密钥必须使用 Secret。
- Telegram Bot Token、Resend Key、OAuth Client Secret、Cloudflare API Token：全部轮换并通过 Secret 注入。
- `resend_webhook_secret`：从 Resend webhook 配置获取，使用 `wrangler secret put resend_webhook_secret` 注入，否则 webhook 将安全拒绝请求。
- Outlook/Microsoft OAuth：复核回调地址、Client ID；Client Secret 必须轮换并从仓库配置中移除。

推荐把无敏感性的功能开关保留在 `[vars]`，把签名密钥、API Token 和 OAuth Secret 放入 Cloudflare Secret；生产资源 ID、域名和管理员邮箱使用私有部署配置或 CI 环境变量生成，不直接修改并提交公开版 `wrangler.toml`。

## 旧版本安全问题弥补措施

本次升级按“旧版本可能已经被利用”处理，不能只修复代码而保留旧凭据和旧会话。

### 1. 立即止血

- 升级部署完成前，暂时关闭或限制 HTML 邮件正文展示，优先显示纯文本。
- 暂停不必要的全局邮件转发，避免验证码和安全通知继续扩散到其他邮箱。
- 清理不再需要的公开邮件预览链接和永久预览 token。

### 2. 修复存储型 XSS

- 前端所有邮件正文入口统一经过可靠的 HTML 消毒器，禁止内联 `on*` 事件、危险标签和危险 URL 协议。
- `ShadowHtml`、邮箱公开预览、单封邮件公开预览不得直接渲染未消毒 HTML。
- Telegram 邮件 HTML 页面和纯文本模板同时进行服务端消毒或转义。
- 增加 XSS 回归测试，覆盖 `onerror`、`onclick`、`javascript:`、`iframe`、`svg`、`form` 和纯文本 HTML 注入。
- 增加 CSP 等响应头作为纵深防御，但不把 CSP 当作 HTML 消毒的替代品。

### 3. 轮换凭据并使旧会话失效

- 生成新的高强度 `jwt_secret`，通过 Cloudflare Secret 注入，不再提交到仓库。
- 删除 KV 中现存的 `auth-uid:*` 登录会话，强制所有用户重新登录。
- 轮换可能在旧版本或 Git 历史中暴露的 Telegram、Resend、S3、OAuth、Cloudflare API Token 等凭据。
- 管理员邮箱和重要邮箱修改密码、启用 MFA，并检查第三方授权和登录设备。

### 4. 清理公开仓库与 Git 历史

- 当前版本的 Wrangler 配置改为示例值、占位符或环境变量引用。
- 重写所有公开分支和标签中包含生产配置的历史提交。
- 历史重写后强制推送，并通知所有协作者重新克隆，避免旧对象再次被推回。
- 即使历史已清理，旧密钥仍按已泄露处理，不能继续使用。

### 5. 审计可能的入侵痕迹

- 扫描 D1 邮件正文中包含 `onerror=`、`onclick=`、`javascript:`、`iframe`、`svg`、`object`、`embed`、`srcdoc` 等特征的历史邮件。
- 检查 Cloudflare Observability 日志中的异常 IP、异常 User-Agent，以及邮件读取、全部邮件查询、发信、设置修改和预览创建请求。
- 检查系统转发地址、管理员设置、角色权限、用户状态和新增邮箱是否存在未授权变化。
- 核对 Resend、S3/R2、Telegram、OAuth 和 Outlook 账户的访问记录及异常调用。

### 6. 部署后验证

- 使用无害 XSS 样例验证恶意属性被移除且不会读取 `localStorage`。
- 验证旧 JWT 和旧预览链接已经失效。
- 验证普通邮件样式、图片、附件、Outlook 和预览分享功能未因安全修复退化。
- 对生产域名运行安全响应头和依赖漏洞检查，并保存结果作为升级验收记录。
