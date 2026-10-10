import { PageHeading } from '../components/PageHeading'
import { StudySession } from '../components/StudySession'
export function ReviewPage() {
  return <><PageHeading eyebrow="MAKE IT STICK" title="让记忆更长久" description="根据上一次回忆表现，在合适的时间再次相遇。" /><StudySession mode="review" /></>
}
