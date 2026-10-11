# WordSteps 云端部署

`wordsteps-sync/` 是 CloudBase Node.js 云函数。只部署到用户选择的免费体验环境，执行入口 `index.main`，index.js 包装器载入 index.cjs 实现。推荐支持的 Node.js 18 或 20 运行时。

## 前提

1. 建立 `wordsteps_events`、`wordsteps_sync_meta` 两个文档数据库集合。
2. 两集合客户端读写规则设为**禁止客户端访问 / 仅管理端可读写**，参照 `database-security.json`。不要配置“所有用户可读写”。
3. events 集合索引：ownerId 升序 + sequence 升序，支持按账号增量读取；meta 和事件永久 ID 使用服务端哈希，去重不依赖数组位置。
4. 函数通过 CloudBase SDK 调用，不开放匿名 HTTP 触发入口；身份只取平台 `app.auth().getUserInfo()`，忽略客户端声明的 owner。
5. 函数自动使用平台运行身份访问数据库，不需要把腾讯云管理密钥放入函数文件或网页。

准备白名单：`npm run cloud:prepare`。上传 `wordsteps-sync` 包，选择在线安装 package.json 依赖。创建函数名称 **wordsteps-sync**。

## 行为

push 每次最多 50 个事件，在数据库事务中检查冲突、去重并分配账号内顺序。pull 每页最多 200 个，按服务端顺序游标增量读取；复习时间由客户端事件重放计算，不依赖游标时间。

identify 返回平台真实 uid。push/pull/erase 的 expectedUserId 必须与平台 uid 一致，仅用于阻止账号切换过程中的错误归属，绝不把它作为授权来源。匿名调用拒绝。

deletion-request 使用当前访问令牌向平台读取本人身份，与函数平台 UID 比较后通过 CUR_USER 创建重新认证挑战，不依赖主邮箱资料字段；deletion-authorize 由服务端再次检查身份、校验新的验证码并取得平台 sudo 证明后才签发 5 分钟短期许可。挑战绑定账号、最多 5 次尝试、验证后不可重放，服务端只保存许可哈希。

erase 每页都要求有效的本人短期许可，直接调用、伪造确认或过期许可均拒绝；开始后写删除标记，拒绝旧会话继续写入，每次最多删除本人 100 条事件。最后一页清除挑战 ID，保留哈希删除标记和短期重试许可的哈希/到期时间。身份注销继续由客户端使用官方 sudo 令牌完成；网页的邮箱验证与最终删除确认分成两步。

运行环境需要 Nodejs20.19（使用内置 fetch）。部署时将公开环境 ID 设置为函数变量 WORDSTEPS_ENV_ID；缺失时在每次调用中从平台 SCF_NAMESPACE 等信息解析。二次验证只请求该环境认证网关，不需要管理员密钥或配置 SMTP 凭据到函数代码。deletion-auth.cjs 已纳入云函数 ZIP。平台日志和备份的保留规则由平台决定。

既有数据库权限、索引、登录与核心同步已经实机确认；新删除授权和最终注销仍待独立实机验收。本地模拟不代替真实两账号权限或注销测试，最新结果见 docs/M3_REPORT.md 与 docs/M4_REPORT.md。
