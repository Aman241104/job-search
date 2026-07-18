import MarkdownDoc from '@/components/MarkdownDoc';
import { cvGeneratorMd } from '@/content/cv-generator';

export default function CvGeneratorDocPage() {
  return (
    <MarkdownDoc
      title="CV & Cover Letter Generator"
      subtitle="How a tailored application gets written, refined, and rendered to PDF."
      markdown={cvGeneratorMd}
    />
  );
}
