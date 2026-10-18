#!/usr/bin/env python3
"""Aggregate raw Lean declaration graphs into focused concept projections.

Input:  out/<target>.graph.json produced by extract.lean
Output: out/<target>.concepts.json
        out/<target>.projection.md
        out/<target>.summary.md
        out/comparison.md

The mathlib target uses a focus radius because its full proof closure explodes
through extensionality/simp plumbing. The core targets are small enough to show
in full.
"""

from __future__ import annotations

import collections
import json
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
TARGETS = ["nat_add_comm", "list_length_append", "list_map_comp_map", "filter_coext"]
FOCUS_DEPTH = {
    "nat_add_comm": None,
    "list_length_append": None,
    "list_map_comp_map": 2,
    "filter_coext": 2,
}

CONCEPT_LABELS = {
    "nat": "自然数与加法（Nat / +）",
    "list": "列表与拼接（List / ++ / length）",
    "equality": "等式与同余（Eq / congr）",
    "logic": "逻辑与函数外延（True / Iff / propext / funext）",
    "add-notation": "加法记号与实例（HAdd / Add / OfNat）",
    "append-notation": "拼接记号与实例（HAppend / Append）",
    "function": "函数与复合（Function / ∘）",
    "option": "Option 与可空值",
    "getelem": "元素访问（GetElem? / getElem?）",
    "order": "序关系（LT / LE）",
    "quot": "商类型（Quot）",
    "filter": "滤子（Filter）",
    "set": "集合与补集（Set / Compl）",
    "boolean": "布尔代数（BooleanAlgebra）",
    "membership": "成员关系（Membership）",
    "instance": "实例/类型类机器（instances）",
    "internal": "内部管道（equation compiler / recursor / match）",
    "other": "其他",
}

INTERNAL_PATTERNS = [
    r"\._f$",
    r"\.match_\d",
    r"^_private\.",
    r"brecOn",
    r"\bbelow\b",
    r"casesOn",
    r"Internal",
    r"\._proof_",
    r"\._aux",
]
INTERNAL_NAMES = {
    "PUnit",
    "PUnit.unit",
    "PProd",
    "PProd.mk",
    "Unit",
    "Unit.unit",
    "Inhabited",
    "id",
    "outParam",
}

EQ_NAMES = {
    "Eq",
    "Eq.rec",
    "Eq.refl",
    "Eq.symm",
    "Eq.trans",
    "Eq.mpr",
    "congrArg",
    "congr",
    "congrFun'",
    "eq_self",
    "rfl",
    "of_eq_true",
    "eq_true",
}
LOGIC_NAMES = {
    "True",
    "True.intro",
    "False",
    "False.elim",
    "trivial",
    "Iff",
    "Iff.intro",
    "propext",
    "funext",
    "Exists",
    "Not",
}
LOGIC_PREFIXES = ("Iff.", "And.", "Or.", "Not.", "Exists.")
ADD_NAMES = {
    "HAdd",
    "HAdd.hAdd",
    "HAdd.mk",
    "Add",
    "Add.add",
    "Add.mk",
    "instHAdd",
    "instAddNat",
    "OfNat",
    "OfNat.mk",
    "OfNat.ofNat",
    "instOfNatNat",
}
APPEND_NAMES = {
    "HAppend",
    "HAppend.hAppend",
    "HAppend.mk",
    "Append",
    "Append.append",
    "Append.mk",
    "instHAppendOfAppend",
    "List.instAppend",
}
FUNCTION_NAMES = {"Function.comp", "Function.comp_apply", "Function.funext_iff"}
ORDER_NAMES = {"LT", "LT.lt", "LT.mk", "LE", "LE.le", "instLTNat", "instLENat"}
SET_NAMES = {"compl_surjective", "compl_injective", "compl_involutive"}


