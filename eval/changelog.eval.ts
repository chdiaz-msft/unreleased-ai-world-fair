import { invoke, Eval, initDataset, initFunction } from "braintrust";
import { z } from "zod";
import { PROJECT_NAME, PROMPT_SLUG } from "@/lib/constants";


const accuracyScorer = initFunction({
  projectName: PROJECT_NAME,
  slug: "changelog-accuracy-scorer",
})

const completenessScorer = initFunction({
  projectName: PROJECT_NAME,
  slug: "changelog-completeness-scorer",
})

const formattingScorer = initFunction({
  projectName: PROJECT_NAME,
  slug: "changelog-formatting-scorer",
})

Eval(PROJECT_NAME, {
  data: initDataset({project: PROJECT_NAME, dataset: 'Changelog Dataset'}),
  task: async (input) =>
    await invoke({
      projectName: PROJECT_NAME,
      slug: PROMPT_SLUG,
      input,
      schema: z.string(),
    }),
  scores: [accuracyScorer, completenessScorer, formattingScorer],
});
