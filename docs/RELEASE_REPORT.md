# WordSteps 发布记录

## 0.3.1：免费环境后台与登录测试入口

日期：2026-10-11（Asia/Shanghai）。同步云函数、两个 ADMINONLY 集合及索引已部署到上海免费体验环境，邮箱来源和自动注册已配置，最大同时在线设备数为 2，环境套餐仍为 baas_trial。真实邮箱与已认证用户同步验收待完成。

免费体验环境拒绝增加 GitHub Pages 安全域名，因此 GitHub 入口保留本地模式，云功能使用 CloudBase 默认测试域名的 wordsteps 子目录。默认域名首次进入有平台提醒，确认后可能丢失深链接而回到首页；通过导航进入账号即可。

已通过静态上传一致性校验、移动学习/账号页、Service Worker 子目录作用域和邮箱表单检查。源码与独立构建隐私检查、生产构建、PWA、类型/ESLint、95 项测试通过；新增密钥角色和激活校验、隔离开发云配置的测试环境、PWA 更新竞态回归。云端无用户上下文调用返回 UNAUTHENTICATED。没有代用户发送验证码或上传真实学习档案。

上述后台与激活校验源码提交：`c83af5a0f6283ae4beb7a235d7c50950c04a9ac2`；GitHub Actions：https://github.com/87T-28/cet4-wordsteps/actions/runs/38109499655 ，最终状态 success。

2026-10-11 补充修复邮箱发送 unreachable：生产浏览器复现本环境认证网关被 connect-src 拦截，构建策略增加精确网关来源，关闭云功能时保持仅同源连接。安全错误代码诊断不输出原始 SDK 消息。98 项测试、类型检查、ESLint、两模式生产 CSP 对照、云构建/PWA/隐私检查通过；CloudBase wordsteps 子目录上传 28/28 文件且一致性校验通过。真实发信与登录等待本人重试，M3 尚未全部验收。

线上通过正常 PWA 更新加载修复；同一 SDK 的无收件人请求成功抵达认证网关，返回 HTTP 400 / invalid_argument，无 connect-src 拦截和网络失败。此验证仅证明请求连通，不代表真实邮件发送和账号同步已经通过。

认证修复源码提交：`13a7cbe3c4c54dec2829b1aae50e14ae8f3b917e`；GitHub Actions：https://github.com/87T-28/cet4-wordsteps/actions/runs/38110429639 ，构建与部署最终状态 success。GitHub 发布仍保留本地模式。源码包与云函数包已重新生成，排除本机配置、凭据和学习记录。

## 0.3.0：M3 代码准备

日期：2026-10-11（Asia/Shanghai）。代码已实现邮箱认证、账号隔离、明确的游客合并和事件增量同步，包含 wordsteps-sync 云函数及免费环境配置说明。用户尚无 CloudBase 环境；真实邮箱及两设备验收未完成，M3 仍待启用。

87 项测试、类型检查、ESLint、词库校验、生产构建、PWA 和源码/构建隐私检查通过。无配置生产浏览器验证通过：无邮箱输入或云请求，本地学习、离线恢复及移动布局可用。用测试公开配置验证 .env 文件会生成精确的 CSP 环境来源；测试配置未加入发布包。

源码包与云函数包通过明确文件清单重新生成，不包含本机运行材料、凭据或学习备份。云函数上传包根层含 index.js、index.cjs、service.cjs、word-ids.json、package.json 和 package-lock.json，需由 CloudBase 在线安装依赖。

已发布至 https://87t-28.github.io/cet4-wordsteps/ 。应用提交：`052579d6dad1b0f741a1360e07d00efff3a5ea71`；工作流：https://github.com/87T-28/cet4-wordsteps/actions/runs/38068829157 ，最终状态 success。

实际站点返回 HTTP 200。现有离线缓存先显示 0.2.0 的更新入口，通过“更新并刷新”加载 0.3.0。390px 视口的账号页与学习词卡可用，无整页横向溢出；账号页显示“邮箱登录暂未开通”，无邮箱输入。请求只包含网站自身来源，CSP 仍限制同源连接，no-referrer 有效，没有页面脚本异常。此次线上检查未向用户的游客档案写入测试评分；评分和离线恢复已在独立本地测试来源验证。

发布不自动创建或部署 CloudBase 环境。真实登录和同步仍待免费环境配置与验收。

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
