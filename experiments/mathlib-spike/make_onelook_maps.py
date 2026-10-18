#!/usr/bin/env python3
"""Turn focused mathlib graph projections into OneLook .olook documents.

OneLook's current data model is a tree, so this is intentionally a *tree
projection* of the focused concept graph:

  target
  ├── 中心概念
  │   ├── [目标] target declaration
  │   └── [陈述]/[证明] anchors in the same concept
  ├── 读懂陈述 -> concept nodes -> anchors
  ├── 读懂证明 -> concept nodes -> anchors
  └── 机器与内部管道（折叠） -> instance/internal concepts -> anchors

Cross-concept dependencies are written into concept notes, because the current
OneLook has no first-class relationship edges yet.
"""

from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from pathlib import Path

from aggregate import (
    CONCEPT_LABELS,
    FOCUS_DEPTH,
    TARGETS,
    build_concepts,
    concept_of,
    load_graph,
    one_line,
)

OUT_DIR = Path(__file__).resolve().parent / "onelook"

STYLE = {
    "root": {
        "background": "#1d4ed8", "color": "#ffffff", "fontWeight": "bold",
        "fontSize": 18, "shape": "round", "borderColor": "#1e3a8a", "borderWidth": 2,
    },
    "group": {
        "background": "#e5e7eb", "color": "#111827", "fontWeight": "bold",
        "fontSize": 15, "shape": "round", "borderColor": "#9ca3af",
    },
    "center": {
        "background": "#dbeafe", "color": "#1e3a8a", "fontWeight": "bold",
        "fontSize": 15, "shape": "round", "borderColor": "#2563eb", "borderWidth": 2,
    },
    "statement_concept": {
        "background": "#eff6ff", "color": "#1e40af", "fontWeight": "bold",
        "shape": "round", "borderColor": "#60a5fa",
    },
    "proof_concept": {
        "background": "#f0fdf4", "color": "#166534", "fontWeight": "bold",
        "shape": "round", "borderColor": "#34d399",
    },
    "machinery_concept": {
        "background": "#f9fafb", "color": "#4b5563", "fontWeight": "bold",
        "shape": "round", "borderColor": "#d1d5db",
    },
    "target": {
        "background": "#2563eb", "color": "#ffffff", "fontWeight": "bold",
        "shape": "round", "borderColor": "#1e40af", "borderWidth": 2,
    },
    "statement_anchor": {
        "background": "#f8fbff", "color": "#1e3a8a", "fontSize": 13,
        "borderColor": "#93c5fd",
    },
    "proof_anchor": {
        "background": "#f7fef9", "color": "#14532d", "fontSize": 13,
        "borderColor": "#86efac",
    },
    "machinery_anchor": {
        "background": "#f9fafb", "color": "#6b7280", "fontSize": 12,
        "borderColor": "#e5e7eb",
    },
}


def new_node(text, parent_id=None, *, note=None, tags=None, style=None, expanded=True):
    node = {
        "id": str(uuid.uuid4()),
        "text": text,
        "children": [],
        "isExpanded": expanded,
    }
    if parent_id:
        node["parentId"] = parent_id
    data = {}
    if note:
        data["note"] = note
    if tags:
        data["tags"] = tags
    if data:
        node["data"] = data
    if style:
        node["style"] = style
    return node


def add_child(parent, text, **kwargs):
    child = new_node(text, parent["id"], **kwargs)
    parent["children"].append(child)
    return child


def layer_of(node_id, target, state):
    cid = concept_of(node_id)
    if cid == "internal":
        return "内部"
    if cid == "instance":
        return "实例"
    if node_id == target:
        return "目标"
    if node_id in state["typeClosure"]:
        return "陈述"
    if node_id in state["proofAdded"]:
        return "证明"
    return "关联"


def anchor_style(layer):
    if layer == "目标":
        return STYLE["target"]
    if layer in ("实例", "内部"):
        return STYLE["machinery_anchor"]
    if layer == "陈述":
        return STYLE["statement_anchor"]
    return STYLE["proof_anchor"]


