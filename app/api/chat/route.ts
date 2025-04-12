import { createManualToolStreamResponse } from '@/lib/streaming/create-manual-tool-stream'
import { createToolCallingStreamResponse } from '@/lib/streaming/create-tool-calling-stream'
import { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'
import { cookies } from 'next/headers'

export const maxDuration = 30

const DEFAULT_MODEL: Model = {
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
  provider: 'OpenAI',
  providerId: 'openai',
  enabled: true,
  toolCallType: 'native'
}

// Create a function to handle Ollama streaming responses
async function createOllamaStreamResponse({
  messages,
  model,
  chatId
}: {
  messages: any[]
  model: Model
  chatId?: string
  searchMode?: boolean
}) {
  const modelName = model.id.replace('ollama:', '')
  
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  
  // Start streaming response
  const streamStart = {
    id: chatId || crypto.randomUUID(),
    model: model.id,
    created: Math.floor(Date.now() / 1000),
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null
      }
    ]
  }
  
  writer.write(encoder.encode(`data: ${JSON.stringify(streamStart)}\n\n`))
  
  try {
    // Format messages for Ollama API
    const formattedMessages = messages.map(message => ({
      role: message.role,
      content: message.content
    }))
    
    // Use local Ollama instance
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: formattedMessages,
        stream: true,
      }),
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${error}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Failed to get response reader')
    }
    
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.trim() === '') continue
        
        try {
          const data = JSON.parse(line)
          
          if (data.message?.content) {
            const chunk = {
              id: chatId || crypto.randomUUID(),
              model: model.id,
              created: Math.floor(Date.now() / 1000),
              object: 'chat.completion.chunk',
              choices: [
                {
                  index: 0,
                  delta: { content: data.message.content },
                  finish_reason: null
                }
              ]
            }
            
            writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
          }
        } catch (e) {
          console.error('Failed to parse Ollama response:', e)
        }
      }
    }
    
    // Stream completion
    const streamEnd = {
      id: chatId || crypto.randomUUID(),
      model: model.id,
      created: Math.floor(Date.now() / 1000),
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }
      ]
    }
    
    writer.write(encoder.encode(`data: ${JSON.stringify(streamEnd)}\n\n`))
    writer.write(encoder.encode('data: [DONE]\n\n'))
  } catch (error) {
    console.error('Error in Ollama streaming:', error)
    
    // Write error to stream
    const errorResponse = {
      error: true,
      message: (error as Error).message
    }
    
    writer.write(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`))
  } finally {
    writer.close()
  }
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}

export async function POST(req: Request) {
  try {
    const { messages, id: chatId } = await req.json()
    const referer = req.headers.get('referer')
    const isSharePage = referer?.includes('/share/')

    if (isSharePage) {
      return new Response('Chat API is not available on share pages', {
        status: 403,
        statusText: 'Forbidden'
      })
    }

    const cookieStore = await cookies()
    const modelJson = cookieStore.get('selectedModel')?.value
    const searchMode = cookieStore.get('search-mode')?.value === 'true'

    let selectedModel = DEFAULT_MODEL

    if (modelJson) {
      try {
        selectedModel = JSON.parse(modelJson) as Model
      } catch (e) {
        console.error('Failed to parse selected model:', e)
      }
    }

    if (
      !isProviderEnabled(selectedModel.providerId) ||
      selectedModel.enabled === false
    ) {
      return new Response(
        `Selected provider is not enabled ${selectedModel.providerId}`,
        {
          status: 404,
          statusText: 'Not Found'
        }
      )
    }

    // Check if using Ollama
    if (selectedModel.providerId === 'ollama') {
      return createOllamaStreamResponse({
        messages,
        model: selectedModel,
        chatId,
        searchMode
      })
    }

    // Handle other providers as before
    const supportsToolCalling = selectedModel.toolCallType === 'native'

    return supportsToolCalling
      ? createToolCallingStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode
        })
      : createManualToolStreamResponse({
          messages,
          model: selectedModel,
          chatId,
          searchMode
        })
  } catch (error) {
    console.error('API route error:', error)
    return new Response('Error processing your request', {
      status: 500,
      statusText: 'Internal Server Error'
    })
  }
}
