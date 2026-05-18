"use strict";

const fs = require("fs");
const path = require("path");

const OpenAI = require("openai");

const { getRunId, writeRunIndex } = require("../../../core/run-resolver");
const { loadAgent } = require("../../../core/agent-metadata");
const { getModelForStep } = require("../../../core/llm-client");
const {
  validateProjectKnowledgeBase,
  resolveSetupBossRepoRoot,
} = require("../../../core/validate-project-knowledge-base");
const { resolveTargetProjectRoot } = require("../../../core/resolve-target-project-root");
const {
  resolveProjectIaDir,
  resolveProjectIaOutputDir,
} = require("../../shared/ia-path-resolver");
const {
  buildIntakeIaContextSummary,
  iaContextForRunContext,
} = require("./intake-ia-context");
const {
  buildIntakeDiscoveryAnalysis,
  discoveryPhaseForRunContext,
} = require("./intake-discovery");
const { parseTaskIntakeLlmOutput } = require("./intake-llm-parse");
const {
  classifyIntake,
  classificationPhaseForRunContext,
} = require("./classifier");
const {
  buildIntakeManifest,
  validateIntakeArtifactsOrThrow,
} = require("./intake-manifest");
const { listIntakePrincipalArtifacts } = require("./intake-cli-output");

const PREVIEW_MAX = 500;

const TASK_INTAKE_AGENT_FILE = "task-intake.md";

/**
 * @param {{
 *   agentContent: string,
 *   taskContent: string,
 *   intakeContextSummary: object,
 *   discoveryAnalysis: object,
 * }} p
 * @returns {string}
 */
function buildTaskIntakePrompt(p) {
  return `${p.agentContent}

## DADOS DO INTAKE

### intake-context-summary.json

\`\`\`json
${JSON.stringify(p.intakeContextSummary, null, 2)}
\`\`\`

### intake-discovery-analysis.json

\`\`\`json
${JSON.stringify(p.discoveryAnalysis, null, 2)}
\`\`\`

## TASK (conteúdo integral)

${p.taskContent}

---

Segue o contrato de saída do agente (marcadores \`---TASK_DISCOVERY---\` e \`---TASK_PLAN_INITIAL---\`, sem texto extra antes do primeiro marcador).`;
}

/**
 * @param {{
 *   client: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } },
 *   model: string,
 *   prompt: string,
 * }} p
 * @returns {Promise<string>}
 */
async function callTaskIntakeResponsesApi(p) {
  const response = await p.client.responses.create({
    model: p.model,
    input: p.prompt,
  });
  return String(response.output_text || "");
}

/**
 * @param {{
 *   skipLlm: boolean,
 *   llmClient: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } }|null,
 *   taskContent: string,
 *   intakeContextSummary: object,
 *   discoveryAnalysis: object,
 * }} input
 * @returns {Promise<{
 *   status: "completed",
 *   taskDiscoveryMarkdown: string,
 *   taskPlanInitialMarkdown: string,
 * } | {
 *   status: "failed",
 *   error: { code: string, message: string },
 *   rawText?: string,
 * } | {
 *   status: "skipped",
 * }>}
 */
async function runTaskIntakeLlmPhase(input) {
  if (input.skipLlm) {
    return { status: "skipped" };
  }

  const repoRoot = resolveSetupBossRepoRoot();
  const agentPath = path.join(repoRoot, "agents", TASK_INTAKE_AGENT_FILE);
  const { content: agentContent } = loadAgent(agentPath);

  const prompt = buildTaskIntakePrompt({
    agentContent,
    taskContent: input.taskContent,
    intakeContextSummary: input.intakeContextSummary,
    discoveryAnalysis: input.discoveryAnalysis,
  });

  /** @type {{ responses: { create: (opts: object) => Promise<{ output_text?: string }> } }} */
  let client = input.llmClient;
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        status: "failed",
        error: {
          code: "INTAKE_LLM_NO_API_KEY",
          message:
            "OPENAI_API_KEY em falta: defina a variável ou use skipLlm / injeção de llmClient.",
        },
      };
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const model = getModelForStep("intake");
  let rawText = "";
  try {
    rawText = await callTaskIntakeResponsesApi({
      client,
      model,
      prompt,
    });
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    return {
      status: "failed",
      error: { code: "INTAKE_LLM_CALL_ERROR", message },
      rawText: rawText || undefined,
    };
  }

  const parsed = parseTaskIntakeLlmOutput(rawText);
  if (!parsed.ok) {
    return {
      status: "failed",
      error: parsed.error,
      rawText,
    };
  }

  return {
    status: "completed",
    taskDiscoveryMarkdown: parsed.taskDiscoveryMarkdown,
    taskPlanInitialMarkdown: parsed.taskPlanInitialMarkdown,
  };
}

