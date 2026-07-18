import MarkdownDoc from '@/components/MarkdownDoc';
import { trainerMd } from '@/content/trainer';

export default function TrainerDocPage() {
  return (
    <MarkdownDoc
      title="Interview Trainer"
      subtitle="8 topics, multi-turn scored coaching, and where sessions get saved."
      markdown={trainerMd}
    />
  );
}
