# Provider-neutral deployment checklist

本清单只保存 provider-neutral release
safety。它不选择 provider，不创建资源，也不授权 production
deployment。真实外部操作必须在独立批准后补充 provider、账号、区域、预算、安全、合规与运行目标。

## Authority gate

- [ ] Production
      provider、运行地域、成本上限、账号主体与责任人已由 Owner 明确批准。
- [ ] Production resource
      purchase/provision、domain、certificate、credential 与 secret 操作具有单独授权。
- [ ] Web runtime target 已根据当前 Next.js request-time route
      requirements 验证；不得依据历史 candidate 假设 static hosting。
- [ ] HTTP deployable runtime 指向 `services/backend-production`（组合
      `services/backend-runtime`），不得把 contract-only `services/public-api`
      当作listener。

## Environment and process separation

- [ ] Public Web、Backend Runtime/API、Admin 分别拥有独立 process
      definition；当前本地端口权威为 `3000`、`3001`、`3002`。
- [ ] Production `HOST`、`PORT`、`DATABASE_URL` 与 Web
      `MOYA_PUBLIC_API_BASE_URL` 由受控 runtime configuration 注入。
- [ ] Frontend artifact 不包含 `DATABASE_URL`、object key、bucket、provider
      credential 或 storage configuration。
- [ ] Public Media 只输出 backend resolver 生成的
      `PublicMedia.src`；UI 不推导 URL。
- [ ] Development/Production data
      composition 已验证隔离，Production 不包含 QA、Prototype 或 P5 snapshot
      records。

## Database readiness

- [ ] Target PostgreSQL major/minor 与已验证 compatibility
      baseline 一致，或已有独立 maintenance approval 与完整 test evidence。
- [ ] Backup identifier、restore procedure、RPO/RTO 与负责人已记录并演练。
- [ ] 使用已实现的显式 migration command，成功后才启动 production backend：

```sh
pnpm --filter @moya/catalog-postgres build
DATABASE_URL='postgresql://...' pnpm --filter @moya/catalog-postgres migrate
```

- [ ] Startup 只读验证 required migration ledger，不自动执行 DDL。
- [ ] Schema change 已按 expand/contract compatibility 评审；destructive
      rollback 不是普通应用回滚步骤。

## Release evidence

- [ ] 记录完整 Git SHA、immutable artifact digest、configuration
      revision、target environment 与 previous known-good release。
- [ ] Exact release content 已通过 applicable
      format、lint、typecheck、tests、build、E2E 与 PostgreSQL validation。
- [ ] GitHub diff、exact head、CI、dependencies/lockfile 与 review
      threads 已由 independent reviewer 检查。
- [ ] 同一 immutable artifact 先在获批 non-production
      environment 验证，再晋级；不在 Production 重新构建。
- [ ] Migration、application release 与 traffic
      change 是可观测、可停止、可独立记录的 steps。

## Post-release checks

- [ ] Web、Public API 与 database readiness 返回预期结果。
- [ ] `GET /v1/catalog` 与 detail 只返回 truthful Production data 和 resolved
      runtime media URLs。
- [ ] Error rate、latency、process restarts、database connections 与 resource
      saturation 在批准阈值内。
- [ ] Logs/metrics 可关联 release SHA，且不包含 credential、connection
      string 或 private data。
- [ ] 发布记录保存实际 artifact/configuration、验证 evidence 与 final traffic
      state。

若任一 mandatory item 不能证明，停止 release；按
[rollback principles](rollback-plan.md) 恢复 previous known-good
state 或升级为 incident response。