def anchor_note(node, layer, target):
    parts = [
        f"**层** {layer}",
        f"**类型** {node['kind']}",
        f"**模块** `{node['module']}`",
    ]
    if node["id"] == target:
        parts.append("**角色** 目标定理")
    sig = one_line(node.get("signature", ""))
    if sig:
        parts.append("**签名**\n```lean\n" + sig + "\n```")
    doc = (node.get("docstring") or "").strip()
    parts.append("**文档**\n" + (doc if doc else "（无 docstring）"))
    if layer == "实例":
        parts.append("**说明** 类型类实例，解释实现，不是学习先修；默认折叠。")
    elif layer == "内部":
        parts.append("**说明** equation compiler / recursor / match 管道，默认折叠。")
    return "\n\n".join(parts)


def short_label(label):
    """Node text stays short; the full label is kept in the node note."""
    return label.split("（")[0].strip()


def concept_deps_note(cid, state):
    by_target = defaultdict(lambda: [0, 0])
    for (a, b, kind), weight in state["conceptEdges"].items():
        if a == cid and b != cid:
            by_target[b][0 if kind == "type-uses" else 1] += weight
    if not by_target:
        return "（聚焦子图内无跨概念依赖）"
    lines = []
    for b, (type_w, proof_w) in sorted(by_target.items()):
        label = CONCEPT_LABELS.get(b, b)
        lines.append(f"- {label}：type {type_w} / proof {proof_w}")
    return "\n".join(lines)


def concept_note(cid, anchors, state):
    label = state["concepts"][cid]["label"]
    parts = [f"**概念** {label}", f"**锚点** {len(anchors)} 个"]
    parts.append("**概念依赖（聚焦内）**\n" + concept_deps_note(cid, state))
    if cid == "instance":
        parts.append("**说明** 类型类实例层，默认折叠；它解释实现，不是学习概念。")
    elif cid == "internal":
        parts.append("**说明** 内部管道层，默认折叠；不要把这里的东西当成先修知识。")
    return "\n\n".join(parts)


