# M3：开通免费环境与启用同步

当前：账号与同步代码、云函数、部署包已准备；用户尚未创建 CloudBase 环境。网站仍为本地模式，邮箱登录与真实双设备同步尚未启用。不要把模拟测试当作云环境验收。

## 1. 使用你的腾讯云账号创建环境

打开 https://tcb.cloud.tencent.com/ 或控制台 https://console.cloud.tencent.com/tcb ，登录与实名认证由本人完成，不发送身份证、密码、验证码到聊天。

选择明确标为 **免费体验版 / 0 元** 的环境，推荐上海地域。当前官方资源点文档仍列出每月 3,000 点：https://docs.cloudbase.net/quick-start/resource-point 。免费环境有使用和续期限制，不保证长期自动续期。不要选 19.9 元个人版、绑定自动付费升级或购买资源包；若控制台没有免费选项，先保持本地版。

## 2. 控制台配置

- 登录方式启用邮箱验证码，登录模式选允许新用户注册并登录；关闭不需要的匿名登录。
- 安全域名添加网站的来源 `https://87t-28.github.io`，注意同一账号 Pages 的不同项目共用这个来源。
- API Key 中生成 **Publishable Key**（前端公开密钥）。不要使用 Secret Key、SecretId、SecretKey 或登录私钥。
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
```

配置后重新构建/部署。生产 CSP 只额外允许此环境对应的 `环境ID.地域.tcb-api.tencentcloudapi.com`，不泛化放行整个腾讯域名。配置缺失时不会启动云 SDK、收集邮箱或上传学习记录。

## 4. 实际启用前验收

1. 邮箱收到验证码，验证码验证成功；确认服务端函数 uid 与 SDK 会话用户一致。
2. 登录前游客记录只在本机；登录后先读云端并预览，再明确选择合并或保留游客档案。
3. 两台设备登录同一账号，分别学习，重连后两边事件都保留；重复上传不重复累计。
4. 另一个邮箱账号看不到第一账号记录，直接调用数据库应被规则拒绝，伪造 expectedUserId 应失败。
5. 退出后切回游客；离线登录缓存及网络恢复继续同步；未同步记录可加密备份。
6. 注销需要新验证码和确认文字；检查云事件删除、邮箱身份删除、旧会话拒绝上传。

学习目标暂按设备设置，当前同步范围是学习事件与据此重建的进度/错词/统计。登录会话保存在本次标签页 sessionStorage；本机缓存不等于整库加密，共用设备应退出或清除账号缓存。

只有上述真实环境与两设备检查通过，才算 M3 完成。后续 M4 再做更完整的安全、恢复及朋友试用验收。
