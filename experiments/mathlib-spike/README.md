# mathlib-spike

Spike 0001 的实验代码与产物：从 Lean 环境抽取声明依赖闭包，聚合成概念，投影成学习树。

## 文件

| 文件 | 作用 |
|:---|:---|
| `check_api.lean` | 环境 API 与目标存在性检查 |
| `extract.lean` | 抽取两个目标的类型级/证明级依赖，输出 graph JSON |
| `aggregate.py` | 概念聚合、投影树、摘要与对比 |
| `evaluation.md` | 执行报告与判断 |
| `out/` | 生成的数据与 Markdown 投影 |

## 运行

```bash
export PATH="$HOME/.elan/bin:$PATH"
cd /Users/anzhize/.zcode/workspace/math
lake env lean /Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike/extract.lean

cd /Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike
python3 aggregate.py
```

## 当前范围

- Round 1（core）：`Nat.add_comm`、`List.length_append`
- Round 2（mathlib / List）：`List.map_comp_map`（`Mathlib.Data.List.Basic`）
- Round 3（mathlib / Filter）：`Filter.coext`（`Mathlib.Order.Filter.Basic`）
- 抽取器导入 `Mathlib.Data.List.Basic` 与 `Mathlib.Order.Filter.Basic`，四个目标一起抽取
- 聚合器对 mathlib 目标使用聚焦半径 2；core 目标展示全闭包
- 聚焦半径配置在 `aggregate.py` 的 `FOCUS_DEPTH`

## 当前结果

| 目标 | 全闭包 | 聚焦 | 类型级 | 证明层新增 | 语义概念 | docstring |
|:---|---:|---:|---:|---:|---:|:---:|
| Nat.add_comm | 47 | 47 | 9 | 38 | 3 | 无 |
| List.length_append | 77 | 77 | 16 | 61 | 6 | 无 |
| List.map_comp_map | 649 | 50 | 5 | 644 | 9 | 有 |
| Filter.coext | 1327 | 50 | 12 | 1315 | 8 | 有 |

详见 `evaluation.md`。

## 下一轮

见 `evaluation.md`：做真实学习任务对比；补 `extends` / instance / simp / import 边；把概念规则从手写前缀升级为半自动聚类；换一个不同领域的 mathlib 目标验证泛化。
