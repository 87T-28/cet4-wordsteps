# M3：开通免费环境与启用同步

当前：用户已创建上海免费体验环境。两个集合的 ADMINONLY 权限、事件索引和 wordsteps-sync 云函数已部署，邮箱来源已开启并允许自动注册，客户端最大同时在线设备数已调整为 2，套餐仍为 baas_trial / 基础客户端等级。CloudBase 默认测试域名已发布 0.3.1 邮箱登录入口，真实邮件送达、验证码登录、首次同步及电脑学习记录重试上传已由用户确认；跨设备事件、离线重试及两账号隔离仍待验收。

## 1. 使用你的腾讯云账号创建环境

打开 https://tcb.cloud.tencent.com/ 或控制台 https://console.cloud.tencent.com/tcb ，登录与实名认证由本人完成，不发送身份证、密码、验证码到聊天。

选择明确标为 **免费体验版 / 0 元** 的环境，推荐上海地域。当前官方资源点文档仍列出每月 3,000 点：https://docs.cloudbase.net/quick-start/resource-point 。免费环境有使用和续期限制，不保证长期自动续期。不要选 19.9 元个人版、绑定自动付费升级或购买资源包；若控制台没有免费选项，先保持本地版。

## 2. 控制台配置

- 登录方式启用邮箱验证码，登录模式选允许新用户注册并登录；关闭不需要的匿名登录。平台要求先配置发件人：使用默认邮件服务时按控制台设置发件地址；若选择自定义 SMTP，由本人在控制台填写授权码。发件地址、SMTP 密码和验证码不进入前端或源码。
- 2026-10-11 实测免费体验版添加 GitHub Pages 安全域名被拒绝，返回 OperationDenied.FreePackageDenied。不要升级付费套餐，也不要绕过该限制。使用环境已经允许的 CloudBase 默认测试域名作为云登录测试入口，GitHub Pages 保留本地模式。
- 选择当前环境后，打开 **API Key 管理**：https://tcb.cloud.tencent.com/dev#/env/apikey 。官方身份认证文档列出此入口：https://docs.cloudbase.net/service/authentication 。部分 SDK 文档的旧链接 identity/token-management 现在会打开“登录态配置”；该页面的 Access Token、Refresh Token 不是需要的公开密钥。
- 在 API Key 管理中生成明确标为 **Publishable Key**（客户端公开密钥）的项。不要使用服务端 API Key、Secret Key、SecretId、SecretKey 或登录私钥。若页面展示已有公开密钥，先使用已有值，不随意重新生成。
- 按 `cloudfunctions/README.md` 创建两集合、禁止客户端直接读写、建立索引、部署 wordsteps-sync 云函数。函数包包含 package.json，选择在线安装依赖。
- 确认邮箱能力在所选免费环境可用；如控制台提示付费或升级，不启用这条路径。

本机上传包位于 `.local/wordsteps-sync.zip`。重新生成时先运行 `npm run cloud:prepare`，再执行 `powershell -File scripts/package-release.ps1`；ZIP 根层已有 index.js 和 package.json，不需要上传项目全部源码。

## 3. 提供最少的公开配置

只需要环境 ID、地域和 Publishable Key。邮箱账号由你或朋友在网页中自行登录，不复用开发工具读取到的账号邮箱。

本地可复制 `.env.example` 为 `.env.local`，仅填写这三个公开值。线上使用仓库 Settings → Secrets and variables → Actions → Variables：

```text
VITE_CLOUDBASE_ENV_ID
VITE_CLOUDBASE_REGION
VITE_CLOUDBASE_PUBLISHABLE_KEY
VITE_CLOUDBASE_ENABLED
```

后台和发件人设置完成后，把 VITE_CLOUDBASE_ENABLED 设为 true，再构建/部署。仅提供三项公开配置不自动开通登录。构建和网页共享公开密钥声明校验，拒绝服务端密钥、个人登录令牌、环境/地域不符和过期值；由平台验证签名。启用时 CSP 只额外允许本环境的区域 API（环境 ID.地域.tcb-api.tencentcloudapi.com）和认证网关（环境 ID.api.tcloudbasegateway.com）两个精确来源。未激活时连接仅限同源，不启动云 SDK，也不提供邮箱输入。

遇到 unreachable 时先检查网络、生产页 CSP 及浏览器的 securitypolicyviolation 事件。SDK 3.10.2 的验证码请求实际使用上述认证网关；只放行区域 API 会被浏览器拦截。该错误本身不能证明发件人或 SMTP 配置有误。刷新或点击“更新并刷新”加载新版后，再由本人发送验证码；仅报告安全错误代码，不发送密码、SMTP 授权码或验证码。

默认域名使用 `/wordsteps/` 子目录，构建时设置 VITE_BASE_PATH=/wordsteps/，使用 hosting deploy 上传 dist 到 wordsteps，保留平台已有的 __auth 和 cloud-admin 文件，禁止 prune 整个托管空间。Service Worker 仅管理 wordsteps 子目录。首次测试域名提醒由平台显示；确认后若回到首页，点“账号”。通过加密备份迁移旧地址的本机记录。

## 4. 实际启用前验收

1. 邮箱收到验证码，验证码验证成功；确认服务端函数 uid 与 SDK 会话用户一致。
2. 登录前游客记录只在本机；登录后先读云端并预览，再明确选择合并或保留游客档案。
3. 两台设备登录同一账号，分别学习，重连后两边事件都保留；重复上传不重复累计。
4. 另一个邮箱账号看不到第一账号记录，直接调用数据库应被规则拒绝，伪造 expectedUserId 应失败。
5. 退出后切回游客；离线登录缓存及网络恢复继续同步；未同步记录可加密备份。
6. 注销需要新验证码和确认文字；检查云事件删除、邮箱身份删除、旧会话拒绝上传。

学习目标暂按设备设置，当前同步范围是学习事件与据此重建的进度/错词/统计。登录会话保存在本次标签页 sessionStorage；本机缓存不等于整库加密，共用设备应退出或清除账号缓存。

登录态配置中的“最大同时在线设备数”也影响验收。本环境已读取确认值为 2，客户端等级仍为基础等级、环境仍为免费体验版；其它环境需自行核对，不保证规则长期不变。Access Token、Refresh Token 不作为部署配置收集。

只有上述真实环境与两设备检查通过，才算 M3 完成。后续 M4 再做更完整的安全、恢复及朋友试用验收。
