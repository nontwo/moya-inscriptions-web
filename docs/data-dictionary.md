# T01 数据字典

## 1. PDF 源数据 `SourceCatalogRow`

| 字段                            | 含义                    | 类型     | 必填 | 来源/规则                         | 示例               |
| ------------------------------- | ----------------------- | -------- | ---- | --------------------------------- | ------------------ |
| `sourceIndex`                   | PDF 序号                | integer  | 是   | PDF；1–1658，不作数据库自增主键   | `1`                |
| `regionRaw`                     | 省份列原文              | string   | 是   | PDF；保留直辖市、自治区等原文     | `新疆维吾尔自治区` |
| `nameRaw`                       | 文物名称原文            | string   | 是   | PDF；不改异体字、符号、引号或数字 | `石鼓-吾车刻石`    |
| `protectionOrCollectionUnitRaw` | 保护/收藏单位合并列原文 | string   | 是   | PDF；不得拆成两个确定字段         | `故宫博物院`       |
| `periodRaw`                     | 年代标签原文            | string   | 是   | PDF；不换算起止年份               | `战国`             |
| `sourcePage`                    | 真实 PDF 页码           | integer  | 是   | PDF 表格位置；1–38                | `1`                |
| `sourceId`                      | 稳定来源标识            | string   | 是   | `first-batch-NNNN`                | `first-batch-0001` |
| `needsReview`                   | 是否需核对原文          | boolean  | 是   | 无法可靠识别时为 true             | `false`            |
| `reviewNotes`                   | 原文复核说明            | string[] | 否   | 只记录源表识别问题                | `[]`               |

`sourceId` 是当前稳定标识。同名或相似名称不代表重复；标准化数据必须通过
`rawSource` 保留对完整源记录的追溯。

## 2. 市县候选数据 `RegionEnrichment`

地区候选不覆盖 PDF 原文，也不等于已验证位置。

| 字段                       | 含义           | 类型                | 必填 | 规则                              |
| -------------------------- | -------------- | ------------------- | ---- | --------------------------------- |
| `sourceId` / `sourceIndex` | 关联源记录     | string / integer    | 是   | 必须与 `source-catalog.json` 一致 |
| `regionRaw`                | PDF 省份原文   | string              | 是   | 仅用于追溯，不随现代区划改写      |
| `candidates`               | 行政区候选     | `RegionCandidate[]` | 是   | 至少一个，可保留冲突候选          |
| `selectedCandidateIndex`   | 已选候选下标   | integer/null        | 是   | 未核验时必须为 null               |
| `needsReview`              | 是否待核验     | boolean             | 是   | 无逐条证据时必须为 true           |
| `reviewNotes`              | 记录级审核说明 | string[]            | 是   | 说明证据缺失或候选冲突            |

### `RegionCandidate`

| 字段                 | 类型                      | 说明                                      |
| -------------------- | ------------------------- | ----------------------------------------- |
| `province`           | string                    | 候选现代省级归属，可与 `regionRaw` 不同   |
| `city`               | string/null               | 地级市、州或直辖市；省直辖县可为 null     |
| `county`             | string/null               | 县、区或县级市；不设区地级市可为 null     |
| `verificationStatus` | `unverified \| verified`  | 只有具备逐条证据并审核后才能设为 verified |
| `sources`            | `RegionCandidateSource[]` | 候选值的来源声明                          |

### `RegionCandidateSource`

| 字段           | 类型     | 说明                                         |
| -------------- | -------- | -------------------------------------------- |
| `method`       | enum     | 推断、名录、学术库、地方志、网页或补充工作簿 |
| `label`        | string   | 人类可读的来源声明，不等于证据               |
| `evidenceUrls` | string[] | 可逐条核验的来源 URL；当前均为空             |
| `notes`        | string[] | 原 PR 或工作簿的备注                         |

## 3. 应用模型 `HeritageRecord`

| 字段                         | 类型                | 必填 | 当前批次规则                              |
| ---------------------------- | ------------------- | ---- | ----------------------------------------- |
| `id`                         | string              | 是   | 使用稳定 `sourceId`                       |
| `canonicalName`              | string              | 是   | 示例中直接使用 `nameRaw`                  |
| `aliases`                    | string[]            | 是   | PDF 未提供，当前为空数组                  |
| `region`                     | `NormalizedRegion`  | 是   | 只写入 PDF 的省级原文；未核验市县不得写入 |
| `regionCandidates`           | `RegionCandidate[]` | 是   | 保存候选市县，不代表选定结果              |
| `historicalPeriod`           | `HistoricalPeriod`  | 是   | `label` 保存 `periodRaw`                  |
| `protectionOrCollectionUnit` | string              | 是   | 映射合并列，不拆分语义                    |
| `source`                     | `CatalogSource`     | 是   | 包含文件名、SHA-256、页码和 sourceId      |
| `dataStatus`                 | enum                | 是   | 本批样例为 `catalog-only`                 |
| `categoryIds`                | string[]            | 是   | PDF 无类别，当前为空数组                  |
| `imageIds`                   | string[]            | 是   | PDF 无图片，当前为空数组                  |
| `coordinates`                | `Coordinates`       | 否   | PDF 无坐标，当前省略                      |
| `description`                | string              | 否   | PDF 无说明，当前省略                      |
| `bibliography`               | string[]            | 是   | 当前为空数组                              |
| `createdAt` / `updatedAt`    | string              | 否   | 由持久化层未来生成，当前省略              |
| `rawSource`                  | `SourceCatalogRow`  | 是   | 完整源行，不得覆盖                        |

## 4. 公共展示与 API 契约

- `Region` 和 `HistoricalPeriod` 的规范化 ID、行政代码与起止年份均为可选字段。
- `SiteSummary`
  只强制要求标识、标题、原始可支持的地区/年代及空数组字段；摘要、图片键和 slug 可选。
- `SiteDetail`
  的坐标、尺寸、作者、保存状况和说明均可选；图片、参考文献和关联记录为空数组时有效。
- `ImageAsset` 必须使用
  `objectKey`；缩略图、展示图和原图也使用对象键，不保存生产域名或 CDN URL。
- `SiteSearchQuery` 的市县、类别和关键字均为可选过滤条件。
- `PaginationQuery`、`PaginatedResponse<T>`、`ApiSuccess<T>` 和 `ApiError`
  不包含数据库或云服务实现。

## 5. 数据边界

当前 PDF 没有经纬度、详细地址、书体、作者、类别、图片、释文或说明。候选市县只能用于审核队列；在
`verificationStatus=verified`、存在逐条 `evidenceUrls` 且设置了
`selectedCandidateIndex` 之前，不得进入规范化应用字段。
