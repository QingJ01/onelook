# List.length_append — Spike 摘要

| 指标 | 值 |
|:---|---:|
| 全闭包节点 | 77 |
| 聚焦节点（半径 ∞） | 77 |
| 全闭包边 | 366 |
| 聚焦边 | 366 |
| 类型级闭包 | 16 |
| 证明层新增 | 61 |
| 聚焦内部管道 | 25 |
| 聚焦语义节点 | 52 |
| 语义 docstring 覆盖 | 33/52 |
| 目标自身 docstring | 无 |

## 概念分组（聚焦子图）

| 概念 | 节点数 | 类型级 | 证明层 |
|:---|---:|:---:|:---:|
| 加法记号与实例（HAdd / Add / OfNat） | 12 | 是 | 是 |
| 拼接记号与实例（HAppend / Append） | 8 | 是 | 是 |
| 等式与同余（Eq / congr） | 12 | 是 | 是 |
| 内部管道（equation compiler / recursor / match） | 25 | 是 | 是 |
| 列表与拼接（List / ++ / length） | 7 | 是 | 是 |
| 逻辑与函数外延（True / Iff / propext / funext） | 6 | 否 | 是 |
| 自然数与加法（Nat / +） | 7 | 是 | 是 |
