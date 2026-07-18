import MarkdownDoc from '@/components/MarkdownDoc';
import { architectureMd } from '@/content/architecture';

export default function ArchitecturePage() {
  return (
    <MarkdownDoc
      title="System Architecture"
      subtitle="How the frontend, backend, database, and AI providers all connect."
      markdown={architectureMd}
    />
  );
}
