"use strict";

/**
 * Telemetria de rollback lógico por ficheiro (Fase 4.9.5 / hardening 4.9.5.1).
 * O estado em memória volta ao caminho textual; aqui ficam sequencing, lineage e ordem global.
 */

function createStructuralRollbackBuffer() {
  let nextApplySeq = 0;
  /** @type {object[]} */
  const attempts = [];
  /** @type {object[]} */
  const rollbacks = [];

  return {
    /**
     * @param {{ path: string, patch_index: number, before_length: number, sequence_same_file?: number }} row
     * @returns {{ apply_sequence: number }}
     */
    recordAttempt(row) {
      nextApplySeq += 1;
      const rec = {
        at: new Date().toISOString(),
        apply_sequence: nextApplySeq,
        ...row,
      };
      attempts.push(rec);
      return { apply_sequence: nextApplySeq };
    },
    /**
     * @param {{
     *   path: string,
     *   patch_index: number,
     *   reasons: string[],
     *   final_mode: string,
     *   apply_sequence: number|null,
     *   fallback_transition?: string,
     * }} row
     */
    recordRollback(row) {
      const linked =
        row.apply_sequence != null
          ? row.apply_sequence
          : attempts.length > 0
            ? attempts[attempts.length - 1].apply_sequence
            : null;

      const samePathPatchIndices = attempts
        .filter((a) => a.path === row.path && a.apply_sequence <= linked)
        .map((a) => a.patch_index);

      rollbacks.push({
        at: new Date().toISOString(),
        rollback_sequence: rollbacks.length + 1,
        linked_apply_sequence: linked,
        prior_patches_same_file: samePathPatchIndices,
        ...row,
        linked_apply_sequence_resolved: linked,
      });
    },
    /** @returns {object} */
    buildReport() {
      return {
        schema_version: 2,
        phase: "4.9.5.1",
        generated_at: new Date().toISOString(),
        attempts: attempts.slice(),
        rollbacks: rollbacks.slice(),
        summary: {
          attempt_count: attempts.length,
          rollback_count: rollbacks.length,
        },
        sequencing: {
          apply_order: attempts.map((a) => ({
            apply_sequence: a.apply_sequence,
            path: a.path,
            patch_index: a.patch_index,
            sequence_same_file: a.sequence_same_file ?? 0,
          })),
        },
        rollback_lineage: rollbacks.map((r) => ({
          rollback_sequence: r.rollback_sequence,
          linked_apply_sequence: r.linked_apply_sequence_resolved ?? r.linked_apply_sequence,
          path: r.path,
          patch_index: r.patch_index,
          prior_patches_same_file: r.prior_patches_same_file || [],
          fallback_transition: r.fallback_transition || null,
          reasons: r.reasons || [],
        })),
      };
    },
  };
}

module.exports = { createStructuralRollbackBuffer };
