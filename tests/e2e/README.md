# Formal Web browser regression harness

This directory contains the deliberately small T02P browser regression harness.
It starts the actual Formal Web together with a test-only deterministic Public
API stub and exercises stable capabilities without injecting fixture data into
Product code.

The Formal Web starts from a temporary mirror so Next.js development-generated
files stay outside the repository. Product source, prototype files, and
installed workspace dependencies remain the runtime inputs.

Run the suite from the repository root:

```sh
pnpm test:e2e
```

Install the two required browser engines once before the first local run:

```sh
pnpm --filter @moya/tests exec playwright install chromium webkit
```

The initial matrix is Desktop Chromium, Mobile WebKit, and Tablet WebKit. The
suite intentionally avoids pixel snapshots, animation constants, exact DOM
shape, and gesture-physics assertions.
