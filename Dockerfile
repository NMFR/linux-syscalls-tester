FROM debian:buster-20200422 AS tools
WORKDIR /tests
RUN apt-get update && \
  apt-get install -y \
  git=1:2.20.1-2+deb10u3 \
  make=4.2.1-1.2 \
  autoconf=2.69-11 \
  m4=1.4.18-2 \
  pkg-config=0.29-6 \
  build-essential=12.6 && \
  git clone --depth 1 https://github.com/linux-test-project/ltp.git -b 20200120 && \
  cd ltp && \
  make autotools && \
  ./configure && \
  make && \
  make install

FROM node:14.2.0-buster AS production
WORKDIR /tests
ENV LOG_FILE_PATH /tests/syscalls-tests.log
COPY --from=tools /opt/ltp /opt/ltp
COPY src /tests/src
CMD ["bash", "-c", "(/opt/ltp/runltp -f syscalls -Q -q -l $LOG_FILE_PATH || exit 0) && node src/index.js"]
