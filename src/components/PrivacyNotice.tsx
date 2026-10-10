import { accountStore } from '../services/cloud/account'
import { useSyncExternalStore } from 'react'
export function PrivacyNotice() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.snapshot)
  return <section className="info-row"><h2>隐私与本机数据</h2><p>{account.user ? '当前账号的学习事件会同步至 CloudBase，包含单词、评分、测试结果、时间和随机设备标识。邮箱和会话由 CloudBase 处理。' : '游客学习记录只保存在当前浏览器，不自动上传。登录前会说明邮箱认证和云同步的数据范围。'} 没有广告或统计追踪。共用浏览器的人可访问保留的本机缓存，退出账号后网页切回游客档案。</p><p>密码加密备份在本机完成，密码不会保存或上传。明文备份包含学习记录与时间，请勿公开分享。清除本机档案不会删除云端或已下载备份；账号模式下清除缓存会同时退出。</p><p>发音只使用浏览器标记为本地的英语语音，没有本地语音时显示音标。访问线上网站时，托管和登录服务仍会处理访问日志；公开 GitHub 仓库和网站地址会关联发布账号的公开用户名。</p></section>
}
