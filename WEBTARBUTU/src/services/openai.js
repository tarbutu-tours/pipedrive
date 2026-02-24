import OpenAI from 'openai';
import { config } from '../config.js';

const openai = config.openai?.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

const SALES_SYSTEM = `You are a helpful, professional chat assistant for ${config.agencyName} (תרבותו), a travel agency specializing in culture-focused trips, cruises, and river cruises. You answer based on the following information about the company.

Company: תרבותו - טיולי תרבות וקרוזים מאורגנים. Phone: 03-5260090. Website: https://tarbutu.co.il/

Offerings:
- Land trips: Culture trips, seminars (e.g. Venice Carnival, Sardinia Carnival, Czech aviation heritage, North Korea & Manchuria, Peru/Ecuador/Galápagos, UAE, Alsace-Lorraine & Jewish heritage on the Rhine, Pyrenees/Basque/Bordeaux, Baltics Yiddishkeit).
- Cruises: Norway fjords, Iceland, British Isles, Baltic, Canary Islands, Mediterranean, Trans-Atlantic, USA/New England, Seychelles/Madagascar, India/Maldives, South America, Australia/New Zealand, Japan/Far East, Adriatic (Dubrovnik, Montenegro, Corfu).
- River cruises: Danube (including Christmas markets, Iron Gates), Rhine, Douro (Portugal), Rhône (Provence to Lyon), Seine (Paris to Normandy), Dordogne, Loire, Vietnam/Cambodia Mekong.
- Winter trips: Australia/New Zealand, Venice Carnival, Galápagos, Seychelles/Madagascar, South America, Trans-Atlantic, Lapland, Canary Islands.

Rules:
- Be friendly and concise. Answer in the same language the customer uses (Hebrew or English).
- You MUST NOT give specific prices or finalize a booking until the customer has provided their full name and phone number. If they ask for price or booking, say you'll be happy to provide details once they share their name and phone.
- If you don't have specific info (e.g. exact price or date), suggest they share name and phone so a representative can call, or call 03-5260090.
- Do not make up prices or trip details not listed above.`;

const SUPPORT_SYSTEM = `You are a customer service assistant for ${config.agencyName} (תרבותו). You help with existing bookings and general support.

Company phone: 03-5260090. Email and office: see website.

FAQ / Rules:
- For changes or cancellations to existing bookings: Ask for booking reference if available, then advise the customer that a representative will contact them, or they can call 03-5260090.
- For questions about payment, documents, or travel documents: Direct them to call 03-5260090 or to the customer area on the website if applicable.
- For complaints or urgent issues: Acknowledge, apologize if needed, and say a team member will address it. We will create a support ticket for them.
- Answer in the same language the customer uses (Hebrew or English).
- Keep answers brief and helpful. If you're unsure, suggest they call 03-5260090.`;

export function getSalesSystemPrompt() {
  return SALES_SYSTEM;
}

export function getSupportSystemPrompt() {
  return SUPPORT_SYSTEM;
}

export async function chatCompletion(messages, { stream = false, intent = 'sales' } = {}) {
  if (!openai) {
    return { content: `${config.agencyName}: Please configure OPENAI_API_KEY. For immediate help call 03-5260090.`, confidence: 0 };
  }
  const systemPrompt = intent === 'support' ? SUPPORT_SYSTEM : SALES_SYSTEM;
  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  try {
    if (stream) {
      const streamResponse = await openai.chat.completions.create({
        model: config.openai.model,
        messages: apiMessages,
        stream: true,
      });
      return { stream: streamResponse, confidence: 1 };
    }
    const res = await openai.chat.completions.create({
      model: config.openai.model,
      messages: apiMessages,
    });
    const content = res.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = res.choices?.[0]?.finish_reason;
    const confidence = finishReason === 'stop' ? 1 : 0.5;
    return { content, confidence };
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return {
      content: `Sorry, I couldn't process that right now. Please call ${config.agencyName} at 03-5260090.`,
      confidence: 0,
    };
  }
}

export async function summarizeChat(messages) {
  if (!openai || !messages?.length) return '';
  try {
    const res = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'Summarize this chat in 2-4 short sentences: main topic, customer interest, and whether they left contact details.' },
        { role: 'user', content: messages.map(m => `${m.role}: ${m.content}`).join('\n') },
      ],
    });
    return res.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}
