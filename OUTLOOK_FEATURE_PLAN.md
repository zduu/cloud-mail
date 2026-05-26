# Outlook 邮箱管理功能计划

## 核心目标

在 cloud-mail 中增加一个独立的 Outlook 邮箱管理入口。用户输入 Outlook 账号信息后，可以管理对应 Outlook 邮箱。

账号输入格式：

```text
邮箱----密码----client_id----refresh_token
```

其中核心调用依赖 `client_id` 和 `refresh_token` 获取 Microsoft Graph access token，密码字段只按账号资料保存。

## 明确不做

- 不做项目池功能。
- 不引入项目池、任务池、账号分配池等业务概念。
- 不要求管理员权限才能使用 Outlook 邮箱入口。
- 不改造现有 cloud-mail 收发信主流程。

## 已实现范围

1. Outlook 账号管理
   - 新增 Outlook 账号。
   - 支持账号字符串批量填入。
   - 支持单字段填写邮箱、密码、client_id、refresh_token。
   - 支持编辑、删除、连接测试。

2. Outlook 邮件管理
   - 支持收件箱、垃圾邮件、已发送、草稿箱、已删除邮件。
   - 支持邮件列表查看。
   - 支持邮件详情查看。
   - 支持标记已读、未读。
   - 支持附件列表和附件下载。

3. 后端能力
   - 新增 `outlook_account` D1 表。
   - 使用当前登录用户隔离 Outlook 账号。
   - 使用 Microsoft OAuth refresh token 换取 Graph access token。
   - 调用 Microsoft Graph 读取邮件、更新已读状态、读取附件。

4. 前端入口
   - 侧边栏新增 `Outlook 邮箱`。
   - 新增 `/outlook` 页面。
   - 页面聚焦账号录入和邮箱管理。

## 验证记录

- `pnpm --prefix mail-vue build` 通过。
- `pnpm --prefix mail-worker exec wrangler deploy --config wrangler-test.toml --dry-run` 通过。
- 本地未登录访问 `/api/outlook/account/list` 返回 401，鉴权正常。
- 本地保存 Outlook 测试账号成功。
- 使用无效 refresh token 测试连接时，后端已实际调用 Microsoft token 接口并返回 token 错误。

## 后续可选项

- 对 `refresh_token` 做加密存储。
- 使用真实 Outlook 账号字符串做端到端验证。
