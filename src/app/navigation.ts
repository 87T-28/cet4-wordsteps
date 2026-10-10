import { ChartBar, House, Books, GearSix, UserCircle, ArrowsClockwise, Cards } from '@phosphor-icons/react'

export const navigation = [
  { path: '/', label: '今日学习', icon: House },
  { path: '/learn', label: '单词学习', icon: Cards },
  { path: '/review', label: '复习', icon: ArrowsClockwise },
  { path: '/dictionary', label: '词库', icon: Books },
  { path: '/statistics', label: '学习统计', icon: ChartBar },
  { path: '/settings', label: '设置', icon: GearSix },
  { path: '/account', label: '账号', icon: UserCircle },
] as const
