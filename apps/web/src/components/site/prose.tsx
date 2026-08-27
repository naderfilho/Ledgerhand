import type * as React from 'react'

/**
 * ---------------------------------------------------------------------------
 * The little bit of markdown the page's own words are written in
 * ---------------------------------------------------------------------------
 * The English on this page is the README's English, and a test compares them.
 * That only works if the two are the same string, which means the page has to
 * accept what the README writes: `code`, **emphasis** and [links](to things).
 *
 * Three constructs, no library, and deliberately no more. A general markdown
 * renderer would invite the content file to grow markdown the design has no
 * answer for -- headings inside a paragraph, images, tables -- and the point of
 * keeping the structure in TypeScript is that every block has somewhere to go.
 */

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g

export function Inline({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        const key = `${String(index)}:${part.slice(0, 24)}`

        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
          return (
            <code
              key={key}
              className="rounded border border-border bg-surface-sunken px-1 py-0.5 font-mono text-[0.9em]"
            >
              {part.slice(1, -1)}
            </code>
          )
        }

        if (part.startsWith('**') && part.endsWith('**') && part.length > 3) {
          return (
            <strong key={key} className="font-semibold text-foreground">
              {part.slice(2, -2)}
            </strong>
          )
        }

        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
        if (link?.[1] !== undefined && link[2] !== undefined) {
          return (
            <a
              key={key}
              href={link[2]}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            >
              {link[1]}
            </a>
          )
        }

        return part
      })}
    </>
  )
}

/** A paragraph of the argument, at reading width. */
export function Paragraph({
  text,
  className,
}: {
  readonly text: string
  readonly className?: string
}): React.JSX.Element {
  return (
    <p className={className ?? 'text-[0.9375rem] leading-relaxed text-muted-foreground'}>
      <Inline text={text} />
    </p>
  )
}

/**
 * A message the running system produces, shown the way it arrives.
 *
 * The label is not decoration. A screen reader meeting a block of monospaced
 * text has no way to know it is quoting a terminal rather than reading the
 * page's own voice, so the block is a labelled figure and the label says whose
 * words these are. `role="img"` was the other option and would have been worse:
 * it hides the text, and the text is the entire point of showing it.
 */
export function Terminal({
  label,
  text,
}: {
  readonly label: string
  readonly text: string
}): React.JSX.Element {
  return (
    <figure className="my-4">
      <figcaption className="mb-1.5 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </figcaption>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-sunken p-4 font-mono text-[0.8125rem] leading-relaxed text-foreground">
        <code>{text}</code>
      </pre>
    </figure>
  )
}
