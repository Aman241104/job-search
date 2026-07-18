import MarkdownDoc from '@/components/MarkdownDoc';
import { trackerMd } from '@/content/tracker';

export default function TrackerDocPage() {
  return (
    <MarkdownDoc
      title="Tracker"
      subtitle="The database layer — 17-table schema, dual SQLite/Postgres, Excel export."
      markdown={trackerMd}
    />
  );
}
