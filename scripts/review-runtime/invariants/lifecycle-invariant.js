const { canTransition } = require("../../execution-plan/lifecycle/lifecycle-engine");
const { finding } = require("./invariant-types");

function evaluateLifecycleInvariant(snapshot) {
  const out = [];
  const plan = snapshot.plan;
  if (!plan || typeof plan !== "object") return out;

  const transitions = Array.isArray(plan.lifecycle_transitions)
    ? plan.lifecycle_transitions
    : [];
  if (transitions.length === 0) return out;

  for (const tr of transitions) {
    if (!tr || typeof tr !== "object") continue;
    const from = tr.from != null ? String(tr.from) : "";
    const to = tr.to != null ? String(tr.to) : "";
    if (!from || !to) continue;
    const gate = canTransition(from, to, { allowNoop: true });
    if (!gate.ok && !gate.noop) {
      out.push(
        finding(
          "lifecycle_invariant.invalid_transition",
          "lifecycle",
          "high",
          "fail",
          { from, to, code: gate.code || null },
          ["Corrigir lifecycle_transitions no execution plan ou regenerar o plano."],
        ),
      );
    }
  }

  const declared = plan.lifecycle_state != null ? String(plan.lifecycle_state) : "";
  const last = transitions[transitions.length - 1];
  const lastTo = last && last.to != null ? String(last.to) : "";
  if (declared && lastTo && declared !== lastTo) {
    out.push(
      finding(
        "lifecycle_invariant.state_head_inconsistent",
        "lifecycle",
        "medium",
        "fail",
        { lifecycle_state: declared, last_transition_to: lastTo },
        ["Sincronizar lifecycle_state com a última transição registada."],
      ),
    );
  }

  return out;
}

module.exports = { evaluateLifecycleInvariant };
