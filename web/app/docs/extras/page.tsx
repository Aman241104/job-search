import MarkdownDoc from '@/components/MarkdownDoc';
import { extrasMd } from '@/content/extras';

export default function ExtrasDocPage() {
  return (
    <MarkdownDoc
      title="Legitimacy, Contacts, Stories & Books"
      subtitle="Four smaller features: posting legitimacy check, contact discovery, the STAR story bank, and the PDF book library."
      markdown={extrasMd}
    />
  );
}
