import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/rest'
// import OpenAI from 'openai'（OpenAI依存を削除）
import Server from './web/Server.js'
import createApp from './web/createApp.js'
import QuizMaker from './quiz/QuizMaker.js'
import fetchPullRequest from './pull-request/fetchPullRequest.js'
import DefaultSystemPrompt from './quiz/DefaultSystemPrompt.js'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  const context = github.context

  // Have to use process.env because inputs are not passed through to underlying steps for composite actions.
  const config = {
    githubToken: process.env.INPUT_GITHUB_TOKEN,
    // openaiApiKey: process.env.INPUT_OPENAI_API_KEY,（OpenAI APIキー不要）
    ngrokAuthToken: process.env.INPUT_NGROK_AUTHTOKEN,
    linesChangedThreshold: parseInt(process.env.INPUT_LINES_CHANGED_THRESHOLD),
    maxAttempts: parseInt(process.env.INPUT_MAX_ATTEMPTS),
    model: process.env.INPUT_MODEL,
    timeLimitMinutes: parseInt(process.env.INPUT_TIME_LIMIT_MINUTES),
    excludeFilePatterns: JSON.parse(process.env.INPUT_EXCLUDE_FILE_PATTERNS),
    systemPrompt: process.env.INPUT_SYSTEM_PROMPT || DefaultSystemPrompt
  }
  // Check required inputs were provided. Have to manually check because we're using a composite action :(
  if (!config.githubToken) {
    core.setFailed(
      '🚫 GitHub token is required. Double check your workflow configuration.'
    )
    process.exit(1)
  }
  // OpenAI APIキーのチェック不要
  if (!config.ngrokAuthToken) {
    core.setFailed(
      '🚫 Ngrok auth token is required. Double check your workflow configuration.'
    )
    process.exit(1)
  }

  // Create Github client
  const octokit = new Octokit({ auth: config.githubToken })

  // GitHub Copilot AI Model用のクライアント
  const githubAIFetch = async (body) => {
    const res = await fetch('https://api.githubcopilot.com/v1/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.githubToken}`,
        'X-Requested-With': 'GitHubAction'
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(
        `GitHub AI Model API error: ${res.status} ${await res.text()}`
      )
    }
    return res.json()
  }

  // Fetch the pull request
  const pullRequest = await fetchPullRequest(
    octokit,
    context.repo.owner,
    context.repo.repo,
    context.payload.pull_request.number,
    config.excludeFilePatterns
  )

  // Check if the pull request is too small to create a quiz
  if (pullRequest.getLinesOfCodeChanged() < config.linesChangedThreshold) {
    core.info(
      `🚫 Pull request is too small to create a quiz (${config.linesChangedThreshold} lines required).`
    )
    return
  } else {
    core.info(
      `🔍 Pull request has ${pullRequest.getLinesOfCodeChanged()} lines of code changed.`
    )
  }

  // Create quiz maker
  const quizMaker = new QuizMaker(
    config.model,
    githubAIFetch,
    config.systemPrompt
  )

  // Generate quiz for pull request
  core.info('🤖 Generating quiz...')
  const { quiz, usage } =
    await quizMaker.generateQuizForPullRequest(pullRequest)
  core.info(`💰 Token Usage
┌──────────────────┬──────────┐
│ Token Type       │    Count │
├──────────────────┼──────────┤
│ Prompt           │ ${usage.prompt_tokens.toString().padStart(8)} │
│ Completion       │ ${usage.completion_tokens.toString().padStart(8)} │
│ Reasoning        │ ${usage.completion_tokens_details.reasoning_tokens.toString().padStart(8)} │
│ Total            │ ${usage.total_tokens.toString().padStart(8)} │
└──────────────────┴──────────┘`)

  // Create server
  let server = null
  let quizTimeoutId = null

  const onQuizPassed = (attempts) => {
    core.info(
      `🎉 Quiz passed after ${attempts} attempt${attempts === 1 ? '' : 's'}!`
    )
    // Clear the quiz timeout since quiz is complete
    if (quizTimeoutId) {
      clearTimeout(quizTimeoutId)
    }
    // Wait some time before shutting down to allow user to see rendered page
    setTimeout(async () => {
      await server.shutdown()
    }, 1000)
  }
  const onQuizFailed = (attempts) => {
    core.setFailed(
      `🚫 Quiz failed after ${attempts} attempt${attempts === 1 ? '' : 's'}.`
    )
    // Clear the quiz timeout since quiz is complete
    if (quizTimeoutId) {
      clearTimeout(quizTimeoutId)
    }
    // Wait some time before shutting down to allow user to see rendered page
    setTimeout(async () => {
      await server.shutdown()
      process.exit(1)
    }, 1000)
  }
  server = new Server({
    app: createApp({
      quiz,
      pullRequestUrl: pullRequest.html_url,
      onQuizPassed,
      onQuizFailed,
      maxAttempts: config.maxAttempts
    }),
    port: 3000,
    ngrokAuthToken: config.ngrokAuthToken
  })

  // Start server
  await server.start()

  // Notify user of quiz URL
  core.info(`📝 Quiz created! Take the quiz at ${server.getUrl()}`)

  // Set time limit for the quiz
  quizTimeoutId = setTimeout(
    async () => {
      await server.shutdown()
      // Fail the action if time limit is reached
      core.setFailed('🕒 Failed to complete quiz in time.')
      // Need to actually exit the process with an error code to fail the action
      process.exit(1)
    },
    config.timeLimitMinutes * 60 * 1000
  )
}

export default run
