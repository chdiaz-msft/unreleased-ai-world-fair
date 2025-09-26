import braintrust, { initDataset } from "braintrust";
import { z } from "zod";
import changelogData from "../eval/changelogDataset.json";
import { PROJECT_NAME } from "../lib/constants";

interface ChangelogData {
  input: {
    commits: any[];
    repository_url: string;
    since: string;
  };
  expected: string;
}

const repoData: ChangelogData[] = changelogData as ChangelogData[]; 

const project = braintrust.projects.create({
  name: PROJECT_NAME,
});

export const generateChangelog1 = project.prompts.create({
  name: "Generate changelog 1",
  slug: "generate-changelog-1",
  description: "Generate a changelog from a list of unreleased commits",
  model: "gpt-4o",
  messages: [
    {
      content:
        "Summarize the following commits from {{url}} since {{since}} in changelog form. Include a summary of changes at the top since the provided date, followed by individual pull requests (be concise).\n" +
        "\n" +
        "{{commits}}",
      role: "user",
    },
  ],
});

export const generateChangelog2 = project.prompts.create({
  name: "Generate changelog 2",
  slug: "generate-changelog-2",
  description: "Generate a changelog from a list of unreleased commits",
  model: "gpt-4o",
  messages: [
    {
      content:
        "Summarize the following commits from {{url}} since {{since}} in changelog form. Include a summary of changes at the top since the provided date, followed by individual pull requests (be concise).\n" +
        "\n" +
        "Intentionally make the changelog pretty bad and miss important changes.\n" +
        "\n" +
        "{{commits}}",

      role: "user",
    },
  ],
});

export const evalDataset = async () => {
  const dataset = initDataset(PROJECT_NAME, { dataset: "Changelog Dataset" });

  for (let i = 0; i < repoData.length; i++) {
    dataset.update({
      id: `changelog-record-${i}`, // Use stable IDs for idempotency
      input: repoData[i].input,
      expected: repoData[i].expected.replace(/\n/g, ""),
    });
  }

};

export const completenessScorer = project.scorers.create({
  name: "Changelog Completeness Scorer",
  slug: "changelog-completeness-scorer",
  description: "Evaluates the completeness of generated changelogs",
  messages: [
    {
      role: "system",
      content: `You are evaluating the completeness of a changelog generated from a list of git commits.

    **Task**: Rate how comprehensively the changelog captures significant changes while appropriately filtering out trivial ones.

    **Input Data**:
    - Original commit list: {{input.commits}}
    - Generated changelog: {{output}}

    **Evaluation Focus - Completeness**:
    Assess how well the changelog includes all important changes by examining:

    1. **Significant Change Coverage**: Are all major features, bug fixes, breaking changes, and improvements from the commits included?
    2. **Appropriate Filtering**: Are trivial changes (typos, minor formatting, internal refactoring) properly omitted?
    3. **No Major Omissions**: Are there any important user-facing or developer-impacting changes missing from the changelog?
    4. **Balanced Scope**: Does the changelog capture the right level of detail without being overwhelming or insufficient?

    **Completeness Levels**:

    **Excellent**: Changelog includes all significant changes that users and developers need to know about, while appropriately filtering out trivial commits. No important changes are missing.

    **Good**: Changelog captures most significant changes with good judgment about what to include/exclude, but may miss one or two minor-but-notable changes or include some borderline trivial items.

    **Fair**: Changelog covers the main significant changes but has noticeable gaps in coverage or includes too many trivial changes, affecting the balance of what should be documented.

    **Poor**: Changelog misses multiple important changes that users need to know about, or is cluttered with trivial changes that obscure the significant ones.

    **Output Format**:
    Reasoning: [Detailed analysis of which significant changes are included/missing, assessment of filtering decisions, and evaluation of overall coverage]
    Choice: Excellent, Good, Fair, or Poor`,
    }
  ],
  model: "gpt-4.1",
  useCot: true,
  choiceScores: {
    Excellent: 1,
    Good: 0.75,
    Fair: 0.5,
    Poor: 0.25,
  },
});

export const accuracyScorer = project.scorers.create({
  name: "Changelog Accuracy Scorer",
  slug: "changelog-accuracy-scorer",
  description: "Evaluates the accuracy of a generated changelogs",
  messages: [
    {
      role: "system",
      content: `
  You are evaluating the accuracy of a changelog generated from a list of git commits.

  **Task**: Rate how accurately the changelog represents the actual changes described in the commits.

  **Input Data**:
  - Original commit list: {{input.commits}}
  - Generated changelog: {{output}}

  **Evaluation Focus - Accuracy**:
  Assess how well the changelog reflects the actual changes by examining:

  1. **Factual Correctness**: Does the changelog accurately describe what was actually changed according to the commits?
  2. **No Misrepresentation**: Are there any changes described in the changelog that don't match the commit details?
  3. **Technical Precision**: Are technical details, feature names, and implementation specifics correctly captured?
  4. **Change Impact**: Is the significance and scope of changes accurately represented (e.g., breaking vs. non-breaking)?

  **Accuracy Levels**:

  **Excellent**: Changelog perfectly matches commit details with no factual errors, misrepresentations, or technical inaccuracies. Every described change can be directly traced to specific commits.

  **Good**: Changelog accurately represents the vast majority of changes with only very minor discrepancies that don't affect understanding of what was actually implemented.

  **Fair**: Changelog generally reflects the commits but contains some noticeable inaccuracies in describing changes, feature details, or impact that could mislead users about what was actually done.

  **Poor**: Changelog contains significant factual errors, misrepresents changes, or describes things that weren't actually implemented according to the commits.

  **Output Format**:
  Reasoning: [Detailed analysis comparing specific changelog entries to corresponding commits, noting any discrepancies or confirming accuracy]
  Choice: Excellent, Good, Fair, or Poor`,
    }
  ],
  model: "gpt-4.1",
  useCot: true,
  choiceScores: {
    Excellent: 1,
    Good: 0.75,
    Fair: 0.5,
    Poor: 0.25,
  },
});

export const formattingScorer = project.scorers.create({
  name: "Changelog Formatting Scorer",
  slug: "changelog-formatting-scorer",
  description: "Evaluates the formatting of a changelog so it contains the correct sections in the correct order.",
  parameters: z.object({
    output: z.string(),
  }),
  handler: async({ output }) => {
    const sections = [
      '🚨 Breaking Changes',
      '✨ New Features', 
      '🔧 Improvements',
      '🐛 Bug Fixes'
    ];

    // Find all sections that exist in the output with their positions
    const foundSections: { index: number; position: number }[] = [];
    
    sections.forEach((section, index) => {
      const position = output.indexOf(section);
      if (position !== -1) {
        foundSections.push({ index, position });
      }
    });

    // Return 0 if no sections found
    if (foundSections.length === 0) {
      return 0;
    }

    // If only one section, return 1 (correct by default)
    if (foundSections.length === 1) {
      return 1;
    }

    // Check if sections are in correct order
    foundSections.sort((a, b) => a.position - b.position);
    
    for (let i = 1; i < foundSections.length; i++) {
      if (foundSections[i].index <= foundSections[i - 1].index) {
        return 0; // Wrong order
      }
    }

    return 1; // Sections found and in correct order
  },
});

evalDataset();
