# Cloud Mail 本地升级总结

## 升级目标

- 以 `temp/cloud-mail-main` 为源项目最新版基线升级当前项目。
- 保留当前项目已有的 Outlook、邮件预览分享等二改功能。
- 修复排查中确认的邮件 HTML 存储型 XSS 风险。
- 清理 `mail-worker/wrangler.toml` 中的生产隐私信息，并重写相关 Git 分支/标签历史。
- 完成前端构建、Worker 测试和升级差异复核。

## 工作约定

- 每次代码、配置或依赖改动必须同步更新本文档。
- 不覆盖用户已有的 `.gitignore` 修改和 `OUTLOOK_FEATURE_PLAN.md` 删除状态。
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
6. 前端构建、Worker 3 个测试文件共 9 个用例、Wrangler 部署 dry-run 均已通过。

## 仓库所有者仍需执行

1. 在 Cloudflare 控制台或不入库的部署配置中填写新的生产 D1、KV、域名和管理员信息。
2. 轮换 JWT 及所有可能暴露的第三方凭据，执行 `wrangler secret put jwt_secret`，并清除旧登录会话。
3. 审核本地重写后的历史，再使用 `--force-with-lease` 更新远端 `main`、`dev`；本次操作没有自动推送。
4. 通知协作者重新克隆仓库，防止旧对象被再次推回。

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

## 生产部署时需要填写或轮换的信息

以下字段不得继续以生产值提交到公开仓库：

- `domain`：填写新的生产收信域名列表；公开仓库中只保留示例。
- `admin`：填写生产管理员邮箱；如该地址涉及隐私，放入不入库的部署变量。
- `jwt_secret`：生成新的高强度随机值，使用 `wrangler secret put jwt_secret` 注入，禁止写回 TOML。
- `database_name`、`database_id`：填写实际 D1 数据库名称和 ID；这些属于基础设施标识，不再提交到公开历史。
- KV namespace `id`：填写实际 KV 命名空间 ID，不再提交到公开历史。
- `bucket_name`：使用 R2 时填写实际 bucket 名称；S3 访问密钥必须使用 Secret。
- Telegram Bot Token、Resend Key、OAuth Client Secret、Cloudflare API Token：全部轮换并通过 Secret 注入。
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
