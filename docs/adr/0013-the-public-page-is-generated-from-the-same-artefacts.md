# 13. The public page is generated from the same artefacts as the README

- Status: accepted
- Date: 2026-08-27

## Context

`ledgerhand.cloud` opened on a sign-in form. Not by routing -- the login was
already at `/sign-in` -- but because `/` was the authenticated dashboard and it
redirected. Somebody arriving from a link met a password field and left, and
every argument this repository makes stayed in the README, on GitHub, where
that reader was never going to look.

The obvious fix is a landing page. The obvious way to build one is to write the
argument out again in JSX, and that is the failure this repository spends its
README arguing against: a second copy of a claim drifts from the first the day
after it is written. The README already carries figures nobody types -- the test
counts, the coverage, the operations per role -- and a page that quoted them by
hand would reintroduce the exact problem `scripts/sync-counts.ts` exists to
solve, one layer up.

There is also a language problem the application had already solved for itself,
in a way that does not survive contact with a public page. Every screen keeps
its language in a cookie, justified in `lib/i18n.ts` on the grounds that no
screen is indexed and none is shared as a URL. Both halves of that stop being
true for a page whose purpose is to be pasted into a post.

## Decision

**`/` is public and the dashboard moves to `/dashboard`.** The login stays at
`/sign-in`: it is already the Auth.js `pages.signIn`, and renaming it would buy
a redirect and nothing else. Authentication stays where it was, in
`requireSession`, which every page and every Server Action already goes
through; `proxy.ts` stamps the request path on a header and decides nothing, so
a route added tomorrow is protected by construction rather than by being
remembered in a matcher.

**Every number is computed where it is rendered.** The operations per role come
from the use case registry, filtered by the same predicate the MCP server
applies when it decides what to advertise. The rates come from
`docs/metrics/evals.json`, which `pnpm evals --summary` writes and `pnpm counts`
rebuilds the README's table from. A test asserts that neither content file
contains those digits at all.

**The English prose is the README's, checked sentence by sentence.**
`content/landing.test.ts` compares each string on the page against `README.md`
with whitespace flattened, because the README hard-wraps and the page does not.
That is the only difference allowed: not a reworded clause, not a fixed typo. A
sentence worth changing gets changed in the README first.

**Portuguese is a parallel file, and what the system emits is not translated.**
The page roughly triples the volume of translated prose, and the shared
dictionary is keyed by English sentences -- right for interface labels, wrong
for four paragraphs of argument. The approval message, the refusal and the
replay notice stay in English in both, because that is how a person actually
receives them; translating them would show somebody a message nobody is sent.

**The landing carries its language in the path: `/` and `/pt`.** A cookie
cannot travel in a link, and `hreflang` cannot describe a page that decides its
own language after the request arrives. Everywhere behind a session keeps the
cookie; `currentLanguage` lets the path win where the path declares one, so the
document cannot be marked `lang="pt"` around English text.

**The architecture diagram is drawn twice and compared.** Mermaid bakes its
colours in, and this site picks a theme with a class rather than from
`prefers-color-scheme`, so a rendered image would be right in one theme and
wrong in the other. `lib/mermaid.ts` reads the README's block, the SVG declares
the same nodes and edges as data, and a test compares them down to the labels.

## Consequences

- Editing the argument in one place and not the other fails the build, which is
  the point. It also means the README is the place to draft: a sentence that
  only makes sense on the page has to earn a home in the README first.
- The page performs no work per visitor. No session, no database, no API --
  every fact is a compile-time import, including the recording, which is
  imported from `docs/demo.svg` rather than copied into `public/`, so the build
  guarantees the two are the same file.
- The page renders on the server rather than being prerendered, because the
  root layout reads the language cookie for the application's sake. It reads
  nothing else, so the cost is a render with no I/O.
- Two social cards are generated at build time, one per language, from the same
  registry and the same eval summary. A social card is exactly the artefact
  nobody thinks to update.
- The palette now has a contrast test. Writing it found one real failure: the
  guardrail verdict was rendered in `--positive`, which reaches 3.99:1 on the
  light ground where ordinary text needs 4.5.

## Alternatives considered

- **Parse the README at build time and generate the page from it.** Impossible
  to drift by construction, and it would tie the page's design to the
  structure of a markdown file. The verbatim test gives the same guarantee --
  the build breaks either way -- for a tenth of the machinery and none of the
  coupling.
- **Render the Mermaid to SVG with `mermaid-cli` and commit it.** More faithful
  to the source, a three-hundred-megabyte devDependency, and still one image
  for two themes.
- **Make `/` and `/pt` genuinely static.** It would mean taking `cookies()` out
  of the root layout and deriving the language from the route for all
  twenty-one pages. Real SEO value, paid for by refactoring the whole
  application on behalf of one page.
- **Leave the argument in the README and link to it.** It is what the sign-in
  screen did. It sends the one reader who was persuaded enough to click away to
  a different site.