/**
 * @param {string[]} argv
 * @returns {{ project: string|null, task: string|null, skipLlm: boolean, json: boolean }}
 */
function parseIntakeCliArgs(argv) {
  /** @type {{ project: string|null, task: string|null, skipLlm: boolean, json: boolean }} */
  const opts = { project: null, task: null, skipLlm: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      opts.json = true;
      continue;
    }
    if (a === "--skip-llm" || a === "--skipLlm") {
      opts.skipLlm = true;
      continue;
    }
    if (a === "--project") {
      opts.project = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--project=")) {
      opts.project = a.slice("--project=".length);
      continue;
    }
    if (a === "--task") {
      opts.task = argv[++i] != null ? String(argv[i]) : "";
      continue;
    }
    if (a.startsWith("--task=")) {
      opts.task = a.slice("--task=".length);
      continue;
    }
  }
  return opts;
}

function previewSlice(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= PREVIEW_MAX) return s;
  return `${s.slice(0, PREVIEW_MAX)}…`;
}

/**
 * @param {string} taskRaw
 * @param {string} projectRootAbs
 * @param {string} cwdAbs
 */
function resolveTaskInput(taskRaw, projectRootAbs, cwdAbs) {
  const trimmed = String(taskRaw || "").trim();
  if (!trimmed) {
    const err = new Error("Task vazia: use --task com texto ou caminho para ficheiro.");
    /** @type {any} */ (err).code = "INTAKE_TASK_EMPTY";
    throw err;
  }

  /** @type {string[]} */
  const candidates = [];
  if (path.isAbsolute(trimmed)) {
    candidates.push(path.normalize(trimmed));
  } else {
    candidates.push(path.normalize(path.resolve(cwdAbs, trimmed)));
    candidates.push(path.normalize(path.resolve(projectRootAbs, trimmed)));
  }

  const uniq = [...new Set(candidates)];

  for (const p of uniq) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const content = fs.readFileSync(p, "utf-8");
        return {
          kind: "file",
          path: p,
          content,
          preview: previewSlice(content),
        };
      }
    } catch {
      /* continua */
    }
  }

  return {
    kind: "inline",
    path: null,
    content: trimmed,
    preview: previewSlice(trimmed),
  };
}

/**
 * @param {{
 *   projectArg: string,
 *   taskArg: string,
 *   cwd?: string,
 *   skipLlm?: boolean,
 *   llmClient?: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } },
 * }} input
 * @returns {Promise<{
 *   ok: true,
 *   runId: string,
 *   outputDir: string,
 *   runType: "intake",
 *   classification: string,
 *   confidence: string,
 *   phase1Status: string,
 *   artifacts: Array<{ name: string, path: string, exists: boolean }>,
 *   iaDir: string,
 *   iaSource: string,
 *   task: { kind: string, path: string|null, preview: string },
 * } | {
 *   ok: false,
 *   runId: null,
 *   outputDir: null,
 *   runType: "intake",
 *   error: { code: string, message: string },
 * }>}
 */
