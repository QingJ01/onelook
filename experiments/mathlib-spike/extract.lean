import Mathlib.Data.List.Basic
import Mathlib.Order.Filter.Basic
import Lean
import Lean.Util.FoldConsts
import Lean.DocString.Extension
import Lean.Data.Json

open Lean Elab Command

namespace Spike

structure GraphNode where
  name : Name
  kind : String
  module : Name
  docstring : String
  signature : String

structure GraphEdge where
  source : Name
  target : Name
  kind : String

def kindOf : ConstantInfo → String
  | .axiomInfo _ => "axiom"
  | .defnInfo _ => "definition"
  | .thmInfo _ => "theorem"
  | .opaqueInfo _ => "opaque"
  | .quotInfo _ => "quotient"
  | .inductInfo _ => "inductive"
  | .ctorInfo _ => "constructor"
  | .recInfo _ => "recursor"

def moduleOf (env : Environment) (name : Name) : Name :=
  match env.getModuleIdxFor? name with
  | some idx => env.header.moduleNames[idx]!
  | none => Name.anonymous

def docstringOf (env : Environment) (name : Name) : IO String := do
  match ← Lean.findInternalDocString? env name with
  | some (.inl s) => return s
  | _ => return ""

def signatureOf (e : Expr) : CommandElabM String := do
  let fmt ← liftCoreM <| Lean.Meta.MetaM.run' (Lean.Meta.ppExpr e)
  return fmt.pretty

def directDeps (ci : ConstantInfo) : Array Name × Array Name :=
  let typeDeps := ci.type.getUsedConstants
  let proofDeps := match ci.value? (allowOpaque := true) with
    | some v => v.getUsedConstants
    | none => #[]
  (typeDeps, proofDeps)

partial def extract (env : Environment) (root : Name) : CommandElabM (Array GraphNode × Array GraphEdge) := do
  let consts := env.constants
  let mut visited : NameSet := {}
  let mut queue : Array Name := #[root]
  let mut nodes : Array GraphNode := #[]
  let mut edges : Array GraphEdge := #[]
  let mut qi := 0
  while qi < queue.size do
    let name := queue[qi]!
    qi := qi + 1
    if !visited.contains name then
      visited := visited.insert name
      match consts.find? name with
      | none => pure ()
      | some ci =>
        let (typeDeps, proofDeps) := directDeps ci
        let doc ← liftIO <| docstringOf env name
        let sig ← signatureOf ci.type
        nodes := nodes.push {
          name := name
          kind := kindOf ci
          module := moduleOf env name
          docstring := doc
          signature := sig
        }
        for dep in typeDeps do
          if (consts.find? dep).isSome then
            edges := edges.push { source := name, target := dep, kind := "type-uses" }
            if !visited.contains dep then
              queue := queue.push dep
        for dep in proofDeps do
          if (consts.find? dep).isSome then
            edges := edges.push { source := name, target := dep, kind := "proof-uses" }
            if !visited.contains dep then
              queue := queue.push dep
  return (nodes, edges)

def reachableBy (edges : Array GraphEdge) (root : Name) (kind : String) : NameSet :=
  Id.run do
    let mut adj : Std.HashMap Name (Array Name) := {}
    for e in edges do
      if e.kind == kind then
        adj := adj.insert e.source ((adj.getD e.source #[]).push e.target)
    let mut seen : NameSet := {}
    let mut queue : Array Name := #[root]
    let mut i := 0
    while i < queue.size do
      let n := queue[i]!
      i := i + 1
      if !seen.contains n then
        seen := seen.insert n
        for d in adj.getD n #[] do
          if !seen.contains d then
            queue := queue.push d
    return seen

def nodeJson (n : GraphNode) : Json :=
  Json.mkObj [
    ("id", n.name.toString),
    ("kind", n.kind),
    ("module", n.module.toString),
    ("docstring", n.docstring),
    ("signature", n.signature)
  ]

def edgeJson (e : GraphEdge) : Json :=
  Json.mkObj [
    ("source", e.source.toString),
    ("target", e.target.toString),
    ("kind", e.kind)
  ]

def countBy (edges : Array GraphEdge) (kind : String) : Nat :=
  edges.foldl (init := 0) fun n e => if e.kind == kind then n + 1 else n

def toJson (target : Name) (nodes : Array GraphNode) (edges : Array GraphEdge) : Json :=
  let typeClosure := reachableBy edges target "type-uses"
  let proofClosure := reachableBy edges target "proof-uses"
  let docCount := nodes.foldl (init := 0) fun n node =>
    if node.docstring.isEmpty then n else n + 1
  let coverage := if nodes.size == 0 then 0 else (docCount * 100) / nodes.size
  Json.mkObj [
    ("meta", Json.mkObj [
      ("target", target.toString),
      ("leanVersion", "4.33.0"),
      ("nodeCount", nodes.size),
      ("edgeCount", edges.size),
      ("typeClosureNodes", typeClosure.size),
      ("proofClosureNodes", proofClosure.size),
      ("docstringNodes", docCount),
      ("docstringCoveragePct", coverage),
      ("typeUsesEdges", countBy edges "type-uses"),
      ("proofUsesEdges", countBy edges "proof-uses")
    ]),
    ("nodes", Json.arr (nodes.map nodeJson)),
    ("edges", Json.arr (edges.map edgeJson))
  ]

def run (env : Environment) (outDir : System.FilePath) : CommandElabM Unit := do
  liftIO <| IO.FS.createDirAll outDir
  let targets : List (Name × String) := [
    (`Nat.add_comm, "nat_add_comm.graph.json"),
    (`List.length_append, "list_length_append.graph.json"),
    (`List.map_comp_map, "list_map_comp_map.graph.json"),
    (`Filter.coext, "filter_coext.graph.json")
  ]
  for (target, fileName) in targets do
    let (nodes, edges) ← extract env target
    let json := toJson target nodes edges
    liftIO <| IO.FS.writeFile (outDir / fileName) (json.pretty)
    liftIO <| IO.println s!"{target}: {nodes.size} nodes, {edges.size} edges"

end Spike

open Lean Elab Command in
elab "#extractSpike" : command => do
  let env ← getEnv
  Spike.run env "/Users/anzhize/.zcode/workspace/app/onelook/experiments/mathlib-spike/out"

#extractSpike
