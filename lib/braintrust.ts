import { initLogger } from "braintrust";
import { PROJECT_NAME } from "./constants";

// Initialize logger once when this module is imported
initLogger({
  projectName: PROJECT_NAME,
  apiKey: process.env.BRAINTRUST_API_KEY,
  // It is safe to set the "asyncFlush" flag to true in Vercel environments
  // because Braintrust calls waitUntil() automatically behind the scenes to
  // ensure your logs are flushed properly.
  asyncFlush: true,
});

// Re-export Braintrust functions for convenience
export { currentLogger, loadPrompt, wrapTraced } from "braintrust"; 