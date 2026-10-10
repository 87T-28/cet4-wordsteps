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

erase 先写删除标记，拒绝旧会话继续写入，然后每次删除该 uid 下最多 100 条事件。身份注销在客户端使用新邮箱验证码取得 sudo 令牌后完成。删除后保留不含邮箱、词条和原始 uid 的哈希删除标记，避免旧会话把档案恢复。平台日志和备份的保留规则由平台决定。

本地测试覆盖上述业务规则和事务语义，尚未部署到真实环境；实际数据库权限、索引、函数身份及邮件发送须在配置环境后验收。
