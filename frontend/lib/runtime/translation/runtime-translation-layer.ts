import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import type { KnowledgeBootstrapPhase } from "@/lib/runtime/knowledge/knowledge-bootstrap-types";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import {
  lifecyclePhaseLabel,
  mapRawPhaseToLifecycleId,
  type LifecyclePhaseId,
} from "@/lib/runtime/adapters/runtime-labels";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import type {
  HumanOperationalKind,
  HumanOperationalCta,
  HumanOperationalPresentation,
} from "@/lib/runtime/translation/human-operational-state";
import type {
  RuntimeActionKind,
  RuntimeActionTarget,
} from "@/lib/runtime/navigation/runtime-action-target";
import { runtimeActionTargetForPhaseLabel } from "@/lib/runtime/navigation/runtime-action-target";

export type {
  HumanOperationalKind,
  HumanOperationalPresentation,
  HumanOperationalCta,
} from "@/lib/runtime/translation/human-operational-state";
export { isInvalidHumanWaitingPresentation } from "@/lib/runtime/translation/human-operational-state";

function cta(
  label: string,
  actionHint: string,
  target: RuntimeActionTarget,
  actionKind: RuntimeActionKind = "scroll_focus",
): HumanOperationalCta {
  return { label, actionHint, target, actionKind };
}

function ctaForPhaseLabel(
  label: string,
  ctaLabel: string,
  actionHint: string,
  fallback: RuntimeActionTarget,
): HumanOperationalCta {
  return cta(
    ctaLabel,
    actionHint,
    runtimeActionTargetForPhaseLabel(label) ?? fallback,
  );
}

function present(
  kind: HumanOperationalKind,
  headline: string,
  description: string,
  badge: string,
  opts?: { cta?: HumanOperationalPresentation["cta"]; bullets?: string[] },
): HumanOperationalPresentation {
  return {
    kind,
    headline,
    description,
    badge,
    cta: opts?.cta,
    bullets: opts?.bullets,
  };
}

// ——— Inicialização (docs/.IA) ———

const KNOWLEDGE_BOOTSTRAP_MAP: Record<
  KnowledgeBootstrapPhase,
  HumanOperationalPresentation
> = {
  knowledge_bootstrap_running: present(
    "processing",
    "Carregando base de conhecimento do projeto",
    "A validar a pasta `docs/.IA` e a preparar o contexto inicial.",
    "A processar",
    { bullets: ["Validação de `docs/.IA`", "Carga do contexto do projeto"] },
  ),
  knowledge_bootstrap_missing: present(
    "blocked",
    "Base de conhecimento não encontrada",
    "A pasta obrigatória `docs/.IA` não existe na raiz do projecto. Crie a base de conhecimento antes de continuar.",
    "Pré-requisito",
    {
      bullets: [
        "Compreender o projecto",
        "Gerar especificações com contexto",
        "Executar tarefas com segurança",
      ],
      cta: cta(
        "Como criar a base .IA",
        "Consulte a documentação de bootstrap em docs/.IA/system/.",
        "observability",
        "open_observability",
      ),
    },
  ),
  knowledge_bootstrap_untracked: present(
    "blocked",
    "Base de conhecimento não versionada",
    "A pasta `docs/.IA` existe localmente, mas não possui arquivos versionados no Git do projeto-alvo.",
    "Pré-requisito",
    {
      cta: cta(
        "Ver instruções de commit",
        "Faça commit da base docs/.IA no repositório do projeto antes de continuar.",
        "observability",
        "open_observability",
      ),
    },
  ),
  knowledge_bootstrap_wrong_path: present(
    "blocked",
    "Base de conhecimento no caminho incorreto",
    "Foi encontrada `docs/IA`, mas o caminho obrigatório é `docs/.IA` versionada no Git.",
    "Pré-requisito",
    {
      cta: cta(
        "Ver instruções de migração",
        "Renomeie docs/IA para docs/.IA e faça commit no repositório do projeto-alvo.",
        "observability",
        "open_observability",
      ),
    },
  ),
  knowledge_bootstrap_ready: present(
    "completed",
    "Contexto do projeto carregado",
    "A base `docs/.IA` está presente — o workflow pode avançar para SPEC e clarificação.",
    "Concluído",
  ),
};

export function translateKnowledgeBootstrapPhase(
  phase: KnowledgeBootstrapPhase | null | undefined,
): HumanOperationalPresentation {
  if (!phase) {
    return present(
      "processing",
      "Inicialização do projeto",
      "A preparar a base de conhecimento.",
      "A processar",
    );
  }
  return (
    KNOWLEDGE_BOOTSTRAP_MAP[phase] ??
    present("blocked", "Inicialização", String(phase), "—")
  );
}

