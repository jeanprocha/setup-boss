import fs from "node:fs";
import path from "node:path";

export function readReviewDecision(outputDir) {
  const reviewJsonPath = path.join(outputDir, "review-output.json");

  if (!fs.existsSync(reviewJsonPath)) {
    return {
      approved: false,
      requiresCorrection: true,
      reason: "review-output.json not found",
      review: null
    };
  }

  const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));

  return {
    approved: review.status === "approved",
    requiresCorrection: review.requires_correction === true,
    reason: review.summary || "",
    review
  };
}