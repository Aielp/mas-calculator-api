const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extraction prompt: Claude's ONLY job is to extract MAS value and session number
const EXTRACTION_PROMPT = `You are a running coach assistant. Extract information from the user's message.

Your ONLY job: identify two things:
1. MAS value (in m/s) - either directly stated or calculated from distance and time
2. Which MAS session they're asking about (e.g., MAS 7, MAS 12, etc.)

If the user provides distance and time, calculate MAS:
- MAS (m/s) = distance_in_metres ÷ time_in_seconds
- Convert any units to metres and seconds first

Output ONLY a JSON object with this exact format (no other text):
{
  "mas_ms": <number or null if not provided>,
  "session_number": <number or null if not specified>,
  "units_preference": "metric" or "us",
  "clarification_needed": "brief string if ambiguous, otherwise null"
}

Example user input: "I ran 1200m in 5 minutes"
Example output: {"mas_ms": 4.0, "session_number": null, "units_preference": "metric", "clarification_needed": null}

Example user input: "Calculate targets for MAS 12, my MAS is 4.5 m/s"
Example output: {"mas_ms": 4.5, "session_number": 12, "units_preference": "metric", "clarification_needed": null}`;

// Session definitions with intensity % values
const SESSIONS = {
  7: { name: 'MAS 7', fast: 100, float: 70, duration: 15, sets: 3, rest: 3 },
  9: { name: 'MAS 9', fast: 100, float: 70, duration: 15, sets: 3, rest: 3 },
  10: { name: 'MAS 10', fast: 100, float: 70, duration: 15, sets: 3, rest: 3 },
  12: { name: 'MAS 12', fast: 103, float: 70, duration: 15, sets: 3, rest: 3 },
  14: { name: 'MAS 14', fast: 103, float: 70, duration: 15, sets: 3, rest: 3 },
  17: { name: 'MAS 17', fast: 106, float: 70, duration: 15, sets: 3, rest: 3 },
  19: { name: 'MAS 19', fast: 106, float: 70, duration: 15, sets: 3, rest: 3 },
  21: { name: 'MAS 21', fast: 110, float: 70, duration: 5, sets: 3, rest: 3 }
};

// Calculate rectangle session targets
function calculateRectangleSession(mas_ms, sessionNum) {
  if (!SESSIONS[sessionNum]) return null;
  
  const session = SESSIONS[sessionNum];
  const fastSpeed_ms = mas_ms * (session.fast / 100);
  const floatSpeed_ms = mas_ms * (session.float / 100);
  
  // distance = speed × time
  const longSide = Math.round((fastSpeed_ms * session.duration) / 5) * 5; // round to nearest 5m
  const shortSide = Math.round((floatSpeed_ms * session.duration) / 5) * 5;
  
  return {
    session: session.name,
    longSide,
    shortSide,
    duration,
    sets: session.sets,
    rest: session.rest,
    fastPercent: session.fast,
    floatPercent: session.float
  };
}

// Format MAS output
function formatMAS(mas_ms) {
  const mas_kmh = (mas_ms * 3.6).toFixed(2);
  const pace_per_km = ((1000 / mas_ms) / 60).toFixed(2); // minutes
  const pace_seconds = Math.round((1000 / mas_ms) % 60);
  
  return {
    ms: mas_ms.toFixed(2),
    kmh: mas_kmh,
    pace_per_km_min: Math.floor(1000 / mas_ms / 60),
    pace_per_km_sec: pace_seconds
  };
}

// Main chat handler
app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // Step 1: Extract MAS and session from latest user message
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) {
      return res.status(400).json({ error: 'No user message found' });
    }

    let extraction = null;
    try {
      const extractionResp = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: lastUserMsg.content }]
      });
      
      const jsonStr = extractionResp.content[0].text.trim();
      extraction = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('Extraction failed:', parseErr);
      extraction = { mas_ms: null, session_number: null, units_preference: 'metric', clarification_needed: 'Could not parse your input' };
    }

    // Step 2: If we have MAS and session number, calculate targets
    let calculatedTargets = null;
    if (extraction.mas_ms && extraction.session_number) {
      calculatedTargets = calculateRectangleSession(extraction.mas_ms, extraction.session_number);
    }

    // Step 3: Create context for Claude to generate the response
    const contextMessage = {
      role: 'user',
      content: `User said: "${lastUserMsg.content}"

Extracted data:
- MAS: ${extraction.mas_ms ? extraction.mas_ms + ' m/s' : 'not provided'}
- Session: ${extraction.session_number ? 'MAS ' + extraction.session_number : 'not specified'}
- Units preference: ${extraction.units_preference}
${extraction.clarification_needed ? `- Clarification needed: ${extraction.clarification_needed}` : ''}

${calculatedTargets ? `Calculated session targets:
- Long side (fast): ${calculatedTargets.longSide}m at ${calculatedTargets.fastPercent}% MAS
- Short side (float): ${calculatedTargets.shortSide}m at ${calculatedTargets.floatPercent}% MAS
- Work duration: ${calculatedTargets.duration}s per repetition
- Sets: ${calculatedTargets.sets}
- Rest between sets: ${calculatedTargets.rest}min
` : ''}

Now respond to the user naturally. If targets were calculated, explain how to use them. If MAS was provided, also show it in different formats.`
    };

    // Step 4: Call Claude (Sonnet 4) to generate the response
    const responseMessages = [
      ...messages.slice(0, -1), // all previous messages
      contextMessage // the enriched context
    ];

    const finalResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are MAS Session Calculator for Prepare to Perform (preparetoperform.com.au).
      
Your job: respond naturally to the user about their MAS training. 
- If MAS and session were extracted, explain the session structure and targets clearly.
- If MAS was provided, show it in m/s, km/h, and pace per km.
- If clarification was needed, ask the user politely.
- Keep responses clear, concise, practical.
- Use bullet points for targets and session structure.

DO NOT do any math yourself. The numbers in the context above are already calculated. Just present them clearly.`,
      messages: responseMessages
    });

    const reply = finalResp.content[0].text;
    res.json({ reply });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3000, () => console.log('MAS API running'));