// ——— Clarificação ———

const CLARIFICATION_MAP: Record<
  ClarificationRuntimePhase,
  HumanOperationalPresentation
> = {
  clarification_required: present(
    "processing",
    "Gerando perguntas de clarificação",
    "A IA está a analisar o pedido e a preparar as perguntas necessárias.",
    "A processar",
    { bullets: ["Análise do pedido", "Geração de perguntas"] },
  ),
  clarification_empty: present(
    "blocked",
    "Clarificação sem perguntas",
    "O sistema marcou a tarefa como precisando de contexto, mas nenhuma pergunta foi gerada.",
    "Bloqueado",
    {
      cta: cta(
        "Rever pedido",
        "Ajuste a descrição no intake ou contacte suporte se o problema persistir.",
        "clarification_spec",
      ),
    },
  ),
  waiting_answers: present(
    "waiting_user",
    "Aguardando respostas da clarificação",
    "Responda às perguntas para a IA poder refinar o plano.",
    "A sua vez",
    {
      cta: cta(
        "Responder perguntas",
        "Use o painel de clarificação abaixo para enviar as respostas.",
        "clarification_spec",
      ),
    },
  ),
  refining: present(
    "processing",
    "Refinando o plano",
    "A IA está a consolidar as respostas num plano refinado.",
    "A processar",
    { bullets: ["Consolidação das respostas", "Geração do SPEC"] },
  ),
  refinement_ready: present(
    "waiting_user",
    "Plano refinado pronto",
    "Revise o plano refinado antes de aprovar.",
    "A sua vez",
    {
      cta: cta(
        "Rever plano refinado",
        "Abra o painel de clarificação e confirme ou peça ajustes.",
        "refined_plan",
      ),
    },
  ),
  awaiting_approval: present(
    "waiting_user",
    "Aguardando aprovação do plano",
    "O plano refinado está pronto — aprove ou peça refinamento.",
    "A sua vez",
    {
      cta: cta(
        "Aprovar plano",
        "Use os controlos de aprovação no painel de clarificação.",
        "refined_plan",
      ),
    },
  ),
  approved: present(
    "completed",
    "Plano aprovado",
    "A clarificação foi concluída. O próximo passo é a estratégia de execução.",
    "Concluído",
  ),
  rejected: present(
    "blocked",
    "Plano rejeitado",
    "O plano foi rejeitado — ajuste o pedido ou peça um novo refinamento.",
    "Bloqueado",
    {
      cta: cta(
        "Pedir refinamento",
        "Volte ao painel de clarificação para corrigir o plano.",
        "refined_plan",
      ),
    },
  ),
  ready_for_execution: present(
    "completed",
    "Pronto para execução",
    "Clarificação concluída — pode avançar para estratégia ou execução.",
    "Concluído",
  ),
  strategy_pending: present(
    "waiting_user",
    "Pronto para gerar estratégia",
    "A clarificação terminou — inicie a geração da estratégia de execução.",
    "A sua vez",
    {
      cta: cta(
        "Gerar estratégia",
        "Abra o painel de estratégia e confirme o arranque.",
        "strategy",
      ),
    },
  ),
  unavailable: present(
    "blocked",
    "Clarificação indisponível",
    "Não foi possível carregar o estado de clarificação desta corrida.",
    "Indisponível",
    {
      cta: cta(
        "Atualizar",
        "Recarregue a corrida ou verifique a ligação ao runtime.",
        "observability",
        "open_observability",
      ),
    },
  ),
};

export function translateClarificationRuntimePhase(
  phase: ClarificationRuntimePhase | null | undefined,
): HumanOperationalPresentation {
  if (!phase) {
    return present(
      "blocked",
      "Clarificação",
      "Estado de clarificação desconhecido.",
      "—",
    );
  }
  return CLARIFICATION_MAP[phase] ?? present("blocked", "Clarificação", String(phase), "—");
}

// ——— Estratégia ———

