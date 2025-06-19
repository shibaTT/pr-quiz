# PR Quiz

[![GitHub Super-Linter](https://github.com/dkamm/pr-quiz/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/dkamm/pr-quiz/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/dkamm/pr-quiz/actions/workflows/check-dist.yml/badge.svg)](https://github.com/dkamm/pr-quiz/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/dkamm/pr-quiz/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/dkamm/pr-quiz/actions/workflows/codeql-analysis.yml)

## Intro

AI Agents are starting to write more code. How do we make sure we understand
what they're writing?

PR Quiz is a GitHub Action that uses AI to generate a quiz based on a pull
request. It can help you, the human reviewer, test your understanding of your AI
Agent's code. (And block you from deploying code you don't understand!)

<img src="assets/demo.gif" alt="Demo" width="100%">

## Getting started

1. Make sure you have an OpenAI API Key and an ngrok auth token (free tier
   works).\*
2. Add the OpenAI API Key and ngrok auth token as action secrets to your
   repository (`settings -> secrets -> actions` in the UI)
3. Add the following `quiz.yml` to your `.github/workflows` directory

```yaml
# quiz.yml

name: PR Quiz

on:
  pull_request_review:
    types: [submitted]

permissions:
  contents: read
  pull-requests: read

jobs:
  quiz:
    name: PR Quiz
    runs-on: ubuntu-latest
    environment: your-environment # TODO: change this to your actual environment
    # Only trigger on approvals to save tokens
    if: github.event.review.state == 'approved'

    steps:
      - name: Checkout
        id: checkout
        uses: actions/checkout@v4

      - name: Serve Quiz
        id: serve-quiz
        uses: dkamm/pr-quiz@v0.1.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          ngrok-authtoken: ${{ secrets.NGROK_AUTHTOKEN }}
```

\*The PR Quiz action creates a temporary webserver inside the GitHub Actions
runner and uses ngrok to create a public tunnel to it

## Inputs

| Name                    | Description                                                                                                                           | Default Value                                                                                                                    | Required |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| github-token            | GitHub token for API access                                                                                                           | -                                                                                                                                | Yes      |
| ngrok-authtoken         | The ngrok authtoken to use for the server hosting the quiz.                                                                           | -                                                                                                                                | Yes      |
| openai-api-key          | OpenAI API key for API access                                                                                                         | -                                                                                                                                | Yes      |
| model                   | The model to use for generating the quiz. It must be a model that supports structured outputs.                                        | `o4-mini`                                                                                                                        | No       |
| lines-changed-threshold | The minimum number of lines changed required to create a quiz. This is to prevent quizzes from being created for small pull requests. | `100`                                                                                                                            | No       |
| time-limit-minutes      | The time limit to complete the quiz in minutes. This prevents the action from running indefinitely.                                   | `10`                                                                                                                             | No       |
| max-attempts            | The maximum number of attempts to pass the quiz. A value of 0 means unlimited attempts.                                               | `3`                                                                                                                              | No       |
| exclude-file-patterns   | A list of file patterns to exclude from the quiz as a JSON-ified string.                                                              | `'["**/*-lock.json", "**/*-lock.yaml", "**/*.lock", "**/*.map", "**/*.pb.*", "**/*_pb2.py", "**/*.generated.*", "**/*.auto.*"]'` | No       |
| system-prompt           | Optional override for the system prompt. Be sure the specify that multiple choice questions must be returned.                         | See [here](src/quiz/DefaultSystemPrompt.js) for the default system prompt                                                        | No       |

## Privacy

Because this action runs a temporary webserver inside the GitHub Actions runner,
your code isn't sent to any third party other than the model provider (OpenAI).
This action can be easily modified to work with self-hosted models as well.
