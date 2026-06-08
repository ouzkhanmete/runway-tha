FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN bun install --frozen-lockfile
RUN bun run --cwd apps/web build
WORKDIR /app/apps/web
CMD ["bunx", "vite", "preview", "--host", "--port", "5173"]
