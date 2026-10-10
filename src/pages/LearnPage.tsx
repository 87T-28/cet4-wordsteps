import { PageHeading } from '../components/PageHeading'
import { StudySession } from '../components/StudySession'
export function LearnPage() {
  return <><PageHeading eyebrow="ONE WORD AT A TIME" title="认识一个新单词" description="先回忆，再确认。每次评分都会保存在本机。" /><StudySession mode="new" /></>
}