async function executeIntake(input) {
  const cwdAbs = path.resolve(input.cwd || process.cwd());
  const runType = "intake";
  const skipLlm = Boolean(input.skipLlm);

  try {
    if (input.projectArg == null || String(input.projectArg).trim() === "") {
      const e = new Error("projectArg obrigatório (ex.: --project <caminho>).");
      /** @type {any} */ (e).code = "INTAKE_PROJECT_MISSING";
      throw e;
    }
    if (input.taskArg == null || String(input.taskArg).trim() === "") {
      const e = new Error("taskArg obrigatório (ex.: --task \"…\" ou ficheiro).");
      /** @type {any} */ (e).code = "INTAKE_TASK_MISSING";
      throw e;
    }

    let projectRootAbs = path.isAbsolute(String(input.projectArg).trim())
      ? path.resolve(String(input.projectArg).trim())
      : path.resolve(cwdAbs, String(input.projectArg).trim());

    if (!fs.existsSync(projectRootAbs)) {
      const e = new Error(`Projeto não encontrado: ${projectRootAbs}`);
      /** @type {any} */ (e).code = "INTAKE_PROJECT_NOT_FOUND";
      throw e;
    }
    if (!fs.statSync(projectRootAbs).isDirectory()) {
      const e = new Error(`projectArg deve ser uma pasta: ${projectRootAbs}`);
      /** @type {any} */ (e).code = "INTAKE_PROJECT_NOT_DIR";
      throw e;
    }

    const taskResolved = resolveTaskInput(
      String(input.taskArg),
      projectRootAbs,
      cwdAbs,
    );

    const runIdSeed =
      taskResolved.kind === "file" && taskResolved.path
        ? taskResolved.path
        : taskResolved.content.slice(0, 200);
    const runId = getRunId(runIdSeed);

    const setupBossRoot = resolveSetupBossRepoRoot();
    const targetResolved = resolveTargetProjectRoot(projectRootAbs, {
      setupBossRoot,
      forbidSetupBossRoot: true,
    });
    if (!targetResolved.ok) {
      const fail = {
        ok: false,
        code: targetResolved.code,
        phase: "knowledge_bootstrap_missing",
        title: targetResolved.title,
        message: targetResolved.message,
        description: targetResolved.description,
        docsIaPath: path.join("docs", ".IA"),
        relativePath: "docs/.IA",
      };
      try {
        const { getTraceContext, appendRuntimeTrace } = require("../runtime-observability/runtime-trace");
        if (getTraceContext()) {
          appendRuntimeTrace({
            component: "intake",
            event: "knowledge_bootstrap_failed",
            phase: "initialization",
            step: "validate_docs_ia",
            level: "error",
            message: "target project root unresolved",
            projectRoot: projectRootAbs,
            derivedFrom: "state",
            source: "daemon",
            metadata: {
              code: fail.code,
              setupBossRoot,
              targetProjectRoot: projectRootAbs,
            },
          });
        }
      } catch (_) {
        /* opcional */
      }
      const e = new Error(fail.message);
      /** @type {any} */ (e).code = fail.code;
      /** @type {any} */ (e).knowledgeBootstrap = fail;
      throw e;
    }

    const targetProjectRoot = targetResolved.targetProjectRoot;

    try {
      const { getTraceContext, appendRuntimeTrace } = require("../runtime-observability/runtime-trace");
      if (getTraceContext()) {
        appendRuntimeTrace({
          component: "intake",
          event: "knowledge_bootstrap_started",
          phase: "initialization",
          step: "validate_docs_ia",
          message: "knowledge bootstrap validating target project",
          projectRoot: targetProjectRoot,
          derivedFrom: "state",
          source: "daemon",
          metadata: {
            targetProjectRoot,
            setupBossRoot,
            expectedKnowledgePath: targetResolved.expectedKnowledgePath,
          },
        });
      }
    } catch (_) {
      /* opcional */
    }

    const knowledgeBase = validateProjectKnowledgeBase(targetProjectRoot, {
      setupBossRoot,
      forbidSetupBossRoot: true,
      skipTargetRootGuard: true,
    });
    if (!knowledgeBase.ok) {
      try {
        const { getTraceContext, appendRuntimeTrace } = require("../runtime-observability/runtime-trace");
        if (getTraceContext()) {
          appendRuntimeTrace({
            component: "intake",
            event: "knowledge_bootstrap_failed",
            phase: "initialization",
            step: "validate_docs_ia",
            level: "error",
            message: "knowledge base validation failed",
            projectRoot: targetProjectRoot,
            derivedFrom: "state",
            source: "daemon",
            metadata: {
              code: knowledgeBase.code,
              phase: knowledgeBase.phase,
              docsIaPath: knowledgeBase.docsIaPath,
              targetProjectRoot,
              setupBossRoot,
              expectedKnowledgePath: targetResolved.expectedKnowledgePath,
            },
          });
        }
      } catch (_) {
        /* opcional */
      }
      const e = new Error(knowledgeBase.message);
      /** @type {any} */ (e).code = knowledgeBase.code;
      /** @type {any} */ (e).knowledgeBootstrap = knowledgeBase;
      throw e;
    }

    try {
      const { getTraceContext, appendRuntimeTrace } = require("../runtime-observability/runtime-trace");
      if (getTraceContext()) {
        appendRuntimeTrace({
          component: "intake",
          event: "knowledge_bootstrap_ready",
          phase: "initialization",
          step: "validate_docs_ia",
          message: "knowledge bootstrap ready",
          projectRoot: targetProjectRoot,
          derivedFrom: "state",
          source: "daemon",
          metadata: {
            docsIaPath: knowledgeBase.docsIaPath,
            targetProjectRoot,
            setupBossRoot,
          },
        });
      }
    } catch (_) {
      /* opcional */
    }

    projectRootAbs = targetProjectRoot;

    const { iaDir, source: iaSource } = resolveProjectIaDir(projectRootAbs);
    const outputDir = resolveProjectIaOutputDir(projectRootAbs, runId);

    fs.mkdirSync(path.dirname(outputDir), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      const { getTraceContext, appendRuntimeTrace } = require("../runtime-observability/runtime-trace");
      if (getTraceContext()) {
        appendRuntimeTrace({
          component: "intake",
          event: "run_resolver_completed",
          phase: "intake",
          step: "ia_output_dir_ready",
          message: "outputDir IA criado; iaDir resolvido",
          runId,
          outputDir,
          projectRoot: projectRootAbs,
          derivedFrom: "artifact",
          source: "daemon",
          metadata: {
            iaDir,
            iaSource,
            preferredVsLegacy: iaSource,
          },
        });
      }
    } catch (_) {
      /* opcional */
    }

    const iaSummary = buildIntakeIaContextSummary(projectRootAbs);
    const iaContextPayload = iaContextForRunContext(iaSummary);

    const createdAt = new Date().toISOString();
    const projectName = path.basename(projectRootAbs);

    const metadata = {
      run_id: runId,
      created_at: createdAt,
      run_type: runType,
      project_root: projectRootAbs,
      ia_dir: iaDir,
      ia_source: iaSource,
      intake_task_preview: taskResolved.preview,
      task_kind: taskResolved.kind,
      task_path: taskResolved.path,
    };

    const discoveryAnalysis = buildIntakeDiscoveryAnalysis({
      projectRootAbs,
      taskResolved,
      iaSummary,
      generatedAt: createdAt,
    });
    const discoveryPhase = discoveryPhaseForRunContext(discoveryAnalysis);

    const llmPhase = await runTaskIntakeLlmPhase({
      skipLlm,
      llmClient: input.llmClient || null,
      taskContent: taskResolved.content,
      intakeContextSummary: {
        generated_at: createdAt,
        ia_dir: iaSummary.ia_dir,
        ia_source: iaSummary.ia_source,
        files_found: iaSummary.files_found,
        files_missing: iaSummary.files_missing,
        index_found: iaSummary.index_found,
        total_chars: iaSummary.total_chars,
        markdown_markers_found: iaSummary.markdown_markers_found,
        warnings: iaSummary.warnings,
      },
      discoveryAnalysis,
    });

    /** @type {{ status: "completed"|"failed"|"skipped", agent: string, artifacts: string[] }} */
    const phase1Llm = {
      status:
        llmPhase.status === "completed"
          ? "completed"
          : llmPhase.status === "skipped"
            ? "skipped"
            : "failed",
      agent: TASK_INTAKE_AGENT_FILE,
      artifacts:
        llmPhase.status === "completed"
          ? ["task-discovery.md", "task-plan-initial.md"]
          : [],
    };

    const intakeContextSummary = {
      generated_at: createdAt,
      status: iaSummary.status,
      ia_dir: iaSummary.ia_dir,
      ia_source: iaSummary.ia_source,
      files_found: iaSummary.files_found,
      files_missing: iaSummary.files_missing.slice(),
      index_found: iaSummary.index_found,
      total_chars: iaSummary.total_chars,
      markdown_markers_found: iaSummary.markdown_markers_found,
      warnings: iaSummary.warnings,
    };

    const taskDiscoveryTextForClassifier =
      llmPhase.status === "completed" ? llmPhase.taskDiscoveryMarkdown : "";

    const classificationCore = classifyIntake({
      iaContextSummary: intakeContextSummary,
      discoveryAnalysis,
      llmPhase,
      taskDiscoveryText: taskDiscoveryTextForClassifier,
    });

    const classificationGeneratedAt = new Date().toISOString();
    const classificationArtifactPayload = {
      schema_version: "1.0.0",
      generated_at: classificationGeneratedAt,
      classification: classificationCore.classification,
      reason: classificationCore.reason,
      missing_definitions: classificationCore.missing_definitions.slice(),
      signals: classificationCore.signals.slice(),
      confidence: classificationCore.confidence,
    };

    const phase1Classification = classificationPhaseForRunContext(
      classificationCore,
      "intake-classification.json",
    );

    fs.writeFileSync(
      path.join(outputDir, "intake-discovery-analysis.json"),
      JSON.stringify(discoveryAnalysis, null, 2),
      "utf-8",
    );

    if (llmPhase.status === "completed") {
      fs.writeFileSync(
        path.join(outputDir, "task-discovery.md"),
        llmPhase.taskDiscoveryMarkdown,
        "utf-8",
      );
      fs.writeFileSync(
        path.join(outputDir, "task-plan-initial.md"),
        llmPhase.taskPlanInitialMarkdown,
        "utf-8",
      );
    } else if (llmPhase.status === "failed") {
      const errCode =
        llmPhase.error && llmPhase.error.code != null
          ? String(llmPhase.error.code)
          : "INTAKE_LLM_UNKNOWN_ERROR";
      const errMessage =
        llmPhase.error && llmPhase.error.message != null
          ? String(llmPhase.error.message)
          : "Erro LLM sem detalhe.";
      const errPayload = {
        schema_version: "1.0.0",
        generated_at: new Date().toISOString(),
        code: errCode,
        message: errMessage,
        ...(llmPhase.rawText != null
          ? {
              raw_snippet: String(llmPhase.rawText).slice(0, 4000),
            }
          : {}),
      };
      fs.writeFileSync(
        path.join(outputDir, "intake-llm-error.json"),
        JSON.stringify(errPayload, null, 2),
        "utf-8",
      );
    }

    fs.writeFileSync(
      path.join(outputDir, "intake-classification.json"),
      JSON.stringify(classificationArtifactPayload, null, 2),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(outputDir, "metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8",
    );

    const runContext = {
      version: "1.1.0",
      run_type: runType,
      generated_at: createdAt,
      task: {
        kind: taskResolved.kind,
        path: taskResolved.path,
        preview: taskResolved.preview,
      },
      project: {
        name: projectName,
        root: projectRootAbs,
      },
      phase1: {
        status: "classified",
        ia_context: iaContextPayload,
        discovery: discoveryPhase,
        llm: phase1Llm,
        classification: phase1Classification,
        manifest: "intake-manifest.json",
      },
    };

    fs.writeFileSync(
      path.join(outputDir, "run-context.json"),
      JSON.stringify(runContext, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(outputDir, "intake-context-summary.json"),
      JSON.stringify(intakeContextSummary, null, 2),
      "utf-8",
    );

    const manifestGeneratedAt = new Date().toISOString();
    const intakeManifest = buildIntakeManifest({
      runId,
      runType,
      generatedAt: manifestGeneratedAt,
      classification: classificationCore.classification,
      llmStatus: phase1Llm.status,
      outputDir,
    });
    fs.writeFileSync(
      path.join(outputDir, "intake-manifest.json"),
      JSON.stringify(intakeManifest, null, 2),
      "utf-8",
    );

    validateIntakeArtifactsOrThrow(outputDir);

    writeRunIndex({
      runId,
      projectRoot: projectRootAbs,
      outputDir,
      run_type: runType,
    });

    const artifacts = listIntakePrincipalArtifacts(outputDir);

    return {
      ok: true,
      runId,
      outputDir,
      runType,
      classification: classificationCore.classification,
      confidence: classificationCore.confidence,
      phase1Status: runContext.phase1.status,
      artifacts,
      iaDir,
      iaSource,
      task: {
        kind: taskResolved.kind,
        path: taskResolved.path,
        preview: taskResolved.preview,
      },
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && /** @type {any} */ (err).code
        ? String(/** @type {any} */ (err).code)
        : "INTAKE_ERROR";
    const message = err && err.message ? String(err.message) : String(err);
    const kb =
      err && typeof err === "object" && /** @type {any} */ (err).knowledgeBootstrap;
    /** @type {Record<string, unknown>} */
    const error = { code, message };
    if (kb && kb.ok === false) {
      error.title = kb.title;
      error.description = kb.description;
      error.relativePath = kb.relativePath;
      error.documentationHint = kb.documentationHint;
      error.phase = kb.phase;
    }
    return {
      ok: false,
      runId: null,
      outputDir: null,
      runType,
      error,
    };
  }
}

module.exports = {
  executeIntake,
  parseIntakeCliArgs,
  resolveTaskInput,
  previewSlice,
  listIntakePrincipalArtifacts,
};
