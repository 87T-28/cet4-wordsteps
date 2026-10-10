# WordSteps 发布记录

## 0.3.0：M3 代码准备

日期：2026-10-11（Asia/Shanghai）。代码已实现邮箱认证、账号隔离、明确的游客合并和事件增量同步，包含 wordsteps-sync 云函数及免费环境配置说明。用户尚无 CloudBase 环境；真实邮箱及两设备验收未完成，M3 仍待启用。

87 项测试、类型检查、ESLint、词库校验、生产构建、PWA 和源码/构建隐私检查通过。无配置生产浏览器验证通过：无邮箱输入或云请求，本地学习、离线恢复及移动布局可用。用测试公开配置验证 .env 文件会生成精确的 CSP 环境来源；测试配置未加入发布包。

源码包与云函数包通过明确文件清单重新生成，不包含本机运行材料、凭据或学习备份。云函数上传包根层含 index.js、index.cjs、service.cjs、word-ids.json、package.json 和 package-lock.json，需由 CloudBase 在线安装依赖。

发布目标仍为下方已有 GitHub Pages 地址，不自动创建云环境。部署结果待本轮实际工作流完成后补充。

## 0.2.0：M2 已上线

日期：2026-10-10（Asia/Shanghai）。阶段：M2。

- 网站：https://87t-28.github.io/cet4-wordsteps/
- 源码：https://github.com/87T-28/cet4-wordsteps
- 首次上线提交：`ed28a34a4a2bbaee164026bb5acce6111d74b15d`
- 首次工作流：https://github.com/87T-28/cet4-wordsteps/actions/runs/38062522193
- 工作流最终状态：success；GitHub Pages 的 build_type 为 workflow。

## 发布验证

GitHub Actions 完成依赖安装、类型检查、ESLint、59 项测试、词库校验、源码隐私检查、生产构建、PWA 校验、生产输出隐私检查和 Pages 部署。实际站点返回 HTTP 200，加载 3,849 个词条。

线上 Service Worker 正确注册于项目子目录。390px 手机视口的首页及六个其它页面没有整页横向溢出。实际未缓存网络请求在断网模拟下失败，同时首页和所有懒加载页面正常打开；断网评分成功保存，刷新后恢复并进入下一未学词。中英文词库搜索、加密备份默认值和新版更新后的记录保留均通过，未发现页面脚本异常。

最终应用代码提交：`310c44def884f366bbaed0bf2a2c18436b6abc2f`；对应工作流：https://github.com/87T-28/cet4-wordsteps/actions/runs/38062863191 ，构建与部署均为 success。后续仅补充验收文档，应用代码保持此版本。

发布后移除了界面中的完整提交哈希，用户页面仅显示版本号，构建本身继续保留版本追踪。

## 隐私与阶段边界

所有提交使用 GitHub noreply 地址；未上传 Git 凭据、代理配置、node_modules、本机学习记录、备份或 .local 验收材料。凭据由用户完成官方认证，发布配置脚本只在内存中使用，不打印令牌。

这是本机记录优先的学习站点，账号和自动同步尚未接入。换域名或设备需要从旧地址导出备份，再到新地址导入；加密备份需自行保管密码。公开源码和平台访问日志的隐私边界仍见 `PRIVACY_REVIEW.md`。
