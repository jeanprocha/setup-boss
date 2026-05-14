const { loadQueueUnsafe, listSorted } = require("../../daemon/lib/queue-store");
const { getSetupBossRepoRoot } = require("../../daemon/lib/repo-root");
const { resolveProjectSelector, deriveProjectId, canonicalProjectRoot } = require(
  "../../daemon/lib/project-registry",
);

/** @param {{ projectId?: string|null, projectRootCanonical?: string|null }} ctx @param {object} j */
function jobMatches(ctx, j) {
  if (!ctx || (!ctx.projectId && !ctx.projectRootCanonical)) return true;

  const pid =
    j.projectId != null && String(j.projectId).trim()
      ? String(j.projectId).trim()
      : j.projectRoot
        ? deriveProjectId(String(j.projectRoot))
        : null;

  if (ctx.projectId && pid !== ctx.projectId) return false;

  if (
    ctx.projectRootCanonical &&
    canonicalProjectRoot(String(j.projectRoot || "")) !== ctx.projectRootCanonical
  )
    return false;

  return true;
}

/** @param {string[]} argv */
async function runQueue(argv) {
  const j = argv.includes("--json");

  const pArg = argv.find((a) => a.startsWith("--project="));

  const projectSel = pArg ? String(pArg.slice("--project=".length)).trim() : null;

  /** @type {{ projectId?: string|null, projectRootCanonical?: string|null }} */
  let ctx = {};

  if (projectSel) {
    const r = resolveProjectSelector(projectSel, getSetupBossRepoRoot());

    ctx = { projectId: r.projectId || null, projectRootCanonical: r.projectRootCanonical || null };
  }

  try {
    const { isRuntimeApiAvailable, getQueueViaApi } = require("../lib/runtime-api-client");

    if (await isRuntimeApiAvailable()) {
      /** @type {Record<string, string>} */
      const query = {};

      if (ctx.projectId) query.projectId = ctx.projectId;

      if (ctx.projectRootCanonical) query.projectRoot = ctx.projectRootCanonical;

      const r = await getQueueViaApi(query);

      if (
        r.status === 200 &&
        r.json &&
        r.json.ok &&
        Array.isArray(r.json.data?.jobs)

      )


        {


        const rows = /** @type {object[]} */ (r.json.data.jobs);


        if (j) {


          console.log(JSON.stringify(rows, null, 2));


          return;


        }


        console.log("(Runtime API — mais recente por último; use --json)");

        for (const row of rows)


          {


          console.log(


            `${row.createdAt}\t${row.status}\t${row.id}\tproj=${row.projectArg}\ttask=${row.taskArg}`,


          );


        }


        return;


      }


    }


  } catch (_) {

    /* filesystem */

  }



  const q = loadQueueUnsafe();


  const rows = listSorted(q).filter((job) => jobMatches(ctx, job));


  if (j) {


    console.log(JSON.stringify(rows, null, 2));


    return;


  }



  console.log("(mais recente por último; use --json para lista completa)");

  for (const job of rows) {


    console.log(


      `${job.createdAt}\t${job.status}\t${job.id}\tproj=${job.projectArg}\ttask=${job.taskArg}`,


    );


  }



}


module.exports = {

  runQueue,

};
