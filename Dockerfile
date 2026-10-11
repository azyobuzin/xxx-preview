ARG FUNCTION_DIR=/function

FROM ubuntu:26.04 AS builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    nodejs npm libnode-dev build-essential cmake unzip libcurl4-openssl-dev \
    autoconf automake libtool python3 python3-setuptools && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}
COPY package.json package-lock.json ./
RUN npm ci

FROM ubuntu:26.04
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs ca-certificates ffmpeg && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ARG FUNCTION_DIR
WORKDIR ${FUNCTION_DIR}
COPY --from=builder ${FUNCTION_DIR} ${FUNCTION_DIR}
COPY app.mjs ./
COPY lib ./lib
ENTRYPOINT ["/usr/bin/node", "node_modules/.bin/aws-lambda-ric"]
CMD ["app.handler"]
