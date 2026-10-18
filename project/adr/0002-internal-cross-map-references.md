# ADR-0002：跨导图引用使用内部 URL 协议

- 状态：已采纳（Accepted）
- 日期：2026-10-18
- 相关文档：[项目章程](../CHARTER.md)、[ADR-0001](./0001-graph-substrate-overlay-projection.md)

## 背景

单张导图不应该承载全部内容。学习投影需要把“当前聚焦的邻域”和“其他投影/其他主题”分开，通过引用跳转，而不是复制节点或无限扩张一张图。

当前 `NodeData` 已有 `hyperlink` 字段，应用也能导入多份 `.olook` 文档；缺的是“打开内部文档并定位节点”的协议。

## 决策

1. 复用 `NodeData.hyperlink`，定义内部引用 URL：
   ```text
   onelook://doc/<documentId>
   onelook://doc/<documentId>?node=<nodeId>
   ```
2. 画布对内部引用节点显示左上角 `↗` 图标；点击调用 `openInternalReference`。
3. 打开流程：
   - 从 IndexedDB 读取目标文档；
   - best-effort 保存当前文档；
   - `loadDocument` 加载目标；
   - `nextTick` 后 `selectNode(nodeId)`，由画布自动聚焦。
4. 目标文档不存在时提示“目标导图尚未导入”，不静默失败。
5. 生成器使用确定性的 document/root id（UUIDv5），保证重新生成后跨图引用仍然有效。
6. 属性面板的超链接输入框也支持该协议，用户可以手动填写内部引用。

## 后果

### 正面

- 不改 `.olook` schema，旧文档兼容；引用就是普通字符串。
- 单图可以只展示聚焦邻域，其余内容通过引用跳转。
- 生成器可以批量建立“相关导图”分组，形成轻量的图间导航。

### 代价 / 限制

- 目标文档必须在同一个浏览器 origin 的 IndexedDB 中；跨端口/跨设备不共享。
- 当前实现通过 `loadDocument` 切换文档，TabBar 依据 `document.id` 切换/新增标签；切换前只做 best-effort 保存，极端情况下可能丢失最后 2 秒内的未保存修改。
- 引用是 URL 字符串，没有结构化校验；目标节点被删除时只能提示缺失。
- 还没有“引用反向链接”视图；需要在后续 overlay 层补。

## 备选方案

1. 新增 `NodeData.reference: { documentId, nodeId }`：语义更强，但需要 schema、属性面板、导入导出和迁移，暂缓。
2. 用外部 URL 指向 OneLook 部署地址：不适合本地优先和离线场景。
3. 把所有内容放进一张大图：正是本 ADR 要避免的方案。

## 后续

- 在属性面板增加“从已导入文档中选择目标”的引用选择器；
- 增加反向链接/引用图视图；
- 在多标签管理器里支持“已打开文档优先切换”，避免重复加载。
