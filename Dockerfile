ARG FUNCTION_DIR=/function

FROM buildpack-deps:jammy AS node-download
COPY .tool-versions ./
RUN NODE_VERSION=$(awk '$1 == "nodejs" { print $2 }' .tool-versions) \
    ARCH=$(dpkg --print-architecture) && \
    if [ $ARCH = amd64 ]; then ARCH='x64'; fi && \
    mkdir /node && \
    curl -fsSLo - "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz" | \
    tar -xJf - -C /node --strip-components=1 --no-same-owner --wildcards --wildcards-match-slash '*/*/**'

FROM buildpack-deps:jammy AS builder
RUN apt-get update && \
    apt-get install -y cmake && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}
COPY --from=node-download /node /usr/local
COPY package.json package-lock.json ./
RUN npm ci

FROM ubuntu:jammy
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/*
COPY --from=node-download /node /usr/local
ENV NODE_ENV=production
ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}
COPY --from=builder ${FUNCTION_DIR} ${FUNCTION_DIR}
COPY app.mjs ./
COPY lib ./lib
ENTRYPOINT ["/usr/local/bin/node", "node_modules/.bin/aws-lambda-ric"]
CMD ["app.handler"]
