"use strict";

const fs = require("fs");
const path = require("path");
const {
  seedSkipLlmIntakeArtifacts,
  seedSkipLlmQuestions,
  seedClarificationRequiredContext,
} = require("../mvp-lifecycle-fixtures");

const CHAT_TASK =
  "Criar componente visual de chat na tela de Integrações, reutilizável, responsivo e compatível com tema claro/escuro. Por enquanto apenas visual.";

const CHAT_COMMENT =
  "criar também componente de botão que abre/fecha o chat";

const CHAT_PLAN_REFINED_MD = `## Objetivo
Criar componente visual de chat na tela de Integrações, reutilizável, responsivo e compatível com tema claro/escuro. Por enquanto apenas visual, sem funcionalidade real.

## Passos Propostos
- Criar componente visual reutilizável do chat na tela de Integrações
- Garantir responsividade do componente
- Garantir compatibilidade com tema claro e escuro

## Fora do Escopo
- Funcionalidade real do chat (envio/recebimento de mensagens)
- Backend ou APIs de mensagens
- Persistência de histórico de conversas
- Integrações com serviços externos de mensageria
- Autenticação ou permissões específicas do chat

## Critérios de Aceite
- O componente de chat aparece corretamente na tela de Integrações
- O componente é reutilizável e responsivo
- O componente respeita tema claro e escuro
`;

/**
 * @param {string} outputDir
 */
function seedChatPlanArtifacts(outputDir) {
  seedSkipLlmIntakeArtifacts(outputDir);
  seedSkipLlmQuestions(outputDir);
  seedClarificationRequiredContext(outputDir);

}

/**
 * Plano refinado rico (após refine skip-llm).
 * @param {string} outputDir
 */
function writeChatPlanRefined(outputDir) {
  fs.writeFileSync(
    path.join(outputDir, "task-plan-refined.md"),
    CHAT_PLAN_REFINED_MD,
    "utf-8",
  );
}

module.exports = {
  CHAT_TASK,
  CHAT_COMMENT,
  CHAT_PLAN_REFINED_MD,
  seedChatPlanArtifacts,
  writeChatPlanRefined,
};
