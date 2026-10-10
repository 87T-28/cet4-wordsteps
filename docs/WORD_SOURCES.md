# 词库来源、许可与可复现处理

本阶段使用 ECDICT 基础 CSV 的完整 `cet4` 标签子集。不是最新官方四级大纲的独立认证词表。

## 来源与许可

- 上游：https://github.com/skywind3000/ECDICT
- 固定提交：`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- 文件：`ecdict.csv`，共 770,611 条记录；含独立 `cet4` 标签 3,849 条。
- 上游仓库的 LICENSE 为 MIT，版权声明 `Copyright (c) 2025 Linwei`，已原样保留在 `public/licenses/ECDICT-MIT.txt`，随静态站点分发。
- 上游 README 明确把仓库描述为免费英汉词典数据库，并说明 `tag` 为以空格分隔的考试标签、`translation` 为中文释义、`phonetic` 主要为英式音标。
- 上游 README 记录了词库由多个历史资料和贡献汇集。此处依据该版本上游发布的许可证使用，没有独立审计每个历史来源的权利链；不据此声称商业词典、音频或外部例句均获授权。
- 未复制其它项目代码、商业词典音频或第三方例句。语音来自设备 Web Speech API。6 个补充例句是本项目自编，存放在 `src/data/sampleWords.ts`，不改变上游词义。

## 处理规则

`scripts/import-ecdict.mjs` 固定提交及源文件 SHA-256。仅选择标签列表中完整等于 `cet4` 的记录，不使用子串匹配；包括词表内缩写。大小写规范为小写，永久 ID 为 `ecdict:<规范词形>`，不随词库顺序变化。

处理中文/英文释义中的文本换行、音标分隔符，按当代词频 `frq`、BNC 词频回退排序；无词频条目排后。不会生成不存在的音标或例句。

当前校验结果：

| 项目 | 结果 |
| --- | --- |
| 导入词数 | 3,849 |
| 拒绝条目 | 0 |
| 重复 ID / 空中文释义 | 0 |
| 缺失音标 | 12（界面明确显示“暂无音标”） |
| JSON 体积 | 1,756,659 字节 |
| 原 CSV SHA-256 | `1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf` |
| 输出 JSON SHA-256 | `853a4cd1de304eb66b729b5db302d3a78f348f992002e10ad96772c3591a6b9f` |

`public/data/manifest.json` 保存完整结果，`public/data/cet4.json` 是浏览器加载的词库。缺失音标与来源质量仍需人工校对，标签数量不能证明符合全部最新考试要求。

## 复现

```sh
npm ci
npm run data:import
npm run data:check
```

导入脚本使用 Node.js 24 的公开下载接口。源 CSV 缓存在忽略的 `.local/source/`，未提交 770,611 条全量数据。若本机 Node 网络客户端无法下载，可使用 PowerShell 获取同一固定版本的 CSV 和 LICENSE，再运行导入脚本；源 CSV 校验和不匹配会立即拒绝处理。

```powershell
New-Item -ItemType Directory -Force .local/source,public/licenses
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/ecdict.csv' -OutFile '.local/source/ecdict.csv'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/skywind3000/ECDICT/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b/LICENSE' -OutFile 'public/licenses/ECDICT-MIT.txt'
npm run data:import
npm run data:check
```