def concept_of(name: str) -> str:
    if name in INTERNAL_NAMES or any(re.search(p, name) for p in INTERNAL_PATTERNS):
        return "internal"
    if name in EQ_NAMES or name.startswith("Eq."):
        return "equality"
    if name in LOGIC_NAMES or name.startswith(LOGIC_PREFIXES):
        return "logic"
    if name in ADD_NAMES:
        return "add-notation"
    if name in APPEND_NAMES:
        return "append-notation"
    # Notation instances above stay with their notation concept. Other `inst*`
    # declarations are typeclass machinery and should not inflate concept anchors.
    if re.search(r"\.inst[A-Z]|^inst[A-Z]", name):
        return "instance"
    if name in FUNCTION_NAMES or name.startswith("Function."):
        return "function"
    if name in ORDER_NAMES:
        return "order"
    if name.startswith("GetElem?") or name.startswith("GetElem."):
        return "getelem"
    if name.startswith("Option"):
        return "option"
    if name.startswith("Quot"):
        return "quot"
    if name.startswith("Filter"):
        return "filter"
    if name.startswith("Set") or name in SET_NAMES:
        return "set"
    if name.startswith("Compl"):
        return "set"
    if name.startswith("Membership"):
        return "membership"
    if name.startswith(("BooleanAlgebra", "GeneralizedBooleanAlgebra")):
        return "boolean"
    if name.startswith(("BoundedOrder", "OrderBot", "OrderTop", "Lattice", "Bot", "Top", "Inf", "Sup")):
        return "order"
    if name.startswith("Nat"):
        return "nat"
    if name.startswith("List"):
        return "list"
    first = name.split(".")[0]
    if "." in name and first and not first.startswith("_"):
        return f"ns:{first}"
    return "other"


def one_line(text: str, limit: int | None = None) -> str:
    text = " ".join(text.split())
    return text[:limit] if limit is not None else text


def load_graph(slug: str) -> dict:
    path = OUT / f"{slug}.graph.json"
    if not path.exists():
        raise SystemExit(f"missing {path}; run extract.lean first")
    return json.loads(path.read_text())


def reachable(edges: list[dict], target: str, kind: str | None) -> set[str]:
    adj: dict[str, list[str]] = collections.defaultdict(list)
    for e in edges:
        if kind is None or e["kind"] == kind:
            adj[e["source"]].append(e["target"])
    seen: set[str] = set()
    queue = [target]
    while queue:
        name = queue.pop()
        if name in seen:
            continue
        seen.add(name)
        queue.extend(d for d in adj[name] if d not in seen)
    return seen


def neighborhood(edges: list[dict], target: str, depth: int | None) -> set[str]:
    if depth is None:
        return reachable(edges, target, None)
    adj: dict[str, set[str]] = collections.defaultdict(set)
    for e in edges:
        adj[e["source"]].add(e["target"])
    seen = {target}
    frontier = {target}
    for _ in range(depth):
        nxt: set[str] = set()
        for name in frontier:
            nxt.update(adj[name])
        nxt -= seen
        seen |= nxt
        frontier = nxt
    return seen


def concept_order(target_concept: str, concepts: dict, type_closure: set[str],
                  proof_added: set[str], concept_edges: dict) -> list[str]:
    def weight(c: str, kind: str) -> int:
        return (concept_edges.get((target_concept, c, kind), 0)
                + concept_edges.get((c, target_concept, kind), 0))

    def anchor_ids(c: str) -> set[str]:
        return {n["id"] for n in concepts[c]["nodes"]}

    type_concepts = [c for c in concepts if c not in ("internal", "other")
                     and anchor_ids(c) & type_closure]
    proof_concepts = [c for c in concepts if c not in ("internal", "other")
                      and c not in type_concepts and anchor_ids(c) & proof_added]

    type_concepts.sort(key=lambda c: (-weight(c, "type-uses"), -weight(c, "proof-uses"), c))
    proof_concepts.sort(key=lambda c: (-weight(c, "proof-uses"), -weight(c, "type-uses"), c))
    ordered = type_concepts + proof_concepts
    if target_concept in ordered:
        ordered.remove(target_concept)
        ordered.insert(0, target_concept)
    return ordered


def build_concepts(graph: dict, depth: int | None) -> dict:
    nodes = {n["id"]: n for n in graph["nodes"]}
    edges = graph["edges"]
    target = graph["meta"]["target"]
    type_closure = reachable(edges, target, "type-uses")
    proof_closure = reachable(edges, target, "proof-uses")
    all_closure = reachable(edges, target, None)
    # "Proof layer" = everything not needed to read the statement.
    proof_added = all_closure - type_closure
    focus_nodes = neighborhood(edges, target, depth)
    focus_edges = [e for e in edges
                   if e["source"] in focus_nodes and e["target"] in focus_nodes]

    concepts: dict[str, dict] = collections.defaultdict(lambda: {"nodes": [], "anchors": []})
    for node in graph["nodes"]:
        if node["id"] not in focus_nodes:
            continue
        cid = concept_of(node["id"])
        concepts[cid]["nodes"].append(node)
        concepts[cid]["id"] = cid
        if cid.startswith("ns:"):
            concepts[cid]["label"] = f"{cid[3:]}（其他）"
        else:
            concepts[cid]["label"] = CONCEPT_LABELS.get(cid, cid)

    concept_edges: collections.Counter = collections.Counter()
    for e in focus_edges:
        cs, ct = concept_of(e["source"]), concept_of(e["target"])
        if cs != ct:
            concept_edges[(cs, ct, e["kind"])] += 1

    return {
        "nodes": nodes,
        "concepts": concepts,
        "typeClosure": type_closure,
        "proofClosure": proof_closure,
        "allClosure": all_closure,
        "proofAdded": proof_added,
        "focusNodes": focus_nodes,
        "focusEdges": focus_edges,
        "conceptEdges": concept_edges,
    }


