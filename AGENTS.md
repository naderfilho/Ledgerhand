# Working in this repository

Written for whoever arrives next, human or otherwise. It is not a tour of the
codebase -- [`README.md`](README.md) is that, and [`docs/adr`](docs/adr) is the
reasoning behind it. This is the shorter list: the rules here that are enforced
by a test rather than by convention, and which therefore cost an afternoon to
discover by breaking the build.

## The one idea behind most of the rules

**Nothing that can be counted is written down.** Test counts, coverage, the
number of operations each role may run, the eval rates: every one of them is
read from the artefact that produced it, and a check fails the build when a
copy drifts. That is the subject of the repository as much as the agent
boundary is, so a hand-typed figure is not a small mistake here -- it is the
thing the README spends four hundred lines arguing against.

If you are about to type a number into prose or into JSX, stop and find where
it is measured.

## Before you commit

```bash
docker compose -f docker/compose.yml up -d postgres-test   # once per machine
pnpm verify
```

`pnpm verify` is exactly what CI runs: build, format, lint, type-check, tests
with coverage, and the documented-figures check. Nothing else is a green build.

Two things about it are worth knowing in advance.

**`counts:check` will fail after almost any change that adds a test**, and the
fix is `pnpm counts`, which rewrites `README.md` and `docs/metrics/tests.json`
from the run that just happened. Commit those with your work.

**`pnpm counts` refuses a run that skipped the integration tests.** Without
Postgres on 5433, eighteen tests skip themselves, and the figures that come
back are all true about that run and all wrong about the README. Start the
container; do not work around the refusal.

## Things that will fail in ways the error message does not fully explain

**The public page cannot say anything the README does not.** Every English
sentence in `apps/web/src/content/landing.en.ts` is compared against
`README.md`, whole, with whitespace flattened. Not a reworded clause, not a
fixed typo. **To change a sentence on the page, change the README first** and
copy it across. See [ADR-0013](docs/adr/0013-the-public-page-is-generated-from-the-same-artefacts.md).

**The architecture diagram exists twice and is compared.** The README's
` ```mermaid ` block is parsed and matched against the SVG in
`apps/web/src/components/site/architecture.tsx`, down to the labels. Add an
arrow in one and you must add it in the other. The parser throws on any Mermaid
syntax it was not taught, deliberately: a checker that shrugs at what it does
not understand checks nothing.

**`packages/agent` may not import `packages/db`.** Nor may `packages/domain`
import a framework, a driver or the filesystem, nor may `packages/mcp-server`
outside its `runtime` and `bin` know that a database exists. These are
`no-restricted-imports` rules in `tooling/eslint-config`, each with the reason
in its own message. They are the reason "the agent never holds database
credentials" is a property of the dependency graph rather than a promise.

**The current time and randomness come from injected ports.** `Date.now()`,
`new Date()` and `Math.random()` are lint errors. Composition roots may opt out
with an `eslint-disable-next-line` and a reason; nothing else may.

**Money is never a float.** Integer cents for money, thousandths for
quantities, millionths for unit prices, all as scaled `bigint`. See
[ADR-0003](docs/adr/0003-fixed-point-arithmetic.md).

## The eval suite costs real money

`packages/evals` is the only thing here that calls a paid API. Everything else
runs without `ANTHROPIC_API_KEY`.

```bash
pnpm evals                 # one run per scenario, cheap
pnpm evals:record          # the published table: k=3 guardrails, k=10 capabilities
```

`evals:record` was thirty-nine runs, about US$ 1.30 and roughly ten minutes
the last time it ran. It writes `docs/metrics/evals.json` and then rewrites
the README's table from it, so the suite, the README and the public page can
never hold three opinions about one measurement. **Do not run it to check that
a refactor compiles.** CI runs the suite at k=1 on every push, which is what
catches a broken guardrail.

Paths passed to the eval binary resolve against the directory you typed the
command in, not the package. That is deliberate and was learned the expensive
way: a relative path used to aim inside `packages/evals` and only failed after
the suite had finished spending.

## Next.js

`apps/web` runs Next 16, which differs from most training data and from most
answers online. **Read `node_modules/next/dist/docs/` before writing anything
framework-shaped**, and take deprecation warnings from the build seriously --
`middleware` is now `proxy`, and that one was caught by reading rather than by
remembering.

`next dev` writes its own `apps/web/AGENTS.md` saying the same thing. That file
is generated, tool-managed and git-ignored; this one is neither, which is why
the rules that matter live here.

## Two rules about the public page in particular

It performs **no work per visitor**: no session, no database, no API call. Every
fact on it is a compile-time import. If you find yourself needing a query to
render it, you are about to make a page that costs money to be linked from
somewhere.

And it is bilingual by route -- `/` and `/pt` -- rather than by cookie, because
a cookie does not travel in a link. What the _system_ emits is not translated:
the approval prompt, the refusal and the replay notice reach a person in
English, so a Portuguese page showing them translated would be quoting a
message nobody is ever sent.

## Commits

[Conventional Commits](https://www.conventionalcommits.org). The body is for
the reasoning -- what was considered and rejected, what the change makes
impossible -- because the diff already says what changed. Do not add
`Co-Authored-By` trailers for tools.
