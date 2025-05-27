import { initLogger, wrapTraced, loadPrompt } from "braintrust";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { GetResponseTypeFromEndpointMethod } from "@octokit/types";
import { Octokit } from "@octokit/rest";
import { PROJECT_NAME, PROMPT_SLUG, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "@/lib/constants";

initLogger({
  projectName: PROJECT_NAME,
  apiKey: process.env.BRAINTRUST_API_KEY,
  // It is safe to set the "asyncFlush" flag to true in Vercel environments
  // because Braintrust calls waitUntil() automatically behind the scenes to
  // ensure your logs are flushed properly.
  asyncFlush: true,
});

// The GITHUB_ACCESS_TOKEN env var is optional. If you provide one,
// you'll be able to run with higher rate limits.
const octokit: Octokit = new Octokit({
  auth: process.env.GITHUB_ACCESS_TOKEN,
});

type CommitsResponse = GetResponseTypeFromEndpointMethod<
  typeof octokit.rest.repos.listCommits
>;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // useCompletion sends { prompt: "..." } by default
    const url = body.prompt || body.url;
    
    if (!url) {
      throw new Error('No URL provided in request');
    }
    
    const response = await handleRequest(url);
    
    // Convert the AI SDK stream to a proper Response
    return response.toDataStreamResponse();
  } catch (error) {
    console.error('Error in POST /generate:', error);
    
    // Return a proper error response
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred while generating the changelog',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

const handleRequest = wrapTraced(async function handleRequest(url: string) {
  try {
    // Parse the URL to get the owner and repo name
    const [owner, repo] = url.split("github.com/")[1].split("/");
    
    const { commits, since } = await getCommits(owner, repo);

    // Load the prompt from Braintrust
    const prompt = await loadPrompt({
      projectName: PROJECT_NAME,
      slug: PROMPT_SLUG,
      defaults: {
        // Default model if not specified in the prompt
        model: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
      },
    });

    // Build the prompt with our input data
    const builtPrompt = prompt.build({
      url,
      since,
      commits: commits.map(({ commit }) => `${commit.message}\n\n`),
    });

    // Extract properties from the built prompt
    const modelName = (builtPrompt as any).model;
    const temperature = (builtPrompt as any).temperature;
    const maxTokens = (builtPrompt as any).max_tokens;
    
    // Use the AI SDK's streamText for streaming responses
    const result = streamText({
      model: openai(modelName),
      messages: builtPrompt.messages as any, // Type assertion for compatibility
      temperature,
      ...(maxTokens && { maxTokens }),
      // Enable telemetry for logging to Braintrust
      experimental_telemetry: { isEnabled: true },
    });
    
    return result;
  } catch (error) {
    console.error('Error in handleRequest:', error);
    throw error; // Re-throw to be caught by the main POST handler
  }
});

const getCommits = wrapTraced(async function getCommits(
  owner: string,
  repo: string
): Promise<{ commits: CommitsResponse['data']; since: string | null }> {
  let since: string | null = null;

  try {
    // Attempt to fetch the latest release from the GitHub API
    const releaseResponse = await octokit.rest.repos.getLatestRelease({ owner, repo });
    since = releaseResponse.data.published_at;
  } catch (error) {
    // If it's not a 404 error, rethrow it
    if (!(error instanceof Error && 'status' in error && error.status === 404)) {
      throw error;
    }
    // If it's a 404, we'll just continue with since as null
  }

  // Fetch the latest commits (up to 20)
  const commitResponse: CommitsResponse = await octokit.rest.repos.listCommits({
    owner,
    repo,
    since: since ?? undefined,
    per_page: 20,
  });

  const commits = commitResponse.data;

  // If there was no release, set 'since' to the date of the oldest commit
  if (!since && commits.length > 0) {
    since = commits[commits.length - 1].commit.author?.date ?? null;
  }

  return { commits, since };
});

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
