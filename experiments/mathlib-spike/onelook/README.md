# OneLook 导图（Spike 生成）

这些 `.olook` 文件由 `make_onelook_maps.py` 从 mathlib 依赖图的概念投影生成，可直接被当前 OneLook 导入。

## 文件

| 文件 | 目标 | 节点数 | 预览 | 说明 |
|:---|:---|---:|:---|:---|
| `nat_add_comm.olook` | `Nat.add_comm` | 54 | [PNG](previews/nat_add_comm.png) | core，小图，全量展开 |
| `list_length_append.olook` | `List.length_append` | 88 | [PNG](previews/list_length_append.png) | core，小图，全量展开 |
| `list_map_comp_map.olook` | `List.map_comp_map` | 65 | [PNG](previews/list_map_comp_map.png) | mathlib List，聚焦半径 2 |
| `filter_coext.olook` | `Filter.coext` | 64 | [PNG](previews/filter_coext.png) | mathlib Filter，聚焦半径 2 |

`manifest.json` 是对应的机器可读清单。

预览图是当前 OneLook 实际导入后的截图（缩小视图，仅用于确认可读性；细节请在应用里打开 `.olook`）。四张图都已在当前版本 OneLook 中实际导入验证。

## 属性子节点版

同一批图另有 `*.attrs.olook` 变体，把属性从备注搬到子节点：

| 文件 | 目标 | 总节点数 | 说明 |
|:---|:---|---:|:---|
| `nat_add_comm.attrs.olook` | `Nat.add_comm` | 364 | 属性子节点 |
| `list_length_append.attrs.olook` | `List.length_append` | 597 | 属性子节点 |
| `list_map_comp_map.attrs.olook` | `List.map_comp_map` | 440 | 属性子节点，[预览](previews/list_map_comp_map.attrs.png) |
| `filter_coext.attrs.olook` | `Filter.coext` | 435 | 属性子节点 |

每个声明节点下有一个默认折叠的 **属性** 子节点，包含：层、类型、模块、签名、文档；每个概念节点下有 **属性**（锚点数）和 **概念依赖** 子节点；根节点下有 **元信息** 子节点。属性组默认折叠，所以初始布局不会爆炸；展开即可看到完整内容。

紧凑版（不带 `.attrs`）仍然把属性放在节点备注里，适合快速浏览。两版可以按需选择；如果确认属性子节点版更合适，我可以把默认输出切过去。

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
