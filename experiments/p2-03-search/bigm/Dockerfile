# Evaluation only: runtime is the same immutable PostgreSQL 18.4 image as baseline.
FROM postgres:18.4@sha256:a02db8cac496f15b094798a38254f14d6e00741f709360e5e00bb6668ea31636 AS build

# Extract the exact server SDK without upgrading the builder's server/client
# packages or installing the SDK's optional LLVM toolchain. PGXS bitcode is off.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends gcc make libc6-dev libicu-dev ca-certificates \
    && cd /tmp \
    && apt-get download postgresql-server-dev-18=18.4-1.pgdg13+1 \
    && dpkg-deb --extract postgresql-server-dev-18_*.deb / \
    && rm -f postgresql-server-dev-18_*.deb \
    && rm -rf /var/lib/apt/lists/*

# Official source, release v1.2-20250903, commit
# 735dceba0ecdd8ac1aaaaa207226a7102b6bbd71. Build context contains only this
# public archive and this Dockerfile; never pass the repository as context.
COPY source.tar.gz /tmp/pg-bigm-source.tar.gz
RUN echo 'd67e2acbbd89985ed8b3e22c00d6f65a275c1487f4ab10b132d9b29a2a6d2616  /tmp/pg-bigm-source.tar.gz' | sha256sum --check --status \
    && mkdir /build \
    && tar -xzf /tmp/pg-bigm-source.tar.gz --strip-components=1 -C /build \
    && /usr/lib/postgresql/18/bin/pg_config --version | grep -E '^PostgreSQL 18[.]4([[:space:]]|$)'

WORKDIR /build
RUN make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/18/bin/pg_config with_llvm=no \
    && make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/18/bin/pg_config with_llvm=no DESTDIR=/artifact install \
    && mkdir -p /artifact/usr/share/p203-evaluation \
    && cp LICENSE /artifact/usr/share/p203-evaluation/pg-bigm-LICENSE \
    && { \
      printf 'pg_bigm_release=v1.2-20250903\npg_bigm_commit=735dceba0ecdd8ac1aaaaa207226a7102b6bbd71\n'; \
      /usr/lib/postgresql/18/bin/pg_config --version; \
      gcc -dumpfullversion; \
      make --version | head -n 1; \
      dpkg-query --show --showformat='${Package}=${Version}\n' gcc make libc6-dev libicu-dev; \
      sha256sum /artifact/usr/lib/postgresql/18/lib/pg_bigm.so; \
    } > /artifact/usr/share/p203-evaluation/build-manifest.txt

FROM postgres:18.4@sha256:a02db8cac496f15b094798a38254f14d6e00741f709360e5e00bb6668ea31636
COPY --from=build /artifact/ /
LABEL org.opencontainers.image.title="P2-03 pg_bigm evaluation" \
      org.opencontainers.image.source="https://github.com/pgbigm/pg_bigm" \
      org.opencontainers.image.revision="735dceba0ecdd8ac1aaaaa207226a7102b6bbd71"
RUN postgres --version | grep -E '^postgres [(]PostgreSQL[)] 18[.]4([[:space:]]|$)'
# Preload only inside disposable test containers, e.g. postgres -c
# shared_preload_libraries=pg_bigm. No host/service configuration is changed.
