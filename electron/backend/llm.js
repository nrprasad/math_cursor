const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function draftProofResponse(projectId, lemmaId) {
  const lemmaPart = lemmaId ? ` for lemma '${lemmaId}'` : '';
  const draft = [
    `## Draft proof${lemmaPart}`,
    '',
    'This is a placeholder proof. LLM integration is not yet implemented.',
    '',
    '- Outline steps manually.',
    '- Update once LLM integration arrives.',
  ].join('\n');
  return {
    draft_md: draft,
    warnings: ['LLM integration not yet implemented'],
  };
}

function toResponseChunk(role, text) {
  const type = role === 'assistant' ? 'output_text' : 'input_text';
  return {
    role,
    content: [{ type, text }],
  };
}

function extractOutputText(payload) {
  if (Array.isArray(payload?.output_text) && payload.output_text.length) {
    return payload.output_text.join('\n').trim();
  }

  if (Array.isArray(payload?.output)) {
    const pieces = payload.output
      .flatMap((item) =>
        Array.isArray(item?.content)
          ? item.content
              .filter((chunk) => chunk && (chunk.type === 'output_text' || chunk.type === 'text'))
              .map((chunk) => chunk.text || '')
          : [],
      )
      .filter(Boolean);
    if (pieces.length) {
      return pieces.join('\n').trim();
    }
  }

  if (typeof payload?.response === 'string' && payload.response.trim()) {
    return payload.response.trim();
  }

  return '';
}

async function callOpenAi({ prompt, model, apiKey, history }) {
  if (!apiKey) {
    throw new Error('OpenAI API key not provided');
  }

  const targetModel = model?.trim() || 'gpt-4.1-mini';
  const inputMessages = [
    toResponseChunk('system', 'You are a helpful mathematical assistant.'),
    ...(Array.isArray(history)
      ? history
          .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && entry.content)
          .map((entry) => toResponseChunk(entry.role, entry.content))
      : []),
    toResponseChunk('user', prompt),
  ];

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: targetModel,
      input: inputMessages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI Responses API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const message = extractOutputText(data);
  if (!message) {
    throw new Error('OpenAI Responses API returned no content');
  }
  return message;
}

async function chatResponse({ prompt, provider, model, apiKey, history }) {
  const selectedProvider = provider?.toLowerCase() || 'openai';

  if (selectedProvider === 'openai') {
    return callOpenAi({ prompt, model, apiKey, history });
  }

  return [
    `LLM provider '${selectedProvider}' is not implemented yet.`,
    '',
    'Prompt received:',
    prompt,
  ].join('\n');
}

module.exports = {
  draftProofResponse,
  chatResponse,
};
