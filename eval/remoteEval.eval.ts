import { Levenshtein } from "autoevals";
import { Eval, initDataset, wrapOpenAI } from "braintrust";
import OpenAI from "openai";
import { z } from "zod";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { PROJECT_NAME } from "../lib/constants";

const client = wrapOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

Eval("Changelog Generator Eval", {
  data: initDataset(PROJECT_NAME, { dataset: "Changelog Dataset" }),
  task: async (input, { parameters }) => {
    const prompt: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are an expert changelog generator. You are given a list of commits and you need to create a changelog for them.`,
      },
      {
        role: "user",
        content: [
          `Create a ${parameters.detail_level} changelog.`,
          parameters.include_authors
            ? "Make sure to include the authors of the changes."
            : "Do NOT include the authors of the changes.",
          `The target audience of this changelog are ${parameters.target_audience}.`,
          `The most recent commits for ${input.repository_url} since ${input.since} are below:`,
          input.commits.map((commit: any) => 
            `- ${commit.message} (by ${commit.author}, ${commit.date})`
          ).join('\n'),
        ]
          .filter(Boolean)
          .join(" "),
      },
    ];

    const completion = await client.chat.completions.create({
      model: parameters.model,
      messages: prompt,
    });
    console.log(completion.choices[0].message.content);
    return completion.choices[0].message.content ?? "";
  },
  scores: [Levenshtein],
  parameters: {
    model: z
      .string()
      .default("gpt-4o")
      .describe("OpenAI model to use"),

    detail_level: z
      .enum(["short", "standard", "verbose"])
      .default("standard")
      .describe("Detail level of the changelog"),

    include_authors: z
      .boolean()
      .default(true)
      .describe("Include the authors of the changes"),

    target_audience: z
      .enum(["developers", "marketers", "product managers"])
      .default("developers")
      .describe("Target audience of the changelog (developers, marketers, product managers)"),

  },
}); 