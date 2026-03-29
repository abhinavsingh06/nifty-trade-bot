import OpenAI from "openai";
import { buildActionableSuggestions } from "./newsEngine.js";

function getTextFromResponse(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function parseJsonFromText(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const payload = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(payload);
}

function buildPrompt({ signal, marketMove, news, baseSuggestions, actionableSuggestions }) {
  return `
Return JSON only.

Schema:
{
  "market_regime": "bullish|bearish|range|volatile",
  "headline_bias": "bullish|bearish|neutral",
  "preferred_setup_id": "call-buy|put-buy|none",
  "confidence": number,
  "summary": string,
  "call_buy": {
    "verdict": "buy|watch|avoid",
    "entry_zone": [number, number],
    "stop_loss": number,
    "targets": [number, number],
    "reasoning": [string, string, string]
  },
  "put_buy": {
    "verdict": "buy|watch|avoid",
    "entry_zone": [number, number],
    "stop_loss": number,
    "targets": [number, number],
    "reasoning": [string, string, string]
  },
  "risk_note": string
}

Use only these inputs:
Technical signal:
${JSON.stringify(signal, null, 2)}

Market move:
${JSON.stringify(marketMove, null, 2)}

Weighted news:
${JSON.stringify(news, null, 2)}

Base suggestions:
${JSON.stringify(baseSuggestions, null, 2)}

Actionable setups:
${JSON.stringify(actionableSuggestions, null, 2)}
`.trim();
}

export async function generateAiAnalysis({ config, signal, marketMove, news, baseSuggestions }) {
  if (!config.openai.apiKey) {
    return {
      status: "UNAVAILABLE",
      reason: "Set OPENAI_API_KEY in .env to enable LLM analysis."
    };
  }

  const client = new OpenAI({ apiKey: config.openai.apiKey });
  const actionableSuggestions = buildActionableSuggestions({
    signal,
    marketMove,
    news: news.summary,
    suggestions: baseSuggestions
  });

  try {
    const response = await client.responses.create({
      model: config.openai.model,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a careful NIFTY options analyst. Output only valid JSON."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt({
                signal,
                marketMove,
                news,
                baseSuggestions,
                actionableSuggestions
              })
            }
          ]
        }
      ]
    });

    const text = getTextFromResponse(response);
    return {
      status: "READY",
      generatedAt: new Date().toISOString(),
      model: config.openai.model,
      analysis: parseJsonFromText(text)
    };
  } catch (error) {
    return {
      status: "ERROR",
      generatedAt: new Date().toISOString(),
      model: config.openai.model,
      reason: error.message
    };
  }
}
