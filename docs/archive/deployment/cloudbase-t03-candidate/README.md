# CloudBase T03 candidate archive

本目录只保存 historical T03 CloudBase candidate evidence。

- 全部内容均为 non-executable historical record；
- 它不是 current provider decision；
- 它不得作为 API service path 的当前权威；
- 它不得作为 Web runtime target 的当前权威；
- 它不得作为 object storage 或 CDN configuration 的当前权威；
- 它不得作为 active environment variables 的当前权威；
- 它不得用于 production deployment；
- 它不创建、购买、provision 或修改任何真实资源。

Candidate material 当时错误或过时地假设 `services/public-api` 可部署为 HTTP
runtime、Web 可能优先 static hosting、`PUBLIC_CDN_BASE_URL` 是 active
configuration，以及 migration/HTTP entrypoint 尚未实现。这些假设不得带回 active
documentation。

## Archived files

- [`cloudbase-mainland-architecture.md`](cloudbase-mainland-architecture.md)
- [`t03-deployment-checklist.md`](t03-deployment-checklist.md)
- [`t03-rollback-plan.md`](t03-rollback-plan.md)
- [`infra-README.md`](infra-README.md)
- [`infra/cloudbase/README.md`](infra/cloudbase/README.md)
- [`infra/cloudbase/deployment.example.yaml`](infra/cloudbase/deployment.example.yaml)
- [`infra/cloudbase/runtime.env.example`](infra/cloudbase/runtime.env.example)

Current provider-neutral deployment safety 位于
[`docs/deployment/`](../../../deployment/README.md)。
