/** Run the published-data checks. Exit: 0 pass, 1 fatal, 2 review required. */
import dotenv from "dotenv";
import { validatePublishedData } from "../lib/validation/published-data";

dotenv.config({ path: ".env.local" });

validatePublishedData().then((report) => {
  // Both FAIL and REVIEW stop the publishing workflow.
  if (report.result === "FAIL") process.exit(1);
  if (report.result === "REVIEW") process.exit(2);
}).catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
