# AIE World's Fair Workshop

This workshop contains a simple web application that allows you to inspect commits from your favorite
open source repos that have not been released yet, and summarize what's coming. It comes fully
baked with Braintrust setup for logging, evals, and prompt management.

## Requirements

- Braintrust Account (setup below)
- `OPENAI_API_KEY`

## Getting started

- Clone this repo locally

```bash
git clone https://github.com/cesteban29/repo-changelog-generator.git
```

- Create a [Braintrust]("https://braintrust.dev") account and [create an API key](https://www.braintrust.dev/app/settings?subroute=api-keys).
- Plug in your OpenAI API key in the [settings page](https://www.braintrust.dev/app/settings?subroute=secrets).
- Copy the .env.local.example file to a .env.local and input your `BRAINTRUST_API_KEY`, `OPENAI_API_KEY`, and, optionally, a `GITHUB_ACCESS_TOKEN`

```bash
cp .env.local.example .env.local
```

### Installing JS dependencies

Install [pnpm](https://pnpm.io/installation) or a package manager of your choice. Then, run

```bash
pnpm install
```

This will install the necessary dependencies and setup the project in Braintrust. If you visit Braintrust, you
should see a project named `Unreleased-AI`, containing the following:
- 2 prompts
- 3 scorers
- 1 dataset

### Running the app

```bash
pnpm dev
```

will start the Next.js app on `localhost:3000`.

### Running evals

```bash
pnpm eval
```

This will run the evals defined in [changelog.eval.ts](./eval/changelog.eval.ts) and log the results to Braintrust.

To run a [remote eval](https://www.braintrust.dev/docs/guides/remote-evals) run the command below:

```bash
pnpm remote-eval
```

This will expose the `Eval` running at [remoteEval.eval.ts](./eval/remoteEval.eval.ts) on your local machine.  As a default, the server is exposed at `http://localhost:8300`.

**Remote evals are currently in beta!**

## Developing

If you are using an unreleased version of the Braintrust SDK, you can link this repo by running

```
pnpm link ../path/to/braintrust-sdk/js
```
