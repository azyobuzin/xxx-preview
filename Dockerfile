FROM public.ecr.aws/lambda/nodejs:16
RUN yum install -y ImageMagick tar xz
RUN curl -sSLo ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar -C /opt -xf ffmpeg.tar.xz && \
    rm -f ffmpeg.tar.xz && \
    ln /opt/ffmpeg-*/ffmpeg /usr/local/bin/ffmpeg

ENV NODE_ENV=production
COPY app.js package.json package-lock.json ${LAMBDA_TASK_ROOT}/
RUN npm install

CMD ["app.handler"]
