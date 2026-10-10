# GitHub Pages 免费测试部署

## 当前状态

隐私加固完成后，用户继续授权发布。网站已通过 GitHub Pages 发布，使用 noreply 提交作者地址，详见 `PRIVACY_REVIEW.md` 和 `RELEASE_REPORT.md`。

线上地址：https://87t-28.github.io/cet4-wordsteps/

源码仓库：https://github.com/87T-28/cet4-wordsteps

本地 main 跟踪 origin/main；仓库 Pages 来源为 GitHub Actions，后续推送会自动运行校验并部署。

0.3.0 包含账号和同步代码，但用户尚无 CloudBase 环境，线上仍只保存本机学习记录。启用说明见 `CLOUDBASE_SETUP.md`；环境配置缺失时不提供邮箱输入或云请求。公开用户名关联及平台访问日志仍适用隐私报告中的说明。

## 仓库和 Pages 配置

GitHub Free 的公开仓库可使用 Pages。创建时选择公开，确认词库许可证随源码保留。已有同名仓库时先检查内容，不覆盖其它项目。

源码需要包含 `package.json`、锁文件、`src/`、`public/`、配置文件、空值 `.env.example`、`cloudfunctions/`、`scripts/`、`docs/`、README 和 `.github/workflows/pages.yml`。不要上传 `node_modules/`、`dist/`、`.local/`、.env.local、学习备份或密钥。

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。工作流在 main/master 推送或手动运行时执行：

1. Node.js 24 + `npm ci`。
2. 类型检查、ESLint、全部测试、词库校验、云函数白名单准备、源码隐私检查。
3. 读取 Pages 的 base_path 构建子目录版本。
4. 校验 PWA 清单、图标、应用/词库预缓存和生产输出隐私检查。
5. 上传 dist 并以 GitHub Pages 发布。

Pull request 只执行校验与构建，不部署。源码读取、Pages 发布和 OIDC 权限按 job 单独授予。部署地址取自工作流实际返回值，不能仅据用户名和仓库名推测发布已成功。

## 子目录本地验收

以下命令在 PowerShell 中执行，环境变量只用于当前终端：

```powershell
$env:VITE_BASE_PATH='/wordsteps/'
npm run build
npm run pwa:check
npm run preview:subpath
```

打开 http://127.0.0.1:4188/wordsteps/ ，学习地址为 `/#/learn`，直接刷新有效。停止服务器使用 Ctrl+C。恢复默认构建前删除该终端的临时 `VITE_BASE_PATH`，再 `npm run build`。

默认 `npm run preview` 使用项目根路径；`npm run dev` 不注册离线 Worker，以免旧缓存影响开发。

## 上线后验收

- 工作流实际成功，HTTPS URL 返回页面，资源和词库正常加载。
- 直接打开项目子目录与学习深链接，并刷新。
- 首次在线缓存完成，断网刷新仍能进入所有页面、评分保存和恢复。
- 新版等待确认更新，当前学习不被打断，已保存记录保留。
- 在真实手机检查安装、下载备份与设备语音。模拟浏览器视口不能替代真机验收。

GitHub Pages 仅为免费测试入口。源码公开不等同于公开学习数据：事件存在用户浏览器，不提交仓库。不同域名的数据不能自动迁移，上线前请在旧地址导出 JSON，再在新地址导入。

## M3 启用边界

Pages 工作流只部署前端，不自动部署 CloudBase 云函数或创建收费资源。环境 ID、地域、Publishable Key 使用 Actions Variables；管理密钥禁止进入网页。先部署并验证云函数身份、集合规则及邮箱能力，再设置前端公开变量并重新运行工作流。真实双设备和权限验收通过前，不宣称云同步已经可用。

发布包使用 `powershell -File scripts/package-release.ps1` 生成：源码包 `.local/cet4-wordsteps-source.zip` 与上传用 `.local/wordsteps-sync.zip`。明确列出可公开文件，云函数 ZIP 的入口和 package.json 位于根层，包含锁文件与词 ID 白名单，不含 node_modules 或任何凭据。打包前先运行 cloud:prepare 和 privacy:check。
