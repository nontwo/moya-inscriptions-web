# Project scripts

计划由 T05 负责的跨工作区自动化脚本入口。当前没有图片处理、生产数据导入或部署脚本；新增脚本必须明确输入、输出、幂等性与密钥边界。

## Catalog Import Owner template

`generate-catalog-import-template.mjs`是dev-only、无密钥的可重复artifact
builder。输入是已build的internal `catalog-import/v1` semantic contract与
`catalog-import-xlsx/v1` layout spec；默认输出为repository中的safe blank
template，也可通过`--output`写入指定的开发临时路径。`--check`只在系统临时目录重建并比较normalized
OOXML-part fingerprint，不覆盖repository artifact。

Root scripts会自行build contracts：

- `pnpm generate:catalog-import-template`
- `pnpm check:catalog-import-template`

该脚本不读取production data、external Owner workspace、credentials或runtime
services。它不是parser/importer，不能被apps、services或production runtime依赖。
