/**
 * MUI renderers for every markdown element MarkdownTextPrimitive emits.
 * Centralized here so the "what does AI markdown look like" answer lives
 * in one auditable file.
 *
 * Headings step down from h6 → h2 (matches the rest of the app where the
 * top-level "Coach" header is h1 and section labels are h2). Inline code
 * gets a subtle plate-style chip; fenced code blocks render as a
 * monospace pane with a horizontal scroll guard and a copy affordance
 * baked into the `CodeHeader` override.
 */

import { Box, Link, Typography, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { ComponentProps, PropsWithChildren } from 'react';
import { useIsMarkdownCodeBlock } from '@assistant-ui/react-markdown';

const PROSE: ComponentProps<typeof Typography> = {
  variant: 'body1',
  sx: { my: 0.5 },
};

function P({ children }: PropsWithChildren) {
  return <Typography {...PROSE}>{children}</Typography>;
}

function H({
  level,
  children,
}: PropsWithChildren<{ level: 2 | 3 | 4 | 5 | 6 }>) {
  // h1 from a model would dominate the dialog; cap top-level model
  // headings at h2 so the conversation header stays the largest text.
  return (
    <Typography
      variant={`h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6'}
      sx={{ mt: 1.5, mb: 0.5 }}
    >
      {children}
    </Typography>
  );
}

function UL({ children }: PropsWithChildren) {
  return (
    <Box component="ul" sx={{ pl: 3, my: 0.5, '& li': { mb: 0.25 } }}>
      {children}
    </Box>
  );
}

function OL({ children }: PropsWithChildren) {
  return (
    <Box component="ol" sx={{ pl: 3, my: 0.5, '& li': { mb: 0.25 } }}>
      {children}
    </Box>
  );
}

function LI({ children }: PropsWithChildren) {
  return (
    <Box component="li" sx={{ '& > p': { my: 0 } }}>
      {children}
    </Box>
  );
}

function A({
  href,
  children,
}: PropsWithChildren<{ href?: string }>) {
  return (
    <Link href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </Link>
  );
}

function BQ({ children }: PropsWithChildren) {
  return (
    <Box
      component="blockquote"
      sx={{
        my: 1,
        pl: 2,
        borderLeft: '3px solid',
        borderColor: 'divider',
        color: 'text.secondary',
        '& > p': { my: 0.25 },
      }}
    >
      {children}
    </Box>
  );
}

function HR() {
  return <Box component="hr" sx={{ my: 1.5, border: 0, borderTop: '1px solid', borderColor: 'divider' }} />;
}

/**
 * `code` fires for both inline and fenced code; we discriminate via the
 * markdown package's helper. Inline gets a chip; the fenced version is
 * delegated to `<pre>` (which uses Pre below).
 */
function Code(props: ComponentProps<'code'>) {
  const isBlock = useIsMarkdownCodeBlock();
  if (isBlock) {
    return <code {...props} />;
  }
  return (
    <Box
      component="code"
      sx={{
        px: 0.5,
        py: 0,
        borderRadius: 0.5,
        bgcolor: 'action.hover',
        fontFamily: 'monospace',
        fontSize: '0.92em',
      }}
    >
      {props.children}
    </Box>
  );
}

function Pre({ children }: ComponentProps<'pre'>) {
  return (
    <Box
      component="pre"
      sx={{
        my: 1,
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
        overflowX: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.92em',
        lineHeight: 1.5,
        // The default `code` inside the pre is rendered by react-markdown's
        // own code handler; strip its inline chip styles by overriding here.
        '& code': {
          bgcolor: 'transparent',
          padding: 0,
        },
      }}
    >
      {children}
    </Box>
  );
}

function CodeHeader({ language, code }: { language: string | undefined; code: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1,
        py: 0.5,
        bgcolor: 'action.hover',
        borderTopLeftRadius: theme.shape.borderRadius,
        borderTopRightRadius: theme.shape.borderRadius,
        borderBottom: '1px solid',
        borderColor: 'divider',
        fontFamily: 'monospace',
        fontSize: '0.78em',
        color: 'text.secondary',
        // The Pre directly below should sit flush; cancel its top corners.
        '& + pre': { mt: '0 !important', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
      }}
    >
      <span>{language || 'code'}</span>
      <Box
        component="button"
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
        }}
        aria-label="Copy code"
        sx={{
          all: 'unset',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <ContentCopyIcon sx={{ fontSize: '0.95em' }} />
        copy
      </Box>
    </Box>
  );
}

/**
 * Components map for MarkdownTextPrimitive. The `SyntaxHighlighter` and
 * `CodeHeader` slots are assistant-ui extensions; the rest match the
 * react-markdown components contract.
 */
export const markdownComponents = {
  p: P,
  a: A,
  ul: UL,
  ol: OL,
  li: LI,
  blockquote: BQ,
  hr: HR,
  h1: ({ children }: PropsWithChildren) => <H level={2}>{children}</H>,
  h2: ({ children }: PropsWithChildren) => <H level={2}>{children}</H>,
  h3: ({ children }: PropsWithChildren) => <H level={3}>{children}</H>,
  h4: ({ children }: PropsWithChildren) => <H level={4}>{children}</H>,
  h5: ({ children }: PropsWithChildren) => <H level={5}>{children}</H>,
  h6: ({ children }: PropsWithChildren) => <H level={6}>{children}</H>,
  code: Code,
  pre: Pre,
  CodeHeader,
};
