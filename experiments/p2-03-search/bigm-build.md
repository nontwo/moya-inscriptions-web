# Conditional pg_bigm evaluation artifact

This artifact is limited to the observed short-substring gap in the isolated
P2-03 evaluation. It does not install an extension on an accepted service,
modify Catalog data, or select a production search engine. The focused
comparison uses queries q-11, q-12, q-14, and q-26, with q-17 as a
three-character control. Query frequency and sorting cost must remain separate
from index selectivity.

The fixed upstream release is
[pg_bigm v1.2-20250903](https://github.com/pgbigm/pg_bigm/releases/tag/v1.2-20250903),
which declares PostgreSQL 18 support. Its source commit is
`735dceba0ecdd8ac1aaaaa207226a7102b6bbd71`, and its license is the PostgreSQL
License. The upstream archive SHA-256 is
`d67e2acbbd89985ed8b3e22c00d6f65a275c1487f4ab10b132d9b29a2a6d2616`.

The
[fixed-version build and indexing documentation](https://github.com/pgbigm/pg_bigm/blob/v1.2-20250903/docs/pg_bigm_en.md)
specifies PGXS, the `gin_bigm_ops` operator class, and `LIKE`. It requires
library preloading and rechecking for correct results. This experiment keeps
`pg_bigm.enable_recheck=on` and `pg_bigm.gin_key_limit=0`; it does not force the
planner to disable sequential scans. Existing literal-`LIKE` escaping and
business ranking semantics remain unchanged.

## Build isolation and reproducibility

Both stages use the same immutable baseline image:

```text
postgres:18.4@sha256:a02db8cac496f15b094798a38254f14d6e00741f709360e5e00bb6668ea31636
```

This verified artifact is Linux arm64. The Dockerfile extracts the exact
`postgresql-server-dev-18=18.4-1.pgdg13+1` SDK without installing or upgrading
PostgreSQL server/client packages. Only compilation dependencies are installed
in the builder; PGXS LLVM bitcode is disabled. The final stage receives only the
extension library, SQL/control files, license, and a public build manifest.

Prepare a disposable context containing only `Dockerfile` and the public source
archive. Never use the repository or a directory containing data/configuration
as Docker build context.

```sh
p203_build_dir="$(mktemp -d)"
cp experiments/p2-03-search/bigm/Dockerfile "$p203_build_dir/Dockerfile"
curl --fail --location \
  --output "$p203_build_dir/source.tar.gz" \
  https://codeload.github.com/pgbigm/pg_bigm/tar.gz/735dceba0ecdd8ac1aaaaa207226a7102b6bbd71
docker build --quiet --tag p203-pg-bigm-evaluation "$p203_build_dir"
rm "$p203_build_dir/Dockerfile" "$p203_build_dir/source.tar.gz"
rmdir "$p203_build_dir"
```

The Dockerfile checks the source digest and SDK/server version. Compilation
package versions are recorded in the image's
`/usr/share/p203-evaluation/build-manifest.txt`. Compiler packages are resolved
from the official package repositories rather than a frozen package snapshot; a
later build must report its actual versions and image/library hashes, and must
not claim bit-for-bit reproduction from the source pin alone.

Start only a disposable evaluation container, under the same two-CPU/two-GiB
limits as the baseline, with `postgres -c shared_preload_libraries=pg_bigm`.
Create the extension only in its temporary database. Keep the actual server
version at `180004`, and measure this engine sequentially with other engines.

## Verified build and load evidence

The initial compilation failed because the ICU header `ucol.h` was absent. The
builder was corrected by adding `libicu-dev`; this first failure remains part of
the experiment history. The subsequent build and runtime load succeeded.

| Item                                | Observed value                               |
| ----------------------------------- | -------------------------------------------- |
| Runtime server                      | PostgreSQL 18.4, `server_version_num=180004` |
| SDK                                 | PostgreSQL 18.4, Debian `18.4-1.pgdg13+1`    |
| GCC                                 | `14.2.0`; package `4:14.2.0-1`               |
| GNU Make                            | `4.4.1`; package `4.4.1-2`                   |
| C development library               | `libc6-dev=2.41-12+deb13u3`                  |
| ICU development library             | `libicu-dev=76.1-4`                          |
| Extension SQL version / source date | `1.2` / `2025.09.03`                         |
| Recheck / key limit                 | `on` / `0`                                   |
| Image size                          | `161037616` bytes                            |

Image ID:
`sha256:c81ed97fe8c09fcd9f89d5e1e5e6d05ac5a5fa3ff1053ab0a74d345d6c46c592`.

Extension library SHA-256:
`bf5a62ba750bb101d055d50f01e2076f9949aa193cecaa9ec512053250cf70d6`.

A temporary container with no network, no source data, and no exposed database
port loaded the extension. Its GIN index and `LIKE '%行草%'` query returned one
match from two explicitly synthetic rows. The container exited and was removed.
This establishes binary compatibility and basic loading/query execution; it is
not the 100k-document benchmark or an upstream full regression-suite result.
