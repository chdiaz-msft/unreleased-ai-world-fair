import { initLogger, wrapTraced, loadPrompt, currentLogger } from "braintrust";
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
  const logger = currentLogger();
  
  if (!logger) {
    console.error('Braintrust logger not initialized');
    return new Response(
      JSON.stringify({ error: 'Logging not initialized' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return logger.traced(async (rootSpan) => {
    try {
      const body = await req.json();
      
      // useCompletion sends { prompt: "..." } by default
      const url = body.prompt || body.url;
      
      if (!url) {
        throw new Error('No URL provided in request');
      }

      // Parse the URL to get the owner and repo name
      const [owner, repo] = url.split("github.com/")[1].split("/");

      // Step 1: Get commits from GitHub
      const { commits, since } = await rootSpan.traced(async (commitsSpan) => {
        commitsSpan.log({
          input: { owner, repo },
          metadata: { operation: 'get_commits_start' },
        });

        let since: string | null = null;

        // Step 1a: Try to get latest release
        const releaseResult = await rootSpan.traced(async (releaseSpan) => {
          releaseSpan.log({
            input: { owner, repo },
            metadata: { operation: 'fetch_latest_release', github_api_call: true },
          });

          try {
            const releaseResponse = await octokit.rest.repos.getLatestRelease({ owner, repo });
            const since = releaseResponse.data.published_at;
            
            releaseSpan.log({
              output: {
                release_found: true,
                release_tag: releaseResponse.data.tag_name,
                published_at: since,
              },
              metadata: { operation: 'fetch_latest_release_success' },
            });
            
            return { since };
          } catch (error) {
            const isNotFound = error instanceof Error && 'status' in error && error.status === 404;
            
            releaseSpan.log({
              output: {
                release_found: false,
                error: isNotFound ? 'No releases found' : 'API error',
              },
              metadata: { 
                operation: 'fetch_latest_release_error',
                error_type: isNotFound ? 'not_found' : 'api_error',
              },
            });

            if (!isNotFound) {
              throw error;
            }
            
            return { since: null };
          }
        }, { name: 'get_latest_release', type: 'function' });

        since = releaseResult.since;

        // Step 1b: Fetch commits
        const commits = await rootSpan.traced(async (fetchSpan) => {
          fetchSpan.log({
            input: { 
              owner, 
              repo, 
              since,
              per_page: 20,
            },
            metadata: { operation: 'fetch_commits', github_api_call: true },
          });

          const commitResponse: CommitsResponse = await octokit.rest.repos.listCommits({
            owner,
            repo,
            since: since ?? undefined,
            per_page: 20,
          });

          const commits = commitResponse.data;

          fetchSpan.log({
            output: {
              commits_found: commits.length,
              commits: commits.map(({ commit, sha }) => ({
                sha: sha.substring(0, 7),
                message: commit.message.split('\n')[0], // First line only
                author: commit.author?.name,
                date: commit.author?.date,
              })),
            },
            metadata: { operation: 'fetch_commits_success' },
          });

          return commits;
        }, { name: 'fetch_commits', type: 'function' });

        // If there was no release, set 'since' to the date of the oldest commit
        if (!since && commits.length > 0) {
          since = commits[commits.length - 1].commit.author?.date ?? null;
        }

        commitsSpan.log({
          output: {
            commits_count: commits.length,
            since_date: since,
            has_release: releaseResult.since !== null,
          },
          metadata: { operation: 'get_commits_complete' },
        });

        return { commits, since };
      }, { name: 'get_commits', type: 'function' });

      // Step 2: Load prompt from Braintrust
      const prompt = await rootSpan.traced(async (promptSpan) => {
        const data = {
          url,
          since,
          commits: commits.map(({ commit }) => `${commit.message}\n\n`),
        };

        promptSpan.log({
          input: {
            project_name: PROJECT_NAME,
            prompt_slug: PROMPT_SLUG,
            variables: {
              url: data.url,
              since: data.since,
              commits_count: data.commits.length,
            },
          },
          metadata: { operation: 'load_prompt', braintrust_api_call: true },
        });

        const prompt = await loadPrompt({
          projectName: PROJECT_NAME,
          slug: PROMPT_SLUG,
          defaults: {
            model: DEFAULT_MODEL,
            temperature: DEFAULT_TEMPERATURE,
          },
        });

        const builtPrompt = prompt.build(data);
        const modelName = (builtPrompt as any).model;
        const temperature = (builtPrompt as any).temperature;
        const maxTokens = (builtPrompt as any).max_tokens;

        promptSpan.log({
          output: {
            model: modelName,
            temperature,
            max_tokens: maxTokens,
            messages_count: builtPrompt.messages?.length || 0,
          },
          metadata: { operation: 'load_prompt_success' },
        });

        return {
          model: modelName,
          temperature,
          maxTokens,
          messages: builtPrompt.messages,
        };
      }, { name: 'load_prompt', type: 'function' });

      // Step 3: Generate changelog with OpenAI
      const generatedChangelog = await rootSpan.traced(async (generateSpan) => {
        generateSpan.log({
          input: {
            model: prompt.model,
            temperature: prompt.temperature,
            max_tokens: prompt.maxTokens,
            messages_count: prompt.messages.length,
          },
          metadata: { operation: 'generate_changelog', openai_api_call: true },
        });

        generateSpan.log({
          output: {
            status: 'streaming_initiated',
          },
          metadata: { operation: 'generate_changelog_streaming' },
        });

        return 'Streaming response initiated';
      }, { name: 'generate_changelog', type: 'llm' });

      // Log the root span with complete input/output
      rootSpan.log({
        input: {
          repository_url: url,
          since,
          commits: commits.map(({ commit }) => ({
            message: commit.message,
            author: commit.author?.name,
            date: commit.author?.date,
          })),
        },
        output: {
          generated_changelog: generatedChangelog,
        },
        metadata: {
          operation: 'generate_changelog',
          repository: `${owner}/${repo}`,
          commits_processed: commits.length,
          since_date: since,
        },
      });

      // Convert the AI SDK stream to a proper Response
      const result = streamText({
        model: openai(prompt.model),
        messages: prompt.messages as any,
        temperature: prompt.temperature,
        ...(prompt.maxTokens && { maxTokens: prompt.maxTokens }),
        // Disable telemetry here since we're handling tracing manually
        experimental_telemetry: { isEnabled: false },
      });

      return result.toDataStreamResponse();
    } catch (error) {
      console.error('Error in POST /generate:', error);
      
      rootSpan.log({
        input: { error_occurred: true },
        output: { error: error instanceof Error ? error.message : 'Unknown error' },
        metadata: { operation: 'generate_changelog_error' },
      });
      
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
  }, {
    name: 'generate_changelog_request',
    type: 'llm',
  });
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
