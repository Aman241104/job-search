import MarkdownDoc from '@/components/MarkdownDoc';
import { setupGuideMd } from '@/content/setup-guide';

export default function SetupGuidePage() {
  return (
    <MarkdownDoc
      title="Setup Guide"
      subtitle="How scripts/setup.py works — every account and key, explained."
      markdown={setupGuideMd}
    />
  );
}
