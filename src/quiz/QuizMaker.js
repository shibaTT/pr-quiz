import { z } from 'zod'
import { withRetry } from '../utils/retry.js'

const Choices = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string(),
  d: z.string()
})

const MultipleChoiceQuestion = z.object({
  question: z.string(),
  choices: Choices,
  answer: z.string()
})

const Quiz = z.object({
  questions: z.array(MultipleChoiceQuestion)
})

class QuizMaker {
  constructor(model, aiClient, systemPrompt) {
    this.model = model
    this.aiClient = aiClient // githubAIFetch
    this.systemPrompt = systemPrompt
  }

  async generateQuizForPullRequest(pullRequest) {
    return withRetry(
      async () => {
        const prompt = `${pullRequest.toXML()}\n\nGenerate 3-5 multiple choice questions that test understanding of this pull request.`
        const body = {
          model: this.model || 'openai/gpt-4.1',
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1024
        }
        const completion = await this.aiClient(body)
        const message = completion.choices?.[0]?.message?.content
        if (message) {
          // 文字列をQuiz型にパース（zodでバリデーション）
          let parsed
          try {
            parsed = JSON.parse(message)
            Quiz.parse(parsed)
          } catch (e) {
            throw new Error('Failed to parse quiz JSON: ' + e.message)
          }
          return {
            quiz: parsed,
            usage: completion.usage || {}
          }
        } else {
          throw new Error('Failed to generate questions')
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000
      }
    )
  }
}

export default QuizMaker
