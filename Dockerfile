FROM buildpack-deps:jammy AS node-download
ENV NODE_VERSION 16.18.0
RUN ARCH=$(dpkg --print-architecture) && \
    if [ $ARCH = amd64 ]; then ARCH='x64'; fi && \
    mkdir /node && \
    curl -fsSLo - "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz" | \
    tar -xJf - -C /node --strip-components=1 --no-same-owner --wildcards --wildcards-match-slash '*/*/**'

FROM buildpack-deps:jammy AS builder
RUN apt-get update && \
    apt-get install -y cmake && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV production
WORKDIR /function
COPY --from=node-download /node /usr/local
COPY package.json package-lock.json ./
RUN npm install

FROM ubuntu:jammy
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates ffmpeg imagemagick && \
    rm -rf /var/lib/apt/lists/*
COPY --from=node-download /node /usr/local
ENV NODE_ENV production
WORKDIR /function
COPY --from=builder /function .
COPY app.js ./
ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]
CMD ["app.handler"]
