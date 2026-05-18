/**
 * Timeouts do proxy Next → daemon (devem ser >= client timeoutMs).
 */
export function resolveRuntimeProxyTimeoutMs(
  method: "GET" | "POST" | "PUT" | "DELETE",
  segments: string[],
): number {
  if (method === "POST" || method === "PUT") {
    const longGitPost =
      segments.length >= 3 &&
      segments[0] === "projects" &&
      segments[1] === "git" &&
      segments[2] === "register";
    if (longGitPost) return 180_000;

    const createRunPost = segments.length === 1 && segments[0] === "runs";
    if (createRunPost) return 125_000;

    const strategyPost =
      segments.length === 3 && segments[0] === "runs" && segments[2] === "strategy";
    if (strategyPost) return 120_000;

    const planPresentationBasePut =
      method === "PUT" &&
      segments.length === 3 &&
      segments[0] === "runs" &&
      segments[2] === "plan-presentation-base";
    if (planPresentationBasePut) return 30_000;

    return 15_000;
  }

  if (method === "DELETE") {
    const deleteProject = segments.length === 2 && segments[0] === "projects";
    if (deleteProject) return 45_000;
  }

  if (method === "GET") {
    const observabilityGet =
      segments.length === 3 && segments[0] === "runs" && segments[2] === "runtime-observability";
    if (observabilityGet) return 20_000;

    const governanceGet =
      segments.length === 3 &&
      segments[0] === "projects" &&
      segments[2] === "governance";
    if (governanceGet) return 50_000;

    const projectBundleGet =
      segments.length === 2 && segments[0] === "projects";
    if (projectBundleGet) return 15_000;
  }

  return 8_000;
}
