import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";

export const EXECUTION_STEP_CATEGORIES = [
  "intake",
  "runtime",
  "clarification",
  "strategy",
  "execution",
  "validation",
  "human",
  "finalization",
] as const;

export type ExecutionStepCategory =
  (typeof EXECUTION_STEP_CATEGORIES)[number];

/** Nome da chave de ícone em `EXECUTION_STEP_ICON_MAP` (lucide-react). */
export type ExecutionStepIconName =
  | "inbox"
  | "send"
  | "flag"
  | "play"
  | "activity"
  | "messages-square"
  | "help-circle"
  | "message-circle"
  | "badge-check"
  | "git-branch"
  | "shield-check"
  | "list-tree"
  | "layers"
  | "square-stack"
  | "cpu"
  | "file-diff"
  | "files"
  | "scroll-text"
  | "test-tube"
  | "check-circle"
  | "eye"
  | "thumbs-up"
  | "thumbs-down"
  | "wand-2"
  | "refresh-ccw"
  | "rotate-ccw"
  | "octagon-alert"
  | "user-round"
  | "hourglass"
  | "alert-triangle"
  | "pause"
  | "play-circle"
  | "circle-slash"
  | "party-popper"
  | "target"
  | "file-text"
  | "book-marked"
  | "git-commit-horizontal"
  | "git-pull-request";

export type ExecutionStepId =
  | "knowledge_bootstrap"
  | "task_intake"
  | "request_received"
  | "run_created"
  | "run_started"
  | "operational_state"
  | "clarification"
  | "clarification_questions"
  | "clarification_answers"
  | "clarification_approval"
  | "strategy_generated"
  | "strategy_approval"
  | "execution_plan"
  | "current_phase"
  | "current_subtask"
  | "executor_running"
  | "patch_applied"
  | "files_changed"
  | "diff_summary"
  | "tests_running"
  | "tests_result"
  | "review_in_progress"
  | "review_approved"
  | "review_rejected"
  | "auto_correction"
  | "retry_execution"
  | "retry_review"
  | "flow_blocked"
  | "waiting_human_input"
  | "waiting_approval"
  | "action_required"
  | "execution_paused"
  | "execution_resumed"
  | "execution_cancelled"
  | "execution_completed"
  | "final_result"
  | "activity_summary"
  | "knowledge_update"
  | "commit_generated"
  | "pr_generated";

export type ExecutionStepDefinition = {
  id: ExecutionStepId;
  order: number;
  title: string;
  shortDescription: string;
  longDescription: string;
  icon: ExecutionStepIconName;
  defaultStatus: OperationalStepStatus;
  category: ExecutionStepCategory;
  canExpand: boolean;
  supportsLogs: boolean;
  supportsActions: boolean;
  supportsStreaming: boolean;
};

