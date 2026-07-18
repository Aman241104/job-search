import MarkdownDoc from '@/components/MarkdownDoc';
import { learningDeepDiveMd } from '@/content/learning-deep-dive';

export default function LearningDeepDivePage() {
  return (
    <MarkdownDoc
      title="How the Playlists Feature Works"
      subtitle="A deep dive into the YouTube playlist study RAG pipeline."
      markdown={learningDeepDiveMd}
    />
  );
}
