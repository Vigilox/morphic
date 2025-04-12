import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, messages, options } = body;
    
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        ...options,
      }),
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `Ollama API error: ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(`${process.env.OLLAMA_API_URL}/api/tags`);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to list models: ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}
