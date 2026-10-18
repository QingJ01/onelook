# Nat.add_comm — 概念投影

- 签名：`∀ (n m : ℕ), n + m = m + n`
- 所在模块：`Init.Data.Nat.Basic`
- 文档：（无 docstring）
- 聚焦：全闭包（47 个节点，小图无需剪枝）
- 闭包边：241（类型级 100 / 证明级 141）
- 类型级闭包：9；证明层新增：38（= 全闭包 − 类型级闭包，含类型/证明混合路径）
- 聚焦内部管道：20 个节点（42%）
- 聚焦语义节点 docstring 覆盖率：16/27（59%）

## 投影树

Nat.add_comm
├── [中心概念] 自然数与加法（Nat / +）
│   ├── [目标] `Nat.add_comm` (theorem)
│   ├── [陈述] `Nat` (inductive) — The natural numbers, starting at zero. This type is special-
│   ├── [证明] `Nat.add` (definition) — Addition of natural numbers, typically used via the `+` oper
│   ├── [证明] `Nat.rec` (recursor)
│   ├── [证明] `Nat.succ` (constructor) — The successor of a natural number `n`. Using `Nat.succ n` sh
│   ├── [证明] `Nat.succ_add` (theorem)
│   ├── [证明] `Nat.zero` (constructor) — Zero, the smallest natural number. Using `Nat.zero` explicit
│   ├── [证明] `Nat.zero_add` (theorem)
│   └── 概念依赖 → 加法记号与实例（HAdd / Add / OfNat） (type 11 / proof 11), 等式与同余（Eq / congr） (type 3 / proof 3)
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
└── [读懂陈述] 等式与同余（Eq / congr）
│   ├── [陈述] `Eq` (inductive) — The equality relation. It has one introduction rule, `Eq.ref
│   ├── [证明] `Eq.mpr` (definition) — If `h : α = β` is a proof of type equality, then `h.mpr : β 
│   ├── [证明] `Eq.rec` (recursor)
│   ├── [证明] `Eq.refl` (constructor) — `Eq.refl a : a = a` is reflexivity, the unique constructor o
│   ├── [证明] `Eq.symm` (theorem) — Equality is symmetric: if `a = b` then `b = a`. Because this
│   ├── [证明] `congrArg` (theorem) — Congruence in the function argument: if `a₁ = a₂` then `f a₁
│   ├── [证明] `rfl` (definition) — `rfl : a = a` is the unique constructor of the equality type

## 聚焦范围内的内部管道（20 个节点，可折叠）

这些是证明项里的 equation compiler / recursor / match 辅助声明，不是学习概念，投影时默认折叠：

- `Nat.add._f` (definition)
- `Nat.add.match_1` (definition)
- `Nat.add_comm._f` (definition)
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
- `_private.Init.Data.Nat.Basic.0.Nat.add_comm.match_1_1` (definition)
- `_private.Init.Data.Nat.Basic.0.Nat.succ_add.match_1_1` (definition)
- `_private.Init.Data.Nat.Basic.0.Nat.zero_add.match_1_1` (definition)
- `id` (definition)
- `outParam` (definition)

## 概念级依赖（权重，仅聚焦子图）

| from | to | type-uses | proof-uses |
|:---|:---|---:|---:|
| add-notation | nat | 5 | 4 |
| nat | add-notation | 11 | 11 |
| nat | equality | 3 | 3 |
