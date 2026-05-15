/**
 * Renders the text of a single assistant message part as markdown,
 * smoothing out broken markdown mid-stream so partial chunks don't
 * flicker. Reuses our MUI-flavored components map from
 * `markdownComponents.tsx` so the look matches the rest of the app.
 */

import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { markdownComponents } from '@/features/ai/chat/markdownComponents';

export function MarkdownText() {
  return <MarkdownTextPrimitive smooth components={markdownComponents} />;
}
