import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const session = await auth()
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cliente, tipo, urgencia, descripcion, estado } = await req.json()

  const urgenciaLabel = urgencia === 'alta' ? 'alta — lo antes posible'
    : urgencia === 'media' ? 'media — esta semana' : 'baja — sin afán'

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Eres el asistente interno de Relevvo Studio, una agencia creativa de marketing y diseño en Colombia.

El cliente "${cliente}" ha enviado una solicitud:
- Tipo: ${tipo}
- Prioridad: ${urgenciaLabel}
- Estado actual: ${estado}
- Descripción: "${descripcion}"

Escribe UNA nota de respuesta profesional, cálida y concisa (máximo 2-3 oraciones) para enviarle al cliente. Debe informarle sobre los próximos pasos, el estado de su solicitud, o pedir alguna aclaración si es necesario. En español, tono cercano pero profesional. Solo escribe la nota, sin introducción ni explicación.`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ suggestion: text })
}
