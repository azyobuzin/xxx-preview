FROM ubuntu:26.04 AS builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    nodejs npm ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ubuntu:26.04 AS base
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app

FROM base AS test
COPY . .
RUN node --test

FROM base AS production
COPY server.mjs ./
COPY lib ./lib
CMD ["/usr/bin/node", "server.mjs"]
