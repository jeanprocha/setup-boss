import type {

  ClarificationBundleDto,

  ClarificationRuntimePhase,

} from "./clarification-types";



/** Fases em que a coleta de informação (perguntas/respostas) já terminou. */

const COLLECTION_COMPLETE_PHASES = new Set<ClarificationRuntimePhase>([

  "refining",

  "refinement_ready",

  "awaiting_approval",

  "approved",

  "rejected",

  "ready_for_execution",

  "strategy_pending",

]);



export type ClarificationCollectionSignals = {

  runtimePhase: ClarificationRuntimePhase | null | undefined;

  refinementAvailable?: boolean;

  pendingBlockingCount?: number;

  questionsCount?: number;

  answersCount?: number;

  allBlockingAnswered?: boolean;

};



/**

 * Coleta de clarificação concluída — respostas obrigatórias submetidas e/ou refinement gerado.

 * Distinto de {@link isClarificationWorkflowComplete} (pós-aprovação / strategy).

 */

export function isClarificationCollectionComplete(

  input: ClarificationBundleDto | ClarificationCollectionSignals,

): boolean {

  const refinementAvailable =

    "refinement" in input

      ? input.refinement.available

      : Boolean(input.refinementAvailable);



  if (refinementAvailable) return true;



  const runtimePhase =

    "session" in input ? input.session.runtimePhase : input.runtimePhase;



  if (runtimePhase && COLLECTION_COMPLETE_PHASES.has(runtimePhase)) {

    return true;

  }



  const pendingBlocking =

    "session" in input

      ? input.session.pendingBlockingCount

      : (input.pendingBlockingCount ?? 0);



  const questionsCount =

    "session" in input

      ? input.session.questionsCount

      : (input.questionsCount ?? 0);



  const answersCount =

    "session" in input ? input.session.answersCount : (input.answersCount ?? 0);



  if (

    questionsCount > 0 &&

    pendingBlocking === 0 &&

    answersCount >= questionsCount

  ) {

    return true;

  }



  if ("questions" in input && input.questions.length > 0) {

    const blocking = input.questions.filter((q) => q.blocking);

    if (

      blocking.length > 0 &&

      blocking.every((q) => q.status === "answered")

    ) {

      return true;

    }

  }



  if (input.allBlockingAnswered) return true;



  return false;

}



/** Clarificação/SPEC concluída — approval ou phase2 pronta para execução. */

export function isClarificationWorkflowComplete(

  runtimePhase: ClarificationRuntimePhase | null | undefined,

): boolean {

  return (

    runtimePhase === "ready_for_execution" ||

    runtimePhase === "approved" ||

    runtimePhase === "strategy_pending"

  );

}



/** Bundle indica clarificação “inicializada” mas sem questões persistidas nem refinement. */

export function clarificationInitializedWithoutQuestions(

  bundle: ClarificationBundleDto,

): boolean {

  return bundle.session.runtimePhase === "clarification_empty";

}



/**

 * Clarificação aprovada em estado que antecede strategy completa — próximo passo operacional é gerar strategy.

 */

export function clarificationApprovedAwaitingStrategy(

  bundle: ClarificationBundleDto,

): boolean {

  if (bundle.approval.status !== "approved") return false;

  const rp = bundle.session.runtimePhase;

  return rp === "strategy_pending" || rp === "ready_for_execution";

}



/**

 * Gate de aprovação HITL só quando há sinal de SPEC/refinement ou decisão já registada.

 * Evita UI de “aprovar” quando `classification=needs_context` + 0 perguntas + sem artefactos.

 */

export function shouldShowClarificationApprovalGate(

  bundle: ClarificationBundleDto,

): boolean {

  if (bundle.session.runtimePhase === "clarification_empty") {

    return false;

  }



  const { approval, session, refinement } = bundle;



  if (approval.status === "approved" || approval.status === "rejected") {

    return true;

  }



  const planRef =

    approval.planRef != null ? String(approval.planRef).trim() : "";

  const hasSpecSignal =

    refinement.available ||

    planRef.length > 0 ||

    refinement.executionReadiness === "pending_approval" ||

    refinement.executionReadiness === "ready";



  if (!hasSpecSignal) {

    return false;

  }



  const phase = session.runtimePhase;

  return (

    phase === "awaiting_approval" ||

    phase === "refinement_ready" ||

    phase === "approved" ||

    phase === "rejected"

  );

}



export const CLARIFICATION_EMPTY_PRIMARY_PT =

  "Clarificação inicializada, mas nenhuma pergunta foi gerada.";



export const CLARIFICATION_EMPTY_DETAIL_PT =

  "Isso indica que o intake marcou a tarefa como needs_context, mas o gerador de perguntas não produziu questões. É necessário gerar perguntas (CLI/API futura), refinar a tarefa ou ter fallback para SPEC antes de qualquer aprovação.";