/** Catálogo oficial — ordem fixa do pipeline (1..N). */
export const EXECUTION_STEPS: readonly ExecutionStepDefinition[] = [
  {
    id: "knowledge_bootstrap",
    order: 0,
    title: "Inicialização",
    shortDescription: "Valida e carrega a base de conhecimento `docs/.IA`.",
    longDescription:
      "Confirma que o projecto tem a pasta semântica obrigatória antes de SPEC, clarificação ou execução.",
    icon: "book-marked",
    defaultStatus: "pending",
    category: "intake",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "task_intake",
    order: 1,
    title: "Entrada da tarefa",
    shortDescription: "Recebe o input inicial enviado pelo operador.",
    longDescription:
      "Captura o pedido bruto, metadados mínimos e contexto inicial antes de qualquer processamento no runtime.",
    icon: "inbox",
    defaultStatus: "pending",
    category: "intake",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "request_received",
    order: 2,
    title: "Pedido recebido",
    shortDescription: "O runtime aceitou o pedido e enfileirou o trabalho.",
    longDescription:
      "Confirmação de que o pedido foi validado superficialmente e entrou na fila de orquestração.",
    icon: "send",
    defaultStatus: "pending",
    category: "intake",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "run_created",
    order: 3,
    title: "Corrida criada",
    shortDescription: "Foi criado um job/corrida com identificador estável.",
    longDescription:
      "Materializa a atividade no daemon: run id, vínculo ao projeto e estado inicial persistido.",
    icon: "flag",
    defaultStatus: "pending",
    category: "runtime",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "run_started",
    order: 4,
    title: "Corrida iniciada",
    shortDescription: "O worker começou a executar a corrida.",
    longDescription:
      "Transição de enfileirado para execução ativa no processo do runtime.",
    icon: "play",
    defaultStatus: "pending",
    category: "runtime",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "operational_state",
    order: 5,
    title: "Estado operacional",
    shortDescription: "Fase e estado bruto expostos ao Mission Control.",
    longDescription:
      "Sincroniza fase da API/daemon com o modelo de lifecycle exibido ao operador.",
    icon: "activity",
    defaultStatus: "pending",
    category: "runtime",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "clarification",
    order: 6,
    title: "Clarificação",
    shortDescription:
      "Gera perguntas para reduzir ambiguidades antes da execução.",
    longDescription:
      "Avalia lacunas de contexto e prepara um pacote de clarificação alinhado ao risco da mudança.",
    icon: "messages-square",
    defaultStatus: "pending",
    category: "clarification",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: true,
  },
  {
    id: "clarification_questions",
    order: 7,
    title: "Perguntas de clarificação",
    shortDescription: "Perguntas publicadas e aguardando resposta.",
    longDescription:
      "Lista estruturada de perguntas com prioridade e dependências para o operador.",
    icon: "help-circle",
    defaultStatus: "pending",
    category: "clarification",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "clarification_answers",
    order: 8,
    title: "Respostas da clarificação",
    shortDescription: "Respostas incorporadas ao pacote SPEC.",
    longDescription:
      "Consolida respostas HITL e prepara refinamento ou aprovação.",
    icon: "message-circle",
    defaultStatus: "pending",
    category: "clarification",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "clarification_approval",
    order: 9,
    title: "Aprovação da clarificação",
    shortDescription: "Gate humano antes de avançar para estratégia.",
    longDescription:
      "Confirma que o SPEC refinado está apto para gerar plano de execução.",
    icon: "badge-check",
    defaultStatus: "pending",
    category: "clarification",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "strategy_generated",
    order: 10,
    title: "Estratégia gerada",
    shortDescription: "Plano de alto nível e abordagem recomendada.",
    longDescription:
      "Síntese de riscos, abordagem técnica e critérios de aceitação antes da execução fina.",
    icon: "git-branch",
    defaultStatus: "pending",
    category: "strategy",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "strategy_approval",
    order: 11,
    title: "Aprovação da estratégia",
    shortDescription: "Gate humano sobre o plano proposto.",
    longDescription:
      "Permite ajustes finos e evita execução cara sem alinhamento explícito.",
    icon: "shield-check",
    defaultStatus: "pending",
    category: "strategy",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "execution_plan",
    order: 12,
    title: "Plano de execução",
    shortDescription: "Decomposição em fases e subtarefas.",
    longDescription:
      "Estrutura navegável do trabalho: ordem, dependências e checkpoints.",
    icon: "list-tree",
    defaultStatus: "pending",
    category: "strategy",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "current_phase",
    order: 13,
    title: "Fase atual",
    shortDescription: "Fase corrente dentro do plano materializado.",
    longDescription:
      "Indicador da fatia ativa do DAG/plano linear conforme o orquestrador.",
    icon: "layers",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "current_subtask",
    order: 14,
    title: "Subtask atual",
    shortDescription: "Unidade de trabalho em foco no executor.",
    longDescription:
      "Título, critérios e artefatos esperados para a subtarefa activa.",
    icon: "square-stack",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "executor_running",
    order: 15,
    title: "Executor em execução",
    shortDescription: "Aplica alterações reais nos arquivos permitidos.",
    longDescription:
      "Agente/executor com acesso controlado ao workspace, gerando patches e evidências.",
    icon: "cpu",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: true,
  },
  {
    id: "patch_applied",
    order: 16,
    title: "Patch aplicado",
    shortDescription: "Diff aplicado ao workspace da corrida.",
    longDescription:
      "Confirmação de escrita segura e checksums relevantes quando disponíveis.",
    icon: "file-diff",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "files_changed",
    order: 17,
    title: "Arquivos alterados",
    shortDescription: "Lista resumida de paths impactados.",
    longDescription:
      "Agregação por pasta/tipo para revisão rápida antes de testes.",
    icon: "files",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "diff_summary",
    order: 18,
    title: "Diff resumido",
    shortDescription: "Resumo textual ou métrico do delta.",
    longDescription:
      "Destaques de risco: segurança, performance, breaking changes.",
    icon: "scroll-text",
    defaultStatus: "pending",
    category: "execution",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "tests_running",
    order: 19,
    title: "Testes executando",
    shortDescription: "Suíte de validação automática em curso.",
    longDescription:
      "Streaming de saída ou agregação por casos conforme o adaptador de testes.",
    icon: "test-tube",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "tests_result",
    order: 20,
    title: "Resultado de testes",
    shortDescription: "Passou / falhou com sinalização de flakes.",
    longDescription:
      "Consolidação de relatórios e anexos para o review humano.",
    icon: "check-circle",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "review_in_progress",
    order: 21,
    title: "Review em andamento",
    shortDescription: "Valida semanticamente a execução realizada.",
    longDescription:
      "Segunda linha de defesa: consistência com SPEC, políticas e risco.",
    icon: "eye",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: true,
  },
  {
    id: "review_approved",
    order: 22,
    title: "Review aprovado",
    shortDescription: "Review aceito; libera encerramento ou próxima iteração.",
    longDescription:
      "Registo de quem aprovou e quais checks foram considerados determinísticos.",
    icon: "thumbs-up",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "review_rejected",
    order: 23,
    title: "Review rejeitado",
    shortDescription: "Feedback estruturado para correção.",
    longDescription:
      "Motivos de rejeição e hints para regeneração ou patch manual.",
    icon: "thumbs-down",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "auto_correction",
    order: 24,
    title: "Correção automática",
    shortDescription: "Tentativa automática de corrigir falhas detectadas.",
    longDescription:
      "Loop de correção com limites de tentativa e políticas de rollback.",
    icon: "wand-2",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: true,
  },
  {
    id: "retry_execution",
    order: 25,
    title: "Retry de execução",
    shortDescription: "Nova tentativa da mesma subtarefa ou fase.",
    longDescription:
      "Backoff, reaproveitamento de cache e invalidação de artefatos obsoletos.",
    icon: "refresh-ccw",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "retry_review",
    order: 26,
    title: "Retry de review",
    shortDescription: "Reexecuta o passo de review após correções.",
    longDescription:
      "Útil quando o review é não-determinístico ou depende de estado externo.",
    icon: "rotate-ccw",
    defaultStatus: "pending",
    category: "validation",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "flow_blocked",
    order: 27,
    title: "Bloqueio do fluxo",
    shortDescription: "Dependência externa ou política impediu avanço.",
    longDescription:
      "Requer intervenção humana ou de sistema para destravar o DAG.",
    icon: "octagon-alert",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "waiting_human_input",
    order: 28,
    title: "Esperando input humano",
    shortDescription: "Operador deve fornecer dados adicionais.",
    longDescription:
      "Formulários ou anexos pendentes antes de retomar o pipeline.",
    icon: "user-round",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "waiting_approval",
    order: 29,
    title: "Esperando aprovação",
    shortDescription: "Gate explícito de aprovação em qualquer fase.",
    longDescription:
      "Pode referir-se a clarificação, estratégia ou review final.",
    icon: "hourglass",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "action_required",
    order: 30,
    title: "Ação requerida",
    shortDescription: "Passo manual fora do happy path.",
    longDescription:
      "Checklist curta do que falta para destravar o estado operacional.",
    icon: "alert-triangle",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "execution_paused",
    order: 31,
    title: "Execução pausada",
    shortDescription: "Pausa cooperativa ou operador-initiated.",
    longDescription:
      "Não consome worker; estado persistido para retomada idempotente.",
    icon: "pause",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: true,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "execution_resumed",
    order: 32,
    title: "Execução retomada",
    shortDescription: "Retorno ao processamento após pausa.",
    longDescription:
      "Revalida pré-condições e reancora o cursor do orquestrador.",
    icon: "play-circle",
    defaultStatus: "pending",
    category: "human",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "execution_cancelled",
    order: 33,
    title: "Execução cancelada",
    shortDescription: "Corrida interrompida antes do sucesso.",
    longDescription:
      "Motivo de cancelamento e artefatos parciais preservados para auditoria.",
    icon: "circle-slash",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "execution_completed",
    order: 34,
    title: "Execução concluída",
    shortDescription: "Pipeline terminou com sucesso operacional.",
    longDescription:
      "Último checkpoint verde antes de consolidar entregáveis.",
    icon: "party-popper",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: true,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "final_result",
    order: 35,
    title: "Resultado final",
    shortDescription: "Pacote de saída e evidências principais.",
    longDescription:
      "Agrega artefatos, métricas e links para PR/commit quando existirem.",
    icon: "target",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "activity_summary",
    order: 36,
    title: "Resumo da atividade",
    shortDescription: "Narrativa curta do que foi feito.",
    longDescription:
      "Destinado a relatórios humanos e handoff entre equipas.",
    icon: "file-text",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "knowledge_update",
    order: 37,
    title: "Knowledge update",
    shortDescription: "Atualização proposta à base de conhecimento (.IA).",
    longDescription:
      "Sugestões versionadas e diff textual antes de merge no repositório.",
    icon: "book-marked",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
  {
    id: "commit_generated",
    order: 38,
    title: "Commit gerado",
    shortDescription: "Commit local ou remoto referenciado pela corrida.",
    longDescription:
      "Metadados de autor, mensagem e hashes para rastreabilidade.",
    icon: "git-commit-horizontal",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: false,
    supportsActions: false,
    supportsStreaming: false,
  },
  {
    id: "pr_generated",
    order: 39,
    title: "Pull request gerado",
    shortDescription: "Ligação ao PR/MR quando integrações existirem.",
    longDescription:
      "URL, estado de CI e revisores sugeridos para fecho do ciclo.",
    icon: "git-pull-request",
    defaultStatus: "pending",
    category: "finalization",
    canExpand: true,
    supportsLogs: false,
    supportsActions: true,
    supportsStreaming: false,
  },
] as const;

const STEP_BY_ID = new Map(
  EXECUTION_STEPS.map((s) => [s.id, s] as const),
);

export function getExecutionStepDefinition(
  id: ExecutionStepId,
): ExecutionStepDefinition | undefined {
  return STEP_BY_ID.get(id);
}

export function executionStepsForCategory(
  cat: ExecutionStepCategory,
): readonly ExecutionStepDefinition[] {
  return EXECUTION_STEPS.filter((s) => s.category === cat);
}
