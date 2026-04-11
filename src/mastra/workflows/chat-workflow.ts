import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { sendWhatsAppMessage } from '../../whatsapp-client'

const respondToMessage = createStep({
  id: 'respond-to-message',
  description: 'Generate response to user message',
  inputSchema: z.object({ userMessage: z.string() }),
  outputSchema: z.object({ response: z.string() }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('chatAgent')
    if (!agent) {
      throw new Error('Chat agent not found')
    }

    const response = await agent.generate([{ role: 'user', content: inputData.userMessage }])

    return { response: response.text }
  },
})

const breakIntoMessages = createStep({
  id: 'break-into-messages',
  description: 'Breaks response into text messages',
  inputSchema: z.object({ prompt: z.string() }),
  outputSchema: z.object({ messages: z.array(z.string()) }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra?.getAgent('textMessageAgent')
    if (!agent) {
      throw new Error('Text Message agent not found')
    }

    const response = await agent.generate([{ role: 'user', content: inputData.prompt }], {
      structuredOutput: {
        schema: z.object({
          messages: z.array(z.string()),
        }),
      },
    })

    if (!response.object) throw new Error('Error generating messages')

    return response.object
  },
})

const sendMessages = createStep({
  id: 'send-messages',
  description: 'Sends text messages via WhatsApp',
  inputSchema: z.object({
    messages: z.array(z.string()),
    userPhone: z.string(),
  }),
  outputSchema: z.object({ sentCount: z.number() }),
  execute: async ({ inputData }) => {
    const { messages, userPhone } = inputData

    console.log(`\n🔥 Sending ${messages.length} WhatsApp messages to ${userPhone}...`)

    let sentCount = 0

    // Send each message with a small delay for natural flow
    for (let i = 0; i < messages.length; i++) {
      const success = await sendWhatsAppMessage({
        to: userPhone,
        message: messages[i],
      })

      if (success) {
        sentCount++
      }

      // Add delay between messages for natural texting rhythm
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`\n✅ Successfully sent ${sentCount}/${messages.length} WhatsApp messages\n`)

    return { sentCount }
  },
})

export const chatWorkflow = createWorkflow({
  id: 'chat-workflow',
  inputSchema: z.object({ userMessage: z.string() }),
  outputSchema: z.object({ sentCount: z.number() }),
})
  .then(respondToMessage)
  .map(async ({ inputData }) => ({
    prompt: `Break this AI response into 1-2 casual, friendly text messages that feel natural for WhatsApp conversation:\n\n${inputData.response}`,
  }))
  .then(breakIntoMessages)
  .map(async ({ inputData, getInitData }) => {
    // Parse the original stringified input to get user phone
    const initData = getInitData<typeof chatWorkflow>()
    const webhookData = JSON.parse(initData.userMessage)
    const userPhone = webhookData.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || 'unknown'

    return {
      messages: inputData.messages,
      userPhone,
    }
  })
  .then(sendMessages)

chatWorkflow.commit()