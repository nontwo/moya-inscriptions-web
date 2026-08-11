# ADR 0005：CatalogKind Top-level Evolution

- 状态：Accepted
- Implementation status：Implemented by T04.3
- 日期：2026-08-11
- 范围：一级Catalog对象域、Public Contract enum与PostgreSQL约束演进
- Supersedes：ADR 0004中把`cliff_inscription`定义为一级`CatalogKind`的部分

## 背景

T04.1冻结的三个值`inscription`、`cliff_inscription`、`calligraphy`
不在同一ontology层级。`cliff_inscription`是碑刻对象的专业类型，而
`inscription`与`calligraphy`描述canonical Catalog
object本身所属的对象域。继续把三者作为同层enum会把稳定一级分类与未来可扩展专业taxonomy混合。

当前没有获批外部consumer或production Catalog
record需要保留旧三值contract，因此Owner批准在T04.3执行一次原子contract-evolution
checkpoint。

## 决策

一级`CatalogKind`精确且只允许：

```text
inscription
calligraphy
```

语义如下：

- `inscription`：canonical
  object是碑刻。摩崖、碑、墓志等专业类型，以及碑刻所含的书法价值，都不改变其一级Kind。
- `calligraphy`：canonical
  object本身是独立书法作品，而不是“具有书法属性”的碑刻。

`cliff_inscription`从一级`CatalogKind`退役。它未来应位于：

```text
CatalogKind = inscription
CatalogType = cliff_inscription
```

上述`CatalogType`关系在本checkpoint只表达长期语义方向。T04.3不定义或实现CatalogType
contract、persistence、Public DTO、taxonomy registry或filter。

Script style、period、material与geography是独立facets，不得成为一级Kind。seal
art、painting、sculpture等未来对象域必须经过新的显式contract-evolution
checkpoint，不得作为占位值加入。

## Contract与validation

Zod `catalogKindSchema`继续是唯一runtime source of truth，TypeScript与JSON
Schema均从它派生。现有显式mapper继续把internal projection交给Public Zod
schema验证；不得在mapper内建立第二套手写Kind validation。

Public DTO字段、Catalog routes、`CatalogQueryPort`和read
projection结构不变。OpenAPI enum与PostgreSQL `catalog_entries.kind`
CHECK同步收紧为两个值。

## Migration safety

T05.2
migration保持immutable。T04.3追加新migration，并在替换旧CHECK前锁定表、检查所有legacy
`cliff_inscription`行。只要存在一行，migration即失败并由runner transaction
rollback；不得自动改写、删除或coerce该行，也不得写入T04.3 ledger。

Migration idempotency由既有SHA-256 ledger
runner提供：首次成功执行并记录ID、filename与checksum；后续运行验证相同ledger后跳过SQL。raw
SQL不承诺独立重入。

## Consequences

- exhaustive Public clients只需处理两个稳定一级对象域；旧literal不设兼容层。
- historical ADR与旧migration继续保留三值文本作为审计证据。
- 如果部署前发现legacy row或未登记external
  consumer，T04.3必须停止并重新进行compatibility/curated mapping review。
- T05.3必须等待本checkpoint合并及post-merge verification后，从新的
  `origin/integration/mvp` HEAD创建全新branch/worktree。
