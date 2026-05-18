import type { RuntimeUiState } from "../runtime-ui-types.ts";

export function mapJobStatusToUiState(status: string): RuntimeUiState {
  switch (status) {
    case "running":
      return "running";
    case "pending":
      return "blocked";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    case "cancelled":
    case "cancelling":
      return "warning";
    case "blocked":
      return "blocked";
    default:
      return "warning";
  }
}
