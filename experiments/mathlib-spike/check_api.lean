import Lean
import Lean.Util.FoldConsts
import Lean.DocString.Extension
import Lean.Data.Json

open Lean

#check Environment.constants
#check Expr.getUsedConstants
#check ConstantInfo.value?
#check Lean.findInternalDocString?
#check Environment.getModuleIdxFor?

#check Nat.add_comm
#check List.length_append

#eval IO.println "api-check-ok"