def concepts_json(graph: dict, state: dict, depth: int | None) -> dict:
    target = graph["meta"]["target"]
    out_concepts = []
    for cid, c in sorted(state["concepts"].items()):
        ids = [n["id"] for n in c["nodes"]]
        out_concepts.append({
            "id": cid,
            "label": c["label"],
            "anchorCount": len(ids),
            "anchors": sorted(ids),
            "inTypeClosure": bool(set(ids) & state["typeClosure"]),
            "inProofLayer": bool(set(ids) & state["proofAdded"]),
        })
    out_edges = [
        {"from": a, "to": b, "kind": k, "weight": w}
        for (a, b, k), w in sorted(state["conceptEdges"].items(), key=lambda kv: -kv[1])
        if a != "internal" and b != "internal"
    ]
    return {
        "target": target,
        "targetConcept": concept_of(target),
        "focusDepth": depth,
        "fullClosureNodes": len(state["allClosure"]),
        "focusNodes": len(state["focusNodes"]),
        "concepts": out_concepts,
        "conceptEdges": out_edges,
    }


def markdown_projection(graph: dict, state: dict, depth: int | None) -> str:
    meta = graph["meta"]
    nodes = state["nodes"]
    concepts = state["concepts"]
    target = meta["target"]
    target_node = nodes.get(target, {})
    target_concept = concept_of(target)
    order = concept_order(target_concept, concepts, state["typeClosure"],
                          state["proofAdded"], state["conceptEdges"])

    focus_nodes = state["focusNodes"]
    semantic = [n for n in graph["nodes"]
                if n["id"] in focus_nodes and concept_of(n["id"]) != "internal"]
    internal = [n for n in graph["nodes"]
                if n["id"] in focus_nodes and concept_of(n["id"]) == "internal"]
    doc_semantic = sum(1 for n in semantic if n["docstring"])
    full_count = len(state["allClosure"])
    focus_count = len(focus_nodes)

    if depth is None:
        focus_line = f"- 聚焦：全闭包（{full_count} 个节点，小图无需剪枝）"
    else:
        focus_line = (
            f"- 聚焦：全闭包 {full_count} 个节点；显示半径 {depth} 内 {focus_count} 个节点"
            f"（{focus_count * 100 // max(full_count, 1)}%）；深层 {full_count - focus_count} 个节点按需展开"
        )

    lines = [
        f"# {target} — 概念投影",
        "",
        f"- 签名：`{target_node.get('signature', '')}`",
        f"- 所在模块：`{target_node.get('module', '')}`",
        f"- 文档：{one_line(target_node['docstring']) if target_node.get('docstring') else '（无 docstring）'}",
        focus_line,
        f"- 闭包边：{meta['edgeCount']}（类型级 {meta['typeUsesEdges']} / 证明级 {meta['proofUsesEdges']}）",
        f"- 类型级闭包：{len(state['typeClosure'])}；证明层新增：{len(state['proofAdded'])}"
        f"（= 全闭包 − 类型级闭包，含类型/证明混合路径）",
        f"- 聚焦内部管道：{len(internal)} 个节点（{len(internal) * 100 // max(focus_count, 1)}%）",
        f"- 聚焦语义节点 docstring 覆盖率：{doc_semantic}/{len(semantic)}"
        f"（{doc_semantic * 100 // max(len(semantic), 1)}%）",
        "",
        "## 投影树",
        "",
        f"{target}",
    ]

    def anchor_sort_key(n: dict) -> tuple:
        cid = concept_of(n["id"])
        if n["id"] == target:
            rank = 0
        elif n["id"] in state["typeClosure"]:
            rank = 1
        elif n["id"] in state["proofAdded"]:
            rank = 2
        else:
            rank = 3
        return (rank, cid, n["id"])

    for i, cid in enumerate(order):
        is_type = bool({n["id"] for n in concepts[cid]["nodes"]} & state["typeClosure"])
        if cid == target_concept:
            tag = "中心概念"
        elif is_type:
            tag = "读懂陈述"
        else:
            tag = "读懂证明"
        prefix = "└──" if i == len(order) - 1 else "├──"
        lines.append(f"{prefix} [{tag}] {concepts[cid]['label']}")
        for node in sorted(concepts[cid]["nodes"], key=anchor_sort_key):
            if node["id"] == target:
                layer = "目标"
            elif node["id"] in state["typeClosure"]:
                layer = "陈述"
            elif node["id"] in state["proofAdded"]:
                layer = "证明"
            else:
                layer = "关联"
            kind = node["kind"]
            doc = one_line(node["docstring"], 60) if node["docstring"] else ""
            detail = f" — {doc}" if doc else ""
            lines.append(f"│   ├── [{layer}] `{node['id']}` ({kind}){detail}")
        by_target: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0])
        for (a, b, k), w in state["conceptEdges"].items():
            if a == cid and b != cid and b != "internal":
                by_target[b][0 if k == "type-uses" else 1] += w
        if by_target:
            deps = [
                f"{CONCEPT_LABELS.get(b, b)} (type {v[0]} / proof {v[1]})"
                for b, v in sorted(by_target.items())
            ]
            lines.append(f"│   └── 概念依赖 → {', '.join(deps)}")

    if internal:
        lines += [
            "",
            f"## 聚焦范围内的内部管道（{len(internal)} 个节点，可折叠）",
            "",
            "这些是证明项里的 equation compiler / recursor / match 辅助声明，"
            "不是学习概念，投影时默认折叠：",
            "",
        ]
        lines += [f"- `{n['id']}` ({n['kind']})" for n in sorted(internal, key=lambda x: x["id"])]

    lines += [
        "",
        "## 概念级依赖（权重，仅聚焦子图）",
        "",
        "| from | to | type-uses | proof-uses |",
        "|:---|:---|---:|---:|",
    ]
    pairs = sorted({(a, b) for (a, b, _) in state["conceptEdges"]
                    if a != "internal" and b != "internal"})
    for a, b in pairs:
        t = state["conceptEdges"].get((a, b, "type-uses"), 0)
        p = state["conceptEdges"].get((a, b, "proof-uses"), 0)
        if t or p:
            lines.append(f"| {a} | {b} | {t} | {p} |")

    lines.append("")
    return "\n".join(lines)


