import MarkdownDoc from '@/components/MarkdownDoc';
import { jobFinderMd } from '@/content/job-finder';

export default function JobFinderDocPage() {
  return (
    <MarkdownDoc
      title="Job Finder"
      subtitle="14 sources, dedup, and the two-phase keyword + AI scoring pipeline."
      markdown={jobFinderMd}
    />
  );
}
