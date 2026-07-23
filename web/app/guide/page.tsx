import MarkdownDoc from '@/components/MarkdownDoc';
import { userGuideMd } from '@/content/user-guide';

export default function GuidePage() {
  return (
    <MarkdownDoc
      title="Guide"
      subtitle="How to use JobOS — every feature, explained."
      markdown={userGuideMd}
      backHref="/dashboard"
      backLabel="Dashboard"
    />
  );
}