const STRATEGY_MAP: Record<StrategyRuntimePhase, HumanOperationalPresentation> = {
  strategy_pending: present(
    "waiting_user",
    "Pronto para gerar estratégia",
    "A clarificação está concluída — inicie a geração da estratégia.",
    "A sua vez",
    {
      cta: cta(
        "Gerar estratégia",
        "Use o painel de estratégia para iniciar a decomposição.",
        "strategy",
      ),
    },
  ),
  strategy_generating: present(
    "processing",
    "Gerando estratégia de execução",
    "A IA está a decompor a tarefa e a preparar subtarefas.",
    "A processar",
    {
      bullets: [
        "Decomposição da tarefa",
        "Análise arquitetural",
        "Preparação das subtarefas",
      ],
    },
  ),
  strategy_ready: present(
    "waiting_user",
    "Estratégia gerada",
    "Revise a estratégia antes de iniciar a execução.",
    "A sua vez",
    {
      cta: cta(
        "Aprovar estratégia",
        "Confirme no painel de estratégia ou peça refinamento.",
        "strategy",
      ),
    },
  ),
  strategy_blocked: present(
    "blocked",
    "Estratégia bloqueada",
    "A geração ou validação da estratégia encontrou um bloqueio.",
    "Bloqueado",
    {
      cta: cta(
        "Rever estratégia",
        "Consulte os detalhes no painel de estratégia.",
        "strategy",
      ),
    },
  ),
  strategy_failed: present(
    "failed",
    "Falha na estratégia",
    "Não foi possível concluir a geração da estratégia.",
    "Falhou",
    {
      cta: cta(
        "Tentar novamente",
        "Reinicie a geração no painel de estratégia.",
        "strategy",
      ),
    },
  ),
  strategy_approved: present(
    "completed",
    "Estratégia aprovada",
    "A estratégia foi validada — pode iniciar a execução.",
    "Concluído",
  ),
  ready_for_execution: present(
    "completed",
    "Pronto para executar",
    "Estratégia validada — a execução pode começar.",
    "Concluído",
    {
      cta: cta(
        "Iniciar execução",
        "Use os controlos no painel de execução.",
        "execution",
      ),
    },
  ),
  unavailable: present(
    "blocked",
    "Estratégia indisponível",
    "Não foi possível carregar o estado de estratégia.",
    "Indisponível",
  ),
};

export function translateStrategyRuntimePhase(
  phase: StrategyRuntimePhase | null | undefined,
): HumanOperationalPresentation {
  if (!phase) {
    return present("blocked", "Estratégia", "Estado de estratégia desconhecido.", "—");
  }
  return STRATEGY_MAP[phase] ?? present("blocked", "Estratégia", String(phase), "—");
}

// ——— Execução ———

const EXECUTION_MAP: Record<ExecutionLifecyclePhase, HumanOperationalPresentation> = {
  execution_pending: present(
    "waiting_user",
    "Pronto para iniciar execução",
    "A estratégia está pronta — confirme o arranque da execução.",
    "A sua vez",
    {
      cta: cta(
        "Iniciar execução",
        "Use os controlos no painel de execução.",
        "execution",
      ),
    },
  ),
  execution_running: present(
    "processing",
    "Executando tarefas planejadas",
    "O worker está a aplicar alterações e validações.",
    "Em execução",
    {
      bullets: [
        "Modificando ficheiros",
        "Validando alterações",
        "Executando verificações",
      ],
      cta: cta(
        "Acompanhar progresso",
        "Veja o painel de execução para seguir as subtarefas.",
        "execution",
      ),
    },
  ),
  review_running: present(
    "processing",
    "Revisando alterações realizadas",
    "A IA está a rever o resultado da execução.",
    "A processar",
  ),
  correction_running: present(
    "processing",
    "Corrigindo problemas encontrados",
    "O ciclo de correção está activo.",
    "A processar",
  ),
  retry_running: present(
    "processing",
    "A repetir execução",
    "Nova tentativa após falha parcial.",
    "A processar",
  ),
  rollback_running: present(
    "processing",
    "Revertendo alterações",
    "Rollback em curso por segurança.",
    "A processar",
  ),
  recovery_running: present(
    "processing",
    "Recuperando execução",
    "O runtime está a estabilizar a corrida.",
    "A processar",
  ),
  execution_blocked: present(
    "blocked",
    "Execução bloqueada",
    "A execução parou por bloqueio — verifique os detalhes.",
    "Bloqueado",
    {
      cta: cta(
        "Ver bloqueios",
        "Consulte o painel de execução e a observabilidade.",
        "execution",
      ),
    },
  ),
  execution_failed: present(
    "failed",
    "Execução falhou",
    "A corrida terminou com falha.",
    "Falhou",
    {
      cta: cta(
        "Ver logs",
        "Revise bloqueios e logs na observabilidade.",
        "observability",
        "open_observability",
      ),
    },
  ),
  execution_completed: present(
    "completed",
    "Execução concluída",
    "As tarefas planeadas foram finalizadas.",
    "Concluído",
  ),
};

