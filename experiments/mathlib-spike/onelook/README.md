# OneLook 导图（Spike 生成）

这些 `.olook` 文件由 `make_onelook_maps.py` 从 mathlib 依赖图的概念投影生成，可直接被当前 OneLook 导入。

## 文件

| 文件 | 目标 | 节点数 | 说明 |
|:---|:---|---:|:---|
| `nat_add_comm.olook` | `Nat.add_comm` | 54 | core，小图，全量展开 |
| `list_length_append.olook` | `List.length_append` | 88 | core，小图，全量展开 |
| `list_map_comp_map.olook` | `List.map_comp_map` | 65 | mathlib List，聚焦半径 2 |
| `filter_coext.olook` | `Filter.coext` | 64 | mathlib Filter，聚焦半径 2 |

`manifest.json` 是对应的机器可读清单。

## 导入

1. 启动 OneLook：

   ```bash
   cd /Users/anzhize/.zcode/workspace/app/onelook
   corepack pnpm dev
   ```

2. 打开浏览器中的本地地址（通常是 `http://localhost:5173`）。
3. 点击顶部工具栏的 **导入**，选择 `.olook` 文件。
4. 导入后会自动加载文档；节点备注在右侧属性面板里（Markdown 渲染）。

## 读图方式

- **根节点**：目标定理，备注含签名、docstring、聚焦范围和生成说明。
- **中心概念**：目标所在概念；子节点带 `[目标]` / `[陈述]` / `[证明]` 标签。
- **读懂陈述**：理解命题所需的类型级概念（及语义修正）。
- **读懂证明**：证明层新增的概念；其中可能混有证明机器。
- **机器与内部管道（折叠）**：实例/类型类与 equation compiler 管道，默认折叠，不是学习先修。

## 注意

- 这是当前 OneLook 树模型下的**树投影**，不是完整依赖图；跨概念依赖写在概念节点备注里，因为当前应用还没有一等公民的 relationship edge。
- 数学上同一个实体在真实图中可能有多个父节点；这里必须选一个树位置。不要把树的层级当成唯一真理。
- 深层节点（mathlib 目标全闭包 649/1327，图里只显示半径 2 的 50 个）没有展开；需要时可以回到 `out/*.projection.md` 或重新生成。

## 重新生成

```bash
cd /Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike
python3 aggregate.py
python3 make_onelook_maps.py
```
