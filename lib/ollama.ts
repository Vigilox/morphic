export async function chatWithOllama(
  model: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  options = {}
) {
  const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  return response.json();
}

export async function listOllamaModels() {
  const response = await fetch(`${process.env.OLLAMA_API_URL}/api/tags`);
  
  if (!response.ok) {
    throw new Error(`Failed to list Ollama models: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.models || [];
}