export function translateExecutionLifecyclePhase(
  phase: ExecutionLifecyclePhase | null | undefined,
): HumanOperationalPresentation {
  if (!phase) {
    return present("blocked", "Execução", "Estado de execução desconhecido.", "—");
  }
  return EXECUTION_MAP[phase] ?? present("blocked", "Execução", String(phase), "—");
}

// ——— Runtime UI state (summary.state) ———

const RUNTIME_UI_MAP: Record<RuntimeUiState, HumanOperationalPresentation> = {
  running: present(
    "processing",
    "Em processamento",
    "O runtime está a trabalhar nesta corrida.",
    "A processar",
  ),
  waiting_clarification_questions: present(
    "processing",
    "A preparar clarificação",
    "Aguarde enquanto as perguntas são geradas.",
    "A processar",
  ),
  waiting_clarification_answers: present(
    "waiting_user",
    "Aguardando respostas",
    "Responda às perguntas de clarificação.",
    "A sua vez",
    {
      cta: cta("Responder", "Painel de clarificação abaixo.", "clarification_spec"),
    },
  ),
  waiting_approval: present(
    "waiting_user",
    "Aguardando aprovação",
    "É necessária uma decisão humana antes de continuar.",
    "A sua vez",
    {
      cta: cta(
        "Rever e aprovar",
        "Use o painel da fase activa.",
        "refined_plan",
      ),
    },
  ),
  blocked: present(
    "blocked",
    "Corrida bloqueada",
    "A execução não pode avançar até resolver o bloqueio.",
    "Bloqueado",
  ),
  failed: present(
    "failed",
    "Corrida falhou",
    "A operação terminou com erro.",
    "Falhou",
  ),
  correcting: present(
    "processing",
    "Corrigindo",
    "Ciclo de correcção em curso.",
    "A processar",
  ),
  retrying: present(
    "processing",
    "A repetir",
    "Nova tentativa automática.",
    "A processar",
  ),
  recovered: present(
    "completed",
    "Recuperado",
    "A corrida foi recuperada após incidente.",
    "Concluído",
  ),
  success: present(
    "completed",
    "Concluído com sucesso",
    "A corrida terminou normalmente.",
    "Concluído",
  ),
  warning: present(
    "blocked",
    "Alerta operacional",
    "Existem sinais que requerem atenção.",
    "Atenção",
  ),
};

export function translateRuntimeUiState(
  state: RuntimeUiState,
): HumanOperationalPresentation {
  return RUNTIME_UI_MAP[state] ?? present("blocked", "Estado", state, "—");
}

// ——— Passo operacional da timeline ———

export function translateOperationalStepStatus(
  status: OperationalStepStatus,
  ctx?: { semanticPhaseLabel?: string },
): HumanOperationalPresentation {
  const phase = ctx?.semanticPhaseLabel;
  switch (status) {
    case "pending":
      return present("paused", "Pendente", "Esta etapa ainda não começou.", "Pendente");
    case "active":
      return present("processing", "Em curso", phase ? `Etapa: ${phase}` : "Etapa activa.", "Activo");
    case "running":
      return present(
        "processing",
        "Em execução",
        phase ? `${phase} em progresso.` : "Processamento em curso.",
        "A processar",
      );
    case "completed":
      return present("completed", "Concluído", "Etapa finalizada.", "Concluído");
    case "failed":
      return present("failed", "Falhou", "Esta etapa terminou com erro.", "Falhou");
    case "blocked":
      return present(
        "blocked",
        "Bloqueado",
        "A etapa não pode avançar.",
        "Bloqueado",
        {
          cta: cta(
            "Ver detalhes",
            "Consulte o painel da fase ou a observabilidade.",
            "observability",
            "open_observability",
          ),
        },
      );
    case "waiting_input":
      return present(
        "waiting_user",
        "A sua ação é necessária",
        phase
          ? `${phase}: responda ou aprove no painel abaixo.`
          : "Complete a acção no painel da fase activa.",
        "A sua vez",
        {
          cta: ctaForPhaseLabel(
            phase ?? "",
            "Ir para o painel",
            "Use clarificação, estratégia ou execução conforme a fase.",
            "clarification_spec",
          ),
        },
      );
    case "waiting_user":
      return present(
        "waiting_user",
        "Aguardando a sua decisão",
        phase ? `${phase} precisa de aprovação ou confirmação.` : "Decisão humana necessária.",
        "A sua vez",
        {
          cta: ctaForPhaseLabel(
            phase ?? "",
            "Decidir agora",
            "Abra o painel da fase activa.",
            "refined_plan",
          ),
        },
      );
    case "paused":
      return present("paused", "Pausado", "A execução está em pausa.", "Pausado");
    case "cancelled":
      return present("failed", "Cancelado", "A etapa foi cancelada.", "Cancelado");
    default:
      return present("blocked", "Estado", String(status), "—");
  }
}

