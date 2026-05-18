import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { translatePhase2Status } from "@/lib/runtime/translation/runtime-translation-layer";

export type RuntimeCheckpointContext = {
  summary: RunSummaryDto | null;
  /** Nome curto do projecto (ex.: displayName) */
  projectLabel?: string | null;
};

export type RuntimeCheckpointPresentation = {
  title: string;
  description: string;
  details: Array<{ label: string; value: string }>;
  nextAction?: string;
  actor: "system" | "user" | "runtime";
  severity: "info" | "success" | "warning" | "error";
};

function readStr(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNum(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readBool(p: Record<string, unknown>, key: string): boolean | null {
  const v = p[key];
  return typeof v === "boolean" ? v : null;
}

function shortenRunId(id: string): string {
  const s = id.replace(/\\/g, "/").split("/").pop() ?? id;
  return s.length > 36 ? `${s.slice(0, 14)}…${s.slice(-8)}` : s;
}

function classificationHuman(raw: string | null): string {
  const c = (raw || "").trim();
  switch (c) {
    case "needs_context":
      return "Precisa de contexto";
    case "ready_for_clarification":
      return "Pronto para clarificação";
    case "blocked":
      return "Bloqueado";
    default:
      return c || "—";
  }
}

function skipLlmLine(p: Record<string, unknown>): string | null {
  const direct = readBool(p, "skipLlm");
  if (direct !== null) {
    return direct
      ? "Modo local (sem modelo)"
      : "Com modelo (quando disponível)";
  }
  if (
    typeof p.metadata === "object" &&
    p.metadata &&
    !Array.isArray(p.metadata) &&
    "skipLlm" in p.metadata
  ) {
    const m = p.metadata as Record<string, unknown>;
    if (typeof m.skipLlm === "boolean") {
      return m.skipLlm
        ? "Modo local (sem modelo)"
        : "Com modelo (quando disponível)";
    }
  }
  return null;
}

/**
 * Transforma um evento de runtime + contexto da corrida em copy operacional para cards principais.
 * Não altera o pipeline — só apresentação.
 */
export function formatRuntimeCheckpoint(
  ev: RuntimeEventDto,
  ctx: RuntimeCheckpointContext,
): RuntimeCheckpointPresentation {
  const t = ev.type.toLowerCase();
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  const project =
    ctx.projectLabel?.trim() ||
    readStr(p, "projectId") ||
    ctx.summary?.projectId ||
    "Projecto actual";
  const runRef =
    ctx.summary?.runId ??
    ctx.summary?.id ??
    ev.runId ??
    ev.jobId ??
    "—";
  const runShort = shortenRunId(String(runRef));
  const qc = readNum(p, "questionsCount");
  const classification = readStr(p, "classification");
  const phase2Raw = readStr(p, "phase2Status");
  const phase2 = phase2Raw ? translatePhase2Status(phase2Raw) : null;

  const fallback = (): RuntimeCheckpointPresentation => {
    const shortMsg =
      ev.message.length > 140 ? `${ev.message.slice(0, 137)}…` : ev.message;
    return {
      title: "Actualização registada",
      description:
        shortMsg ||
        "Passo registado pelo runtime ou pela interface — veja o nome do evento na linha técnica.",
      details: [
        { label: "Referência", value: runShort },
        { label: "Evento (detalhe)", value: ev.type },
      ],
      nextAction:
        "Confira o estado nos painéis abaixo ou o stream técnico para o registo completo.",
      actor: "system",
      severity:
        ev.severity === "error"
          ? "error"
          : ev.severity === "warn"
            ? "warning"
            : "info",
    };
  };

  if (t === "job_enqueued") {
    const skip = skipLlmLine(p);
    const details: RuntimeCheckpointPresentation["details"] = [
      { label: "Projecto", value: String(project) },
    ];
    if (skip) details.push({ label: "Processamento", value: skip });
    details.push({
      label: "Etapa seguinte",
      value: "Criar corrida e analisar a tarefa",
    });
    return {
      title: "Pedido recebido",
      description:
        "O Setup Boss recebeu a sua atividade e colocou o processamento na fila local.",
      details,
      nextAction: "Aguardar a criação da corrida e o início da análise da entrada.",
      actor: "system",
      severity: "info",
    };
  }

  if (t === "run_created") {
    const cls = classificationHuman(classification);
    const details: RuntimeCheckpointPresentation["details"] = [
      { label: "Corrida", value: runShort },
      { label: "Sinal inicial", value: cls },
    ];
    const skip = skipLlmLine(p);
    if (skip) details.push({ label: "Processamento", value: skip });
    return {
      title: "Corrida criada",
      description:
        "Foi reservado um espaço isolado para acompanhar esta atividade do início ao fim.",
      details,
      nextAction: "Analisar a descrição da tarefa (intake) e preparar clarificação se necessário.",
      actor: "system",
      severity: "success",
    };
  }

  if (t === "intake_completed") {
    const cls = classificationHuman(classification);
    const needsContext = (classification || "").trim() === "needs_context";
    return {
      title: "Entrada analisada",
      description: needsContext
        ? "O sistema leu a descrição e concluiu que falta contexto antes de fechar uma SPEC sólida."
        : "O sistema concluiu a análise inicial da tarefa e está pronto para a fase seguinte.",
      details: [
        { label: "Classificação", value: cls },
        { label: "Estado phase1", value: readStr(p, "phase1Status") || "classificado" },
        { label: "Corrida", value: runShort },
      ],
      nextAction: needsContext
        ? "Gerar ou receber perguntas de clarificação para enriquecer o contexto."
        : "Avançar para clarificação ou estratégia conforme o fluxo da corrida.",
      actor: "system",
      severity: needsContext ? "warning" : "success",
    };
  }

  if (t === "clarification_initialized") {
    const n = qc ?? 0;
    if (n === 0) {
      return {
        title: "Clarificação aguardando perguntas",
        description:
          "A etapa de clarificação está aberta, mas ainda não há perguntas guardadas para responder.",
        details: [
          { label: "Estado", value: "Diagnóstico operacional" },
          { label: "Perguntas", value: "0" },
          {
            label: "Nota",
            value:
              "Com processamento local, às vezes as perguntas são geradas logo a seguir — actualize se não vir alteração.",
          },
          ...(phase2 ? [{ label: "Etapa", value: phase2 }] : []),
        ],
        nextAction:
          "Gerar perguntas (local ou via modelo) ou esperar o fallback automático, se aplicável.",
        actor: "system",
        severity: "warning",
      };
    }
    return {
      title: "Clarificação aberta",
      description: `A sessão de clarificação está activa com ${n} pergunta(s) registadas.`,
      details: [
        { label: "Perguntas", value: String(n) },
        ...(phase2 ? [{ label: "Etapa", value: phase2 }] : []),
      ],
      nextAction: "Responder às perguntas obrigatórias para desbloquear o refinamento.",
      actor: "user",
      severity: "success",
    };
  }

  if (t === "clarification_questions_generated") {
    const n = qc ?? 0;
    const src = readStr(p, "source");
    return {
      title: "Perguntas prontas",
      description:
        "Foram geradas perguntas para completar o contexto da atividade antes do refinamento.",
      details: [
        { label: "Perguntas", value: String(n) },
        ...(src ? [{ label: "Origem", value: src === "local_fallback" ? "Heurística local" : src }] : []),
        { label: "Corrida", value: runShort },
      ],
      nextAction: "Responder às perguntas marcadas como obrigatórias.",
      actor: "user",
      severity: n === 0 ? "warning" : "success",
    };
  }

  if (t === "answers_submitted" || t === "clarification_answers_submitted") {
    return {
      title: "Respostas enviadas",
      description:
        "As respostas à clarificação foram registadas; o sistema pode avançar para refinamento da SPEC.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Aguardar geração do plano refinado ou solicitar refinamento.",
      actor: "system",
      severity: "success",
    };
  }

  if (
    t === "task_plan_initial_created" ||
    t.includes("plan_initial") ||
    t === "spec_draft_ready"
  ) {
    return {
      title: "Rascunho de plano disponível",
      description: "Há um plano inicial derivado da entrada e do contexto disponível.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Completar clarificação e gerar versão refinada quando aplicável.",
      actor: "system",
      severity: "info",
    };
  }

  if (t === "refinement_generated" || t === "task_plan_refined_created") {
    return {
      title: "SPEC em revisão",
      description:
        "Uma versão refinada do plano está disponível para leitura e validação.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Rever o texto refinado e preparar aprovação ou novo refinamento.",
      actor: "user",
      severity: "success",
    };
  }

  if (t === "approval_requested") {
    return {
      title: "Aguardando aprovação",
      description:
        "O plano refinado precisa de uma decisão explícita antes de avançar para execução.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Aprovar, pedir ajustes ou rejeitar com notas.",
      actor: "user",
      severity: "warning",
    };
  }

  if (t === "approved") {
    return {
      title: "SPEC aprovada",
      description: "A aprovação foi registada; o fluxo pode continuar para estratégia ou execução.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Seguir para execução ou geração de estratégia conforme a corrida.",
      actor: "user",
      severity: "success",
    };
  }

  if (t === "execution_started") {
    return {
      title: "Execução iniciada",
      description:
        "O runtime começou a aplicar as alterações previstas na estratégia aprovada.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Acompanhar subtarefas, revisões e possíveis correcções.",
      actor: "runtime",
      severity: "info",
    };
  }

  if (t === "retry_started") {
    return {
      title: "Nova tentativa",
      description:
        "O runtime voltou a tentar um passo que tinha falhado ou ficou bloqueado.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Acompanhar o resultado do retry no painel de execução.",
      actor: "runtime",
      severity: "warning",
    };
  }

  if (t === "execution_completed") {
    return {
      title: "Execução concluída",
      description: "O ciclo de execução terminou sem bloqueio final reportado neste evento.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Validar resultado nos artefactos e na revisão se existir.",
      actor: "runtime",
      severity: "success",
    };
  }

  if (t === "review_rejected") {
    return {
      title: "Validação reprovada",
      description:
        "A revisão não aceitou o resultado; será necessário corrigir ou repetir parte do trabalho.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Ler o feedback da revisão e seguir o fluxo de correcção.",
      actor: "user",
      severity: "warning",
    };
  }

  if (t === "review_started") {
    return {
      title: "Validação em curso",
      description: "Foi aberta uma revisão humana ou automática sobre o resultado da execução.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Aguardar parecer ou intervir se for solicitado.",
      actor: "runtime",
      severity: "info",
    };
  }

  if (t === "review_completed") {
    return {
      title: "Validação concluída",
      description: "A revisão foi fechada; verifique o estado da corrida para aprovação ou correcção.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Se aprovado, encerrar ou promover; se não, seguir fluxo de correcção.",
      actor: "system",
      severity: "success",
    };
  }

  if (t === "correction_started") {
    return {
      title: "Correcção iniciada",
      description: "O sistema aplicou ou preparou um ciclo de correcção após revisão ou falha.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Acompanhar subtarefas até novo ponto de revisão.",
      actor: "runtime",
      severity: "warning",
    };
  }

  if (t === "correction_completed") {
    return {
      title: "Correcção concluída",
      description: "O ciclo de correcção terminou; o resultado pode voltar à revisão.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Verificar review ou continuar execução.",
      actor: "runtime",
      severity: "info",
    };
  }

  if (
    t === "run_failed" ||
    t === "job_failed" ||
    t === "execution_failed" ||
    t.includes("_failed")
  ) {
    const msg = readStr(p, "message") || readStr(p, "error") || ev.message;
    return {
      title: "Corrida interrompida",
      description:
        "Algo impediu o progresso automático. O estado da fila ou o log técnico têm mais detalhe.",
      details: [
        { label: "Corrida", value: runShort },
        { label: "Resumo", value: msg.slice(0, 160) + (msg.length > 160 ? "…" : "") },
      ],
      nextAction: "Consultar o stream técnico, corrigir a causa e voltar a tentar se aplicável.",
      actor: "system",
      severity: "error",
    };
  }

  if (t === "rejected") {
    return {
      title: "SPEC não aprovada",
      description:
        "A decisão de reprovação foi registada; é preciso rever o plano ou clarificar novamente.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Ajustar respostas ou plano refinado e voltar a submeter.",
      actor: "user",
      severity: "warning",
    };
  }

  if (t === "refinement_requested") {
    return {
      title: "Refinamento pedido",
      description: "Foi pedida uma nova ronda de refinamento sobre o plano ou SPEC.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Aguardar regeneração ou completar dados em falta.",
      actor: "user",
      severity: "info",
    };
  }

  if (t === "strategy_started" || t === "subtasks_planned") {
    return {
      title: "Planeamento em curso",
      description:
        "O sistema está a decompor a estratégia em passos executáveis.",
      details: [{ label: "Corrida", value: runShort }],
      nextAction: "Aguardar readiness da estratégia ou rever subtarefas quando disponíveis.",
      actor: "system",
      severity: "info",
    };
  }

  if (t.startsWith("intake_")) {
    const phase = readStr(p, "phase") || t.replace(/^intake_/, "");
    return {
      title: "Progresso do pedido",
      description:
        "Estado intermédio registado no cliente enquanto a corrida era criada.",
      details: [
        { label: "Fase", value: phase },
        { label: "Corrida", value: runShort },
      ],
      nextAction: "Aguardar confirmação do runtime ou actualizar a vista.",
      actor: "system",
      severity: ev.severity === "error" ? "error" : "info",
    };
  }

  return fallback();
}
