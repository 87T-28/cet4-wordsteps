# GitHub Pages 免费测试部署

## 当前状态

用户要求先解决隐私问题，现已完成加固并暂停公开发布，详见 `PRIVACY_REVIEW.md`。公开发布会关联公开用户名，提交不得使用登录邮箱作为作者邮箱。

本地源码与 `.github/workflows/pages.yml` 已准备。当前 Git 仓库没有远程地址，GitHub 连接返回的可访问仓库列表为空。尚未选择、新建或推送远程仓库，没有已验证的线上 URL。

用户需明确选择公开仓库（新建 `cet4-wordsteps` 或提供现有仓库地址）。仓库选择问题已发出；预选项不等同于确认。当前阶段不启用账号服务。

## 仓库和 Pages 配置

GitHub Free 的公开仓库可使用 Pages。创建时选择公开，确认词库许可证随源码保留。已有同名仓库时先检查内容，不覆盖其它项目。

源码需要包含 `package.json`、锁文件、`src/`、`public/`、配置文件、`scripts/`、`docs/`、README 和 `.github/workflows/pages.yml`。不要上传 `node_modules/`、`dist/`、`.local/`、学习备份或密钥。

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。工作流在 main/master 推送或手动运行时执行：

1. Node.js 24 + `npm ci`。
2. 类型检查、ESLint、全部测试、词库校验。
3. 读取 Pages 的 base_path 构建子目录版本。
4. 校验 PWA 清单、图标、应用/词库预缓存。
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
