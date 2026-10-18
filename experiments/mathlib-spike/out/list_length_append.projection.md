# List.length_append — 概念投影

- 签名：`∀ {α : Type u} {as bs : List α}, (as ++ bs).length = as.length + bs.length`
- 所在模块：`Init.Data.List.Basic`
- 文档：（无 docstring）
- 聚焦：全闭包（77 个节点，小图无需剪枝）
- 闭包边：366（类型级 148 / 证明级 218）
- 类型级闭包：16；证明层新增：61（= 全闭包 − 类型级闭包，含类型/证明混合路径）
- 聚焦内部管道：25 个节点（32%）
- 聚焦语义节点 docstring 覆盖率：33/52（63%）

## 投影树

List.length_append
├── [中心概念] 列表与拼接（List / ++ / length）
│   ├── [目标] `List.length_append` (theorem)
│   ├── [陈述] `List` (inductive) — Linked lists: ordered lists, in which each element has a ref
│   ├── [陈述] `List.length` (definition) — The length of a list. This function is overridden in the com
│   ├── [证明] `List.append` (definition) — Appends two lists. Normally used via the `++` operator. Appe
│   ├── [证明] `List.cons` (constructor) — The list whose first element is `head`, where `tail` is the 
│   ├── [证明] `List.nil` (constructor) — The empty list, usually written `[]`.
│   ├── [证明] `List.rec` (recursor)
│   └── 概念依赖 → 加法记号与实例（HAdd / Add / OfNat） (type 3 / proof 5), 拼接记号与实例（HAppend / Append） (type 3 / proof 3), 等式与同余（Eq / congr） (type 1 / proof 7), 逻辑与函数外延（True / Iff / propext / funext） (type 0 / proof 1), 自然数与加法（Nat / +） (type 2 / proof 4)
├── [读懂陈述] 拼接记号与实例（HAppend / Append）
│   ├── [陈述] `Append` (inductive) — The homogeneous version of `HAppend`: `a ++ b : α` where `a 
│   ├── [陈述] `HAppend` (inductive) — The notation typeclass for heterogeneous append. This enable
│   ├── [陈述] `HAppend.hAppend` (definition) — `a ++ b` is the result of concatenation of `a` and `b`, usua
│   ├── [陈述] `List.instAppend` (definition)
│   ├── [陈述] `instHAppendOfAppend` (definition)
│   ├── [证明] `Append.append` (definition) — `a ++ b` is the result of concatenation of `a` and `b`. See 
│   ├── [证明] `Append.mk` (constructor)
│   ├── [证明] `HAppend.mk` (constructor)
│   └── 概念依赖 → 列表与拼接（List / ++ / length） (type 1 / proof 2)
├── [读懂陈述] 加法记号与实例（HAdd / Add / OfNat）
│   ├── [陈述] `Add` (inductive) — The homogeneous version of `HAdd`: `a + b : α` where `a b : 
│   ├── [陈述] `HAdd` (inductive) — The notation typeclass for heterogeneous addition. This enab
│   ├── [陈述] `HAdd.hAdd` (definition) — `a + b` computes the sum of `a` and `b`. The meaning of this
│   ├── [陈述] `instAddNat` (definition)
│   ├── [陈述] `instHAdd` (definition)
│   ├── [证明] `Add.add` (definition) — `a + b` computes the sum of `a` and `b`. See `HAdd`.
│   ├── [证明] `Add.mk` (constructor)
│   ├── [证明] `HAdd.mk` (constructor)
│   ├── [证明] `OfNat` (inductive) — The class `OfNat α n` powers the numeric literal parser. If 
│   ├── [证明] `OfNat.mk` (constructor)
│   ├── [证明] `OfNat.ofNat` (definition) — The `OfNat.ofNat` function is automatically inserted by the 
│   ├── [证明] `instOfNatNat` (definition)
│   └── 概念依赖 → 自然数与加法（Nat / +） (type 5 / proof 4)
├── [读懂陈述] 自然数与加法（Nat / +）
│   ├── [陈述] `Nat` (inductive) — The natural numbers, starting at zero. This type is special-
│   ├── [证明] `Nat.add` (definition) — Addition of natural numbers, typically used via the `+` oper
│   ├── [证明] `Nat.rec` (recursor)
│   ├── [证明] `Nat.succ` (constructor) — The successor of a natural number `n`. Using `Nat.succ n` sh
│   ├── [证明] `Nat.succ_add` (theorem)
│   ├── [证明] `Nat.zero` (constructor) — Zero, the smallest natural number. Using `Nat.zero` explicit
│   ├── [证明] `Nat.zero_add` (theorem)
│   └── 概念依赖 → 加法记号与实例（HAdd / Add / OfNat） (type 8 / proof 8), 等式与同余（Eq / congr） (type 2 / proof 2)
├── [读懂陈述] 等式与同余（Eq / congr）
│   ├── [陈述] `Eq` (inductive) — The equality relation. It has one introduction rule, `Eq.ref
│   ├── [证明] `Eq.rec` (recursor)
│   ├── [证明] `Eq.refl` (constructor) — `Eq.refl a : a = a` is reflexivity, the unique constructor o
│   ├── [证明] `Eq.symm` (theorem) — Equality is symmetric: if `a = b` then `b = a`. Because this
│   ├── [证明] `Eq.trans` (theorem) — Equality is transitive: if `a = b` and `b = c` then `a = c`.
│   ├── [证明] `congr` (theorem) — Congruence in both function and argument. If `f₁ = f₂` and `
│   ├── [证明] `congrArg` (theorem) — Congruence in the function argument: if `a₁ = a₂` then `f a₁
│   ├── [证明] `congrFun'` (theorem) — Similar to `congrFun` but `β` does not depend on `α`.
│   ├── [证明] `eq_self` (theorem)
│   ├── [证明] `eq_true` (theorem)
│   ├── [证明] `of_eq_true` (theorem)
│   ├── [证明] `rfl` (definition) — `rfl : a = a` is the unique constructor of the equality type
│   └── 概念依赖 → 逻辑与函数外延（True / Iff / propext / funext） (type 3 / proof 6)
└── [读懂证明] 逻辑与函数外延（True / Iff / propext / funext）
│   ├── [证明] `Iff` (inductive) — If and only if, or logical bi-implication. `a ↔ b` means tha
│   ├── [证明] `Iff.intro` (constructor) — If `a → b` and `b → a` then `a` and `b` are equivalent.
│   ├── [证明] `True` (inductive) — `True` is a proposition and has only an introduction rule, `
│   ├── [证明] `True.intro` (constructor) — `True` is true, and `True.intro` (or more commonly, `trivial
│   ├── [证明] `propext` (axiom) — The [axiom](lean-manual://section/axioms) of **propositional
│   ├── [证明] `trivial` (theorem) — `True` is true, and `True.intro` (or more commonly, `trivial
│   └── 概念依赖 → 等式与同余（Eq / congr） (type 1 / proof 0)

## 聚焦范围内的内部管道（25 个节点，可折叠）

这些是证明项里的 equation compiler / recursor / match 辅助声明，不是学习概念，投影时默认折叠：

- `List.append._f` (definition)
- `List.append.match_1` (definition)
- `List.below` (definition)
- `List.brecOn` (definition)
- `List.brecOn.go` (definition)
- `List.casesOn` (definition)
- `List.length._f` (definition)
- `Nat.add._f` (definition)
- `Nat.add.match_1` (definition)
- `Nat.below` (definition)
- `Nat.brecOn` (definition)
- `Nat.brecOn.go` (definition)
- `Nat.casesOn` (definition)
- `Nat.succ_add._f` (definition)
- `Nat.zero_add._f` (definition)
- `PProd` (inductive)
- `PProd.mk` (constructor)
- `PUnit` (inductive)
- `PUnit.unit` (constructor)
- `Unit` (definition)
- `Unit.unit` (definition)
- `_private.Init.Data.Nat.Basic.0.Nat.succ_add.match_1_1` (definition)
- `_private.Init.Data.Nat.Basic.0.Nat.zero_add.match_1_1` (definition)
- `instDecidableEqList.match_1` (definition)
- `outParam` (definition)

## 概念级依赖（权重，仅聚焦子图）

| from | to | type-uses | proof-uses |
|:---|:---|---:|---:|
| add-notation | nat | 5 | 4 |
| append-notation | list | 1 | 2 |
| equality | logic | 3 | 6 |
| list | add-notation | 3 | 5 |
| list | append-notation | 3 | 3 |
| list | equality | 1 | 7 |
| list | logic | 0 | 1 |
| list | nat | 2 | 4 |
| logic | equality | 1 | 0 |
| nat | add-notation | 8 | 8 |
| nat | equality | 2 | 2 |
