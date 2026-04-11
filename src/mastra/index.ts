import { Mastra } from '@mastra/core'
// import { VercelDeployer } from '@mastra/deployer-vercel'
import { registerApiRoute } from '@mastra/core/server'
import { PinoLogger } from '@mastra/loggers'
import { LibSQLStore } from '@mastra/libsql'

import { chatWorkflow } from './workflows/chat-workflow'
import { textMessageAgent } from './agents/text-message-agent'
import { chatAgent } from './agents/chat-agent'
import { sendWhatsAppMessage } from '../whatsapp-client'
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { MastraCompositeStore } from '@mastra/core/storage'
import { CloudExporter, DefaultExporter, Observability, SensitiveDataFilter } from '@mastra/observability'
import { DuckDBStore } from '@mastra/duckdb'

if (process.env.ENV === 'local') {
  // 设置全局代理
  const proxyAgent = new ProxyAgent('http://127.0.0.1:7890');
  setGlobalDispatcher(proxyAgent);
}

export const mastra = new Mastra({
  // deployer: new VercelDeployer(),
  workflows: { chatWorkflow },
  agents: { textMessageAgent, chatAgent },
  // storage: new LibSQLStore({
  //   id: 'agent-storage',
  //   url: ':memory:',
  // }),
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: process.env.LLM_RECORD_URL as string,
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new DefaultExporter(), // Persists traces to storage for Mastra Studio
          new CloudExporter(), // Sends observability data to Mastra platform (if MASTRA_CLOUD_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    apiRoutes: [
      registerApiRoute('/whatsapp', {
        method: 'GET',
        handler: async c => {
          const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
          const {
            'hub.mode': mode,
            'hub.challenge': challenge,
            'hub.verify_token': token,
          } = c.req.query()

          if (mode === 'subscribe' && token === verifyToken) {
            return c.text(challenge, 200)
          } else {
            return c.status(403)
          }
        },
      }),
      registerApiRoute('/whatsapp', {
        method: 'POST',
        handler: async c => {
          const mastra = c.get('mastra')
          const chatWorkflow = mastra.getWorkflow('chatWorkflow')

          const body = await c.req.json()

          console.log('whatsapp webhook body: ', JSON.stringify(body));

          if (!body?.entry?.[0]?.changes?.value?.[0]?.messages?.[0]?.from) {
            return;
          }

          const workflowRun = await chatWorkflow.createRun()
          const runResult = await workflowRun.start({
            inputData: { userMessage: JSON.stringify(body) },
          })

          return c.json(runResult)
        },
      }),


      registerApiRoute('/testsendwhatsapp', {
        method: 'POST',
        handler: async c => {
          const result = await sendWhatsAppMessage({ to: '6580679233', message: 'Hello! How are you today?' });

          return c.json(result)
        },
      }),
      registerApiRoute('/testwhatsapp', {
        method: 'POST',
        handler: async c => {
          const mastra = c.get('mastra')
          const mockWebhookData = {
            entry: [
              {
                changes: [
                  {
                    value: {
                      messages: [
                        {
                          from: '6580679233', // Test phone number
                          text: {
                            body: 'Hello! How are you today?',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }

          const workflow = mastra.getWorkflow('chatWorkflow')
          const workflowRun = await workflow.createRun()

          const result = await workflowRun.start({
            inputData: { userMessage: JSON.stringify(mockWebhookData) },
          })

          console.log('Workflow completed:', result)

          return c.json(result)
        },
      }),
    ],
  },
})