/** Rótulo curto para badges da timeline (sem expor snake_case). */
export function humanOperationalStepBadgeLabel(
  status: OperationalStepStatus,
  ctx?: { semanticPhaseLabel?: string },
): string {
  return translateOperationalStepStatus(status, ctx).badge;
}

// ——— Foco operacional da corrida (hero / ribbon) ———

export function translateRunOperationalFocus(input: {
  summary: RunSummaryDto;
  clarificationPhase: ClarificationRuntimePhase | null;
  strategyPhase: StrategyRuntimePhase | null;
  executionPhase?: ExecutionLifecyclePhase | null;
}): HumanOperationalPresentation {
  const { summary, clarificationPhase, strategyPhase, executionPhase } = input;
  const life = mapRawPhaseToLifecycleId(summary.phase);

  if (summary.state === "success") {
    return present(
      "completed",
      "Atividade concluída",
      "A corrida terminou com sucesso.",
      "Concluído",
    );
  }
  if (summary.state === "failed") {
    return translateRuntimeUiState("failed");
  }

  if (life === "clarification" && clarificationPhase) {
    return translateClarificationRuntimePhase(clarificationPhase);
  }
  if (life === "strategy" && strategyPhase) {
    return translateStrategyRuntimePhase(strategyPhase);
  }
  if (
    (life === "execution" || life === "review" || life === "correction") &&
    executionPhase
  ) {
    return translateExecutionLifecyclePhase(executionPhase);
  }

  if (
    summary.state === "waiting_clarification_answers" ||
    summary.state === "waiting_approval"
  ) {
    return translateRuntimeUiState(summary.state);
  }
  if (summary.state === "running" || summary.state === "correcting" || summary.state === "retrying") {
    return present(
      "processing",
      lifecyclePhaseLabel(life),
      translateRuntimeUiState(summary.state).description,
      "A processar",
    );
  }

  return present(
    mapLifecycleToHumanKind(life, summary.state),
    lifecyclePhaseLabel(life),
    translateRuntimeUiState(
      summary.state in RUNTIME_UI_MAP ? summary.state : "running",
    ).description,
    humanKindBadge(mapLifecycleToHumanKind(life, summary.state)),
  );
}

function mapLifecycleToHumanKind(
  life: LifecyclePhaseId,
  state: RunSummaryDto["state"],
): HumanOperationalKind {
  if (state === "blocked" || state === "warning") return "blocked";
  if (state === "failed") return "failed";
  if (life === "completed") return "completed";
  if (
    state === "waiting_clarification_answers" ||
    state === "waiting_approval"
  ) {
    return "waiting_user";
  }
  return "processing";
}

function humanKindBadge(kind: HumanOperationalKind): string {
  switch (kind) {
    case "processing":
      return "A processar";
    case "waiting_user":
      return "A sua vez";
    case "completed":
      return "Concluído";
    case "blocked":
      return "Bloqueado";
    case "failed":
      return "Falhou";
    case "paused":
      return "Pausado";
    default:
      return "—";
  }
}

/** Headline curta para cards e ribbon (substitui resolveOperationalHeadline). */
export function resolveHumanOperationalHeadline(input: {
  summary: RunSummaryDto;
  clarificationPhase: ClarificationRuntimePhase | null;
  strategyPhase: StrategyRuntimePhase | null;
  executionPhase?: ExecutionLifecyclePhase | null;
}): string {
  return translateRunOperationalFocus(input).headline;
}

/** Compat: rótulos de fase runtime → humanos (substitui CLARIFICATION_RUNTIME_PHASE_LABELS_PT). */
export function humanClarificationPhaseBadge(
  phase: ClarificationRuntimePhase | null | undefined,
): string {
  return translateClarificationRuntimePhase(phase).badge;
}

export function humanStrategyPhaseBadge(
  phase: StrategyRuntimePhase | null | undefined,
): string {
  return translateStrategyRuntimePhase(phase).badge;
}

/** Traduz phase2Status técnico para observabilidade/checkpoints (não expor cru na timeline). */
export function translatePhase2Status(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return "—";
  const map: Record<string, string> = {
    questions_generated: "Perguntas geradas",
    answers_recorded: "Respostas registadas",
    plan_refined: "Plano refinado",
    ready_for_execution: "Pronto para execução",
    clarification_initialized: "Clarificação iniciada",
  };
  return map[s] ?? "Etapa de clarificação";
}
