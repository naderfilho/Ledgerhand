# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# The ERP, as an image
# ---------------------------------------------------------------------------
# Four stages, for one reason each:
#
#   deps     installs from the lockfile alone, so editing a component does not
#            reinstall the world
#   build    compiles the workspace packages and the Next application
#   tools    keeps the dev dependencies, because migrating and seeding runs
#            TypeScript through tsx
#   runner   carries the standalone output and nothing else
#
# The build context is the repository root: this is a workspace, and the app
# is not buildable without the packages it depends on.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/agent/package.json packages/agent/
COPY packages/evals/package.json packages/evals/
COPY tooling/eslint-config/package.json tooling/eslint-config/
COPY tooling/tsconfig/package.json tooling/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
# Auth.js refuses to build without a secret. This one is a literal placeholder
# and is thrown away: the container reads AUTH_SECRET from the environment at
# run time, and `runner` is built FROM base rather than from this stage, so
# nothing here reaches the shipped image either way. ARG rather than ENV
# because it is an input to the build below, not configuration of an image.
#
# Buildkit warns about it regardless -- SecretsUsedInArgOrEnv matches the
# name, not the value, and fires on ARG just as it does on ENV. The warning
# stays. Silencing it would mean `# check=skip=` at the top of the file, which
# is file-wide, and a rule that no longer watches for a real leaked secret is
# a worse trade than a warning that is wrong about this one line.
ARG AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN pnpm --filter @ledgerhand/web build

FROM build AS tools
CMD ["pnpm", "db:migrate"]

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle already contains the node_modules it needs; static
# assets are not copied by Next itself, as its own documentation warns.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

# Nothing here needs to write to the filesystem, and nothing here needs root.
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