def make_document(slug):
    graph = load_graph(slug)
    meta = graph["meta"]
    target = meta["target"]
    depth = FOCUS_DEPTH.get(slug)
    state = build_concepts(graph, depth)
    nodes = state["nodes"]
    concepts = state["concepts"]
    target_concept = concept_of(target)
    full_count = len(state["allClosure"])
    focus_count = len(state["focusNodes"])

    target_node = nodes[target]
    target_doc = (target_node.get("docstring") or "").strip()
    if depth is None:
        focus_text = f"全闭包（{full_count} 节点，小图无需剪枝）"
    else:
        focus_text = (
            f"半径 {depth}；全闭包 {full_count} 节点，本图显示 {focus_count} 个，"
            f"深层 {full_count - focus_count} 个未展开"
        )

    root_note = "\n\n".join([
        f"**目标** `{target}`",
        f"**模块** `{target_node['module']}`",
        "**签名**\n```lean\n" + one_line(target_node.get("signature", "")) + "\n```",
        "**文档**\n" + (target_doc if target_doc else "（无 docstring）"),
        f"**聚焦** {focus_text}",
        "**读图** `[陈述]` 是理解命题所需，`[证明]` 是证明层新增，"
        "`[实例]`/`[内部]` 默认折叠。概念之间的真实依赖写在概念节点备注里。",
        "**来源** `experiments/mathlib-spike` 生成；树是概念投影，不是原始依赖图。",
    ])

    root = new_node(
        target,
        note=root_note,
        tags=["mathlib-graph", target, "spike"],
        style=STYLE["root"],
    )

    # 中心概念
    center = add_child(
        root,
        f"中心概念：{short_label(concepts[target_concept]['label'])}",
        note=concept_note(target_concept, concepts[target_concept]["nodes"], state),
        tags=["concept", target_concept, "中心"],
        style=STYLE["center"],
    )
    add_child(center, target, note=anchor_note(target_node, "目标", target),
              tags=["declaration", "目标", target_node["kind"]],
              style=STYLE["target"])

    for node in sorted(concepts[target_concept]["nodes"], key=lambda n: n["id"]):
        if node["id"] == target:
            continue
        layer = layer_of(node["id"], target, state)
        add_child(
            center,
            f"[{layer}] {node['id']}",
            note=anchor_note(node, layer, target),
            tags=["declaration", layer, node["kind"]],
            style=anchor_style(layer),
        )

    other_concepts = [cid for cid in concepts if cid not in (target_concept, "internal", "instance")]
    statement_concepts = [
        cid for cid in other_concepts
        if any(n["id"] in state["typeClosure"] for n in concepts[cid]["nodes"])
    ]
    proof_concepts = [cid for cid in other_concepts if cid not in statement_concepts]

    def add_concept_group(parent, cid, style):
        c = concepts[cid]
        cnode = add_child(
            parent,
            short_label(c["label"]),
            note=concept_note(cid, c["nodes"], state),
            tags=["concept", cid],
            style=style,
        )
        for node in sorted(c["nodes"], key=lambda n: n["id"]):
            layer = layer_of(node["id"], target, state)
            add_child(
                cnode,
                f"[{layer}] {node['id']}",
                note=anchor_note(node, layer, target),
                tags=["declaration", layer, node["kind"]],
                style=anchor_style(layer),
            )
        return cnode

    if statement_concepts:
        group = add_child(
            root,
            "读懂陈述",
            note="理解命题本身所需的概念（类型级闭包及其语义修正）。",
            tags=["layer", "陈述"],
            style=STYLE["group"],
        )
        for cid in sorted(statement_concepts, key=lambda c: -len(concepts[c]["nodes"])):
            add_concept_group(group, cid, STYLE["statement_concept"])

    if proof_concepts:
        group = add_child(
            root,
            "读懂证明",
            note="证明层新增的依赖；其中可能混有证明机器，详见各概念备注。",
            tags=["layer", "证明"],
            style=STYLE["group"],
        )
        for cid in sorted(proof_concepts, key=lambda c: -len(concepts[c]["nodes"])):
            add_concept_group(group, cid, STYLE["proof_concept"])

    machinery = [cid for cid in ("instance", "internal") if cid in concepts]
    if machinery:
        group = add_child(
            root,
            "机器与内部管道（折叠）",
            note="实例/类型类与 equation compiler 管道。默认折叠；它们解释实现，不是学习先修。",
            tags=["layer", "机器"],
            style=STYLE["group"],
            expanded=False,
        )
        for cid in machinery:
            c = concepts[cid]
            cnode = add_child(
                group,
                short_label(c["label"]),
                note=concept_note(cid, c["nodes"], state),
                tags=["concept", cid, "机器"],
                style=STYLE["machinery_concept"],
                expanded=False,
            )
            for node in sorted(c["nodes"], key=lambda n: n["id"]):
                layer = layer_of(node["id"], target, state)
                add_child(
                    cnode,
                    f"[{layer}] {node['id']}",
                    note=anchor_note(node, layer, target),
                    tags=["declaration", layer, node["kind"]],
                    style=STYLE["machinery_anchor"],
                )

    name = target
    if depth is not None:
        name += f"（聚焦 r={depth}）"
    source_kind = "mathlib" if target_node["module"].startswith("Mathlib") else "Lean core"
    return {
        "id": str(uuid.uuid4()),
        "name": f"{source_kind} 图投影 · {name}",
        "root": root,
        "layout": "mind",
        "theme": "light",
        "connectionStyle": "curve",
        "rainbowBranch": True,
        "createdAt": int(time.time() * 1000),
        "updatedAt": int(time.time() * 1000),
        "version": "0.1.0",
    }


def validate_tree(root):
    seen = set()

    def walk(node, depth, parent_id):
        assert depth <= 100
        assert node["id"] not in seen, f"duplicate id {node['id']}"
        seen.add(node["id"])
        assert isinstance(node["text"], str) and node["text"]
        assert isinstance(node["children"], list)
        assert isinstance(node["isExpanded"], bool)
        if parent_id is not None:
            assert node.get("parentId") == parent_id
        for child in node["children"]:
            walk(child, depth + 1, node["id"])

    walk(root, 0, None)


def count_nodes(node):
    return 1 + sum(count_nodes(c) for c in node["children"])


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for slug in TARGETS:
        doc = make_document(slug)
        validate_tree(doc["root"])
        wrapper = {
            "version": "1.0.0",
            "app": "OneLook",
            "created": int(time.time() * 1000),
            "modified": int(time.time() * 1000),
            "document": doc,
        }
        path = OUT_DIR / f"{slug}.olook"
        path.write_text(json.dumps(wrapper, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest.append({
            "file": path.name,
            "target": doc["root"]["text"],
            "name": doc["name"],
            "nodes": count_nodes(doc["root"]),
            "layout": doc["layout"],
        })
        print(f"{path.name}: {count_nodes(doc['root'])} nodes")
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