def markdown_summary(graph: dict, state: dict, depth: int | None) -> str:
    meta = graph["meta"]
    target = meta["target"]
    focus_nodes = state["focusNodes"]
    internal = [n for n in graph["nodes"]
                if n["id"] in focus_nodes and concept_of(n["id"]) == "internal"]
    semantic = [n for n in graph["nodes"]
                if n["id"] in focus_nodes and concept_of(n["id"]) != "internal"]
    doc_semantic = sum(1 for n in semantic if n["docstring"])
    target_doc = next((n for n in graph["nodes"] if n["id"] == target), {}).get("docstring", "")
    lines = [
        f"# {target} — Spike 摘要",
        "",
        "| 指标 | 值 |",
        "|:---|---:|",
        f"| 全闭包节点 | {len(state['allClosure'])} |",
        f"| 聚焦节点（半径 {depth if depth is not None else '∞'}） | {len(focus_nodes)} |",
        f"| 全闭包边 | {meta['edgeCount']} |",
        f"| 聚焦边 | {len(state['focusEdges'])} |",
        f"| 类型级闭包 | {len(state['typeClosure'])} |",
        f"| 证明层新增 | {len(state['proofAdded'])} |",
        f"| 聚焦内部管道 | {len(internal)} |",
        f"| 聚焦语义节点 | {len(semantic)} |",
        f"| 语义 docstring 覆盖 | {doc_semantic}/{len(semantic)} |",
        f"| 目标自身 docstring | {'有' if target_doc else '无'} |",
        "",
        "## 概念分组（聚焦子图）",
        "",
        "| 概念 | 节点数 | 类型级 | 证明层 |",
        "|:---|---:|:---:|:---:|",
    ]
    for cid, c in sorted(state["concepts"].items()):
        ids = {n["id"] for n in c["nodes"]}
        lines.append(
            f"| {c['label']} | {len(ids)} | "
            f"{'是' if ids & state['typeClosure'] else '否'} | "
            f"{'是' if ids & state['proofAdded'] else '否'} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_comparison(metrics: dict) -> None:
    slugs = list(metrics)
    targets = [metrics[s]["target"] for s in slugs]
    header = "| 指标 | " + " | ".join(f"`{t}`" for t in targets) + " |"
    sep = "|:---|" + "|".join("---:" for _ in slugs) + "|"

    def row(label: str, key: str) -> str:
        return "| " + label + " | " + " | ".join(str(metrics[s][key]) for s in slugs) + " |"

    lines = [
        "# Spike 对比：core 与 mathlib 目标",
        "",
        "| 指标 | " + " | ".join(f"`{t}`" for t in targets) + " |",
        sep,
        row("全闭包节点", "fullNodes"),
        row("聚焦节点", "focusNodes"),
        row("全闭包边", "fullEdges"),
        row("聚焦边", "focusEdges"),
        row("类型级闭包", "typeClosure"),
        row("证明层新增", "proofAdded"),
        row("聚焦内部管道", "internalFocus"),
        row("聚焦语义概念", "semanticConcepts"),
        row("聚焦语义 doc 覆盖", "semanticDoc"),
        row("目标 docstring", "targetDoc"),
        "",
        "## 观察",
        "",
        "- 两个 core 目标很小，全闭包即可读；mathlib 目标全闭包 649 节点，"
        "但半径 2 内只有 50 个节点，说明**聚焦半径是必需的**，全闭包不是教学视图。",
        "- mathlib 目标自身有 docstring，1 跳 23 个节点里 18 个有文档；"
        "core 两个目标自身没有 docstring，文档覆盖率不足。",
        "- mathlib 目标半径 2 内的 50 个节点被压成 9 个语义概念；"
        "聚焦后内部管道比例约 20%，比全闭包的 26% 更低，但仍然需要折叠。",
        "- 全闭包膨胀主要来自 `ext`/simp 引入的 `getElem?`、除法、实例链等高阶管道；"
        "这些不是学习“map 复合”需要先懂的概念。",
        "- 把 `inst*` 从概念锚点中剥开后，Filter 的 Set 概念从 16 个锚点降到 8 个，"
        "List 从 9 降到 7；实例机器单独成层。说明“概念 / 实例 / 内部管道”必须三层分开。",
        "- Filter.coext 的聚焦语义 docstring 覆盖只有 19/42（45%），明显低于 List.map_comp_map "
        "的 29/40（72%）；文档密度是领域相关的，不能假设 mathlib 处处有解释。",
        "- 跨领域后必须手工补 Filter / Set / BooleanAlgebra 等规则，说明前缀式概念规则不可扩展；"
        "下一轮需要半自动聚类。",
        "",
        "## 结论",
        "",
        "管线在 core 和 mathlib 规模上都可用，但正确的产品视图是“目标邻域 + 概念/实例/机器分层 + 按需展开”，"
        "不是把依赖闭包整张画出来。下一轮应做：概念层半自动化、补 instance/simp/extends 边、"
        "以及真实学习任务评估。",
        "",
    ]
    (OUT / "comparison.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    metrics: dict[str, dict] = {}
    for slug in TARGETS:
        graph = load_graph(slug)
        depth = FOCUS_DEPTH.get(slug)
        state = build_concepts(graph, depth)
        focus_nodes = state["focusNodes"]
        internal = [n for n in graph["nodes"]
                    if n["id"] in focus_nodes and concept_of(n["id"]) == "internal"]
        semantic = [n for n in graph["nodes"]
                    if n["id"] in focus_nodes and concept_of(n["id"]) != "internal"]
        doc_semantic = sum(1 for n in semantic if n["docstring"])
        target_doc = next((n for n in graph["nodes"]
                           if n["id"] == graph["meta"]["target"]), {}).get("docstring", "")
        semantic_concepts = [c for c in state["concepts"]
                             if c not in ("internal", "instance", "other")]

        (OUT / f"{slug}.concepts.json").write_text(
            json.dumps(concepts_json(graph, state, depth), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (OUT / f"{slug}.projection.md").write_text(
            markdown_projection(graph, state, depth), encoding="utf-8"
        )
        (OUT / f"{slug}.summary.md").write_text(
            markdown_summary(graph, state, depth), encoding="utf-8"
        )
        metrics[slug] = {
            "target": graph["meta"]["target"],
            "fullNodes": len(state["allClosure"]),
            "focusNodes": len(focus_nodes),
            "fullEdges": graph["meta"]["edgeCount"],
            "focusEdges": len(state["focusEdges"]),
            "typeClosure": len(state["typeClosure"]),
            "proofAdded": len(state["proofAdded"]),
            "internalFocus": len(internal),
            "semanticConcepts": len(semantic_concepts),
            "semanticDoc": f"{doc_semantic}/{len(semantic)}",
            "targetDoc": "有" if target_doc else "无",
        }
        print(f"{slug}: full={len(state['allClosure'])}, focus={len(focus_nodes)}, "
              f"concepts={len(semantic_concepts)}, internal={len(internal)}")
    write_comparison(metrics)


if __name__ == "__main__":
    main()
