import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
let client = null;

export function isClaudeAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  if (!isClaudeAvailable()) {
    const err = new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
    err.code = 'NO_API_KEY';
    throw err;
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Claude에게 JSON 응답을 요청한다.
 * tool 로 스키마를 강제해 파싱 실패를 없앤다.
 */
export async function askJson({ system, prompt, schema, toolName = 'respond', maxTokens = 8000 }) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [
      {
        name: toolName,
        description: '구조화된 결과를 돌려준다.',
        input_schema: schema,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = res.content.find((c) => c.type === 'tool_use');
  if (!toolUse) throw new Error('Claude 응답에서 구조화된 결과를 찾지 못했습니다.');
  return toolUse.input;
}

export { MODEL };
