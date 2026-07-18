import MarkdownDoc from '@/components/MarkdownDoc';
import { applyMd } from '@/content/apply';

export default function ApplyDocPage() {
  return (
    <MarkdownDoc
      title="Applying"
      subtitle="Single-job and batch apply across email, Telegram, and browser pre-fill."
      markdown={applyMd}
    />
  );
}
