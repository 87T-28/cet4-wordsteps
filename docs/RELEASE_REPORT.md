# WordSteps 0.2.0 发布记录

日期：2026-10-10（Asia/Shanghai）。阶段：M2。

- 网站：https://87t-28.github.io/cet4-wordsteps/
- 源码：https://github.com/87T-28/cet4-wordsteps
- 首次上线提交：`ed28a34a4a2bbaee164026bb5acce6111d74b15d`
- 首次工作流：https://github.com/87T-28/cet4-wordsteps/actions/runs/38062522193
- 工作流最终状态：success；GitHub Pages 的 build_type 为 workflow。

## 发布验证

GitHub Actions 完成依赖安装、类型检查、ESLint、59 项测试、词库校验、源码隐私检查、生产构建、PWA 校验、生产输出隐私检查和 Pages 部署。实际站点返回 HTTP 200，加载 3,849 个词条。

线上 Service Worker 正确注册于项目子目录。390px 手机视口没有整页横向溢出。其它学习、离线及恢复验收结果在本轮结束前复核，并以聊天最终结果为准。

发布后移除了界面中的完整提交哈希，用户页面仅显示版本号，构建本身继续保留版本追踪。

## 隐私与阶段边界

所有提交使用 GitHub noreply 地址；未上传 Git 凭据、代理配置、node_modules、本机学习记录、备份或 .local 验收材料。凭据由用户完成官方认证，发布配置脚本只在内存中使用，不打印令牌。

这是本机记录优先的学习站点，账号和自动同步尚未接入。换域名或设备需要从旧地址导出备份，再到新地址导入；加密备份需自行保管密码。公开源码和平台访问日志的隐私边界仍见 `PRIVACY_REVIEW.md`。
