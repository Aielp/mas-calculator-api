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

// ─────────────────────────────────────────────
// CALCULATION HELPERS
// ─────────────────────────────────────────────

function round5(n) { return Math.round(n / 5) * 5; }

function formatMAS(mas_ms) {
  const mas_kmh = mas_ms * 3.6;
  const pace_total_sec = Math.round(1000 / mas_ms);
  const pace_min = Math.floor(pace_total_sec / 60);
  const pace_sec = pace_total_sec % 60;
  return {
    ms: mas_ms.toFixed(2),
    kmh: mas_kmh.toFixed(2),
    pace: `${pace_min}:${String(pace_sec).padStart(2, '0')} per km`
  };
}

// Each side of rectangle: speed x 15 seconds
function calcRectangle(mas_ms, fastPct, floatPct, setMinutes) {
  const fastSpeed = mas_ms * (fastPct / 100);
  const floatSpeed = mas_ms * (floatPct / 100);
  const longSide = round5(fastSpeed * 15);
  const shortSide = round5(floatSpeed * 15);
  const lapDistance = (longSide * 2) + (shortSide * 2);
  const reps = Math.floor((setMinutes * 60) / 30); // 15s fast + 15s float = 30s per rep
  return { longSide, shortSide, lapDistance, reps };
}

function calcInterval(mas_ms, pct, durationSec) {
  return round5(mas_ms * (pct / 100) * durationSec);
}

function calcEurofit(mas_ms, pct, setMinutes) {
  const distance = round5(mas_ms * (pct / 100) * 15);
  const reps = Math.floor((setMinutes * 60) / 30);
  return { distance, reps };
}

function calcTabata(mas_ms, pct, setMinutes) {
  const distance = round5(mas_ms * (pct / 100) * 20); // 20s work
  const reps = Math.floor((setMinutes * 60) / 30); // 20s work + 10s rest
  return { distance, reps };
}

// ─────────────────────────────────────────────
// CONE DIAGRAM FOR RECTANGLE SESSIONS
// ─────────────────────────────────────────────

function rectangleDiagram(longSide, shortSide) {
  // Return a marker tag the frontend replaces with an SVG
  return '[RECTANGLE_DIAGRAM:' + longSide + ':' + shortSide + ']';
}

// ─────────────────────────────────────────────
// SESSION BUILDER — all 22 sessions
// ─────────────────────────────────────────────

function buildSession(sessionNum, mas_ms) {
  switch (sessionNum) {
    case 1:
      return {
        name: 'MAS 1 — MAS Test + Fartlek',
        type: 'test',
        blocks: [
          { label: 'Part 1', detail: 'MAS test — record your distance and time' },
          { label: 'Part 2', detail: '25 min fartlek run @75–85% MAS' }
        ]
      };

    case 2: {
      const work = calcInterval(mas_ms, 90, 180);
      const rest = calcInterval(mas_ms, 45, 180);
      return {
        name: 'MAS 2 — 3 min intervals @90%',
        type: 'interval',
        blocks: [
          { label: 'Structure', detail: '3 reps × (3 min work / 3 min float) — rest 3 min — × 2 sets' },
          { label: 'Work distance', detail: `${work} m per rep @90% MAS` },
          { label: 'Float distance', detail: `${rest} m per rep @45% MAS` }
        ]
      };
    }

    case 3:
      return {
        name: 'MAS 3 — 30 min Fartlek',
        type: 'fartlek',
        blocks: [
          { label: 'Structure', detail: '30 min continuous fartlek run @75–85% MAS' }
        ]
      };

    case 4: {
      const work = calcInterval(mas_ms, 93, 180);
      const rest = calcInterval(mas_ms, 45, 180);
      return {
        name: 'MAS 4 — 3 min intervals @93%',
        type: 'interval',
        blocks: [
          { label: 'Structure', detail: '3 reps × (3 min work / 3 min float) — rest 3 min — × 2 sets' },
          { label: 'Work distance', detail: `${work} m per rep @93% MAS` },
          { label: 'Float distance', detail: `${rest} m per rep @45% MAS` }
        ]
      };
    }

    case 5:
      return {
        name: 'MAS 5 — 30 min Steady Run',
        type: 'steady',
        blocks: [
          { label: 'Structure', detail: '30 min continuous run @80–85% MAS' }
        ]
      };

    case 6: {
      const work = calcInterval(mas_ms, 95, 90);
      const rest = calcInterval(mas_ms, 40, 90);
      return {
        name: 'MAS 6 — 1.5 min intervals @95%',
        type: 'interval',
        blocks: [
          { label: 'Structure', detail: '4 reps × (1.5 min work / 1.5 min float) — rest 3 min — × 2 sets' },
          { label: 'Work distance', detail: `${work} m per rep @95% MAS` },
          { label: 'Float distance', detail: `${rest} m per rep @40% MAS` }
        ]
      };
    }

    case 7: {
      const r = calcRectangle(mas_ms, 100, 70, 6);
      return {
        name: 'MAS 7 — Rectangles 15:15 @100/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @100% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 8: {
      const work = calcInterval(mas_ms, 100, 60);
      return {
        name: 'MAS 8 — 1 min @100%',
        type: 'interval',
        blocks: [
          { label: 'Structure', detail: '4 reps × (1 min work / 1 min rest) — rest 3 min — × 2 sets' },
          { label: 'Work distance', detail: `${work} m per rep @100% MAS` }
        ]
      };
    }

    case 9: {
      const r = calcRectangle(mas_ms, 100, 70, 6);
      return {
        name: 'MAS 9 — Rectangles 15:15 @100/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @100% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 10: {
      const r = calcRectangle(mas_ms, 100, 70, 6);
      return {
        name: 'MAS 10 — MAS Retest + Rectangles @100/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Part 1', detail: 'MAS retest — record new result before calculating targets' },
          { label: 'Part 2 structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 2 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @100% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 11: {
      const e = calcEurofit(mas_ms, 120, 6);
      return {
        name: 'MAS 11 — Eurofit 15:15 @120%',
        type: 'eurofit',
        blocks: [
          { label: 'Structure', detail: `${e.reps} reps (6 min) — × 2 sets` },
          { label: 'Work distance', detail: `${e.distance} m per rep @120% MAS — 15 seconds` },
          { label: 'Rest', detail: '15 seconds between reps' }
        ]
      };
    }

    case 12: {
      const r = calcRectangle(mas_ms, 103, 70, 6);
      return {
        name: 'MAS 12 — Rectangles 15:15 @103/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @103% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 13: {
      const e = calcEurofit(mas_ms, 120, 7);
      return {
        name: 'MAS 13 — Eurofit 15:15 @120%',
        type: 'eurofit',
        blocks: [
          { label: 'Structure', detail: `${e.reps} reps (7 min) — × 3 sets` },
          { label: 'Work distance', detail: `${e.distance} m per rep @120% MAS — 15 seconds` },
          { label: 'Rest', detail: '15 seconds between reps' }
        ]
      };
    }

    case 14: {
      const r = calcRectangle(mas_ms, 103, 70, 6);
      return {
        name: 'MAS 14 — Rectangles 15:15 @103/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @103% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 15: {
      const e = calcEurofit(mas_ms, 120, 8);
      return {
        name: 'MAS 15 — Eurofit 15:15 @120%',
        type: 'eurofit',
        blocks: [
          { label: 'Structure', detail: `${e.reps} reps (8 min) — × 3 sets` },
          { label: 'Work distance', detail: `${e.distance} m per rep @120% MAS — 15 seconds` },
          { label: 'Rest', detail: '15 seconds between reps' }
        ]
      };
    }

    case 16: {
      const e = calcEurofit(mas_ms, 125, 8);
      return {
        name: 'MAS 16 — Eurofit 15:15 @125%',
        type: 'eurofit',
        blocks: [
          { label: 'Structure', detail: `${e.reps} reps (8 min) — × 3 sets` },
          { label: 'Work distance', detail: `${e.distance} m per rep @125% MAS — 15 seconds` },
          { label: 'Rest', detail: '15 seconds between reps' }
        ]
      };
    }

    case 17: {
      const r = calcRectangle(mas_ms, 106, 70, 6);
      return {
        name: 'MAS 17 — Rectangles 15:15 @106/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (6 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @106% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 18: {
      const t = calcTabata(mas_ms, 120, 5);
      return {
        name: 'MAS 18 — Tabata 20:10 @120%',
        type: 'tabata',
        blocks: [
          { label: 'Structure', detail: `${t.reps} reps (5 min) — × 2 sets` },
          { label: 'Work distance', detail: `${t.distance} m per rep @120% MAS — 20 seconds` },
          { label: 'Rest', detail: '10 seconds between reps' }
        ]
      };
    }

    case 19: {
      const r = calcRectangle(mas_ms, 106, 70, 6);
      const e = calcEurofit(mas_ms, 120, 8);
      return {
        name: 'MAS 19 — Rectangles + Eurofit',
        type: 'combined',
        blocks: [
          { label: 'Block 1 — Rectangles structure', detail: `${r.reps} reps (6 min) — × 1 set` },
          { label: 'Block 1 long side (fast)', detail: `${r.longSide} m @106% MAS — 15 seconds` },
          { label: 'Block 1 short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Block 1 lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Block 1 setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) },
          { label: 'Block 2 — Eurofit structure', detail: `${e.reps} reps (8 min) Eurofit 15:15 @120% — × 1 set` },
          { label: 'Block 2 distance', detail: `${e.distance} m per rep @120% MAS — 15 seconds` }
        ]
      };
    }

    case 20: {
      const e = calcEurofit(mas_ms, 130, 8);
      const t = calcTabata(mas_ms, 120, 5);
      return {
        name: 'MAS 20 — Eurofit + Tabata',
        type: 'combined',
        blocks: [
          { label: 'Block 1 — Eurofit structure', detail: `${e.reps} reps (8 min) @130% — × 1 set` },
          { label: 'Block 1 distance', detail: `${e.distance} m per rep @130% MAS — 15 seconds` },
          { label: 'Block 1 rest', detail: '15 seconds between reps' },
          { label: 'Block 2 — Tabata structure', detail: `${t.reps} reps (5 min) @120% — × 1 set` },
          { label: 'Block 2 distance', detail: `${t.distance} m per rep @120% MAS — 20 seconds` },
          { label: 'Block 2 rest', detail: '10 seconds between reps' }
        ]
      };
    }

    case 21: {
      const r = calcRectangle(mas_ms, 110, 70, 5);
      return {
        name: 'MAS 21 — Rectangles 15:15 @110/70%',
        type: 'rectangle',
        blocks: [
          { label: 'Structure', detail: `${r.reps} reps (5 min) — rest 3 min — × 3 sets` },
          { label: 'Long side (fast)', detail: `${r.longSide} m @110% MAS — 15 seconds` },
          { label: 'Short side (float)', detail: `${r.shortSide} m @70% MAS — 15 seconds` },
          { label: 'Lap distance', detail: `${r.lapDistance} m (2 long + 2 short sides)` },
          { label: 'Setup', detail: '4-cone rectangle — run continuously around the rectangle' },
          { label: 'diagram', detail: rectangleDiagram(r.longSide, r.shortSide) }
        ]
      };
    }

    case 22:
      return {
        name: 'MAS 22 — Final MAS Test',
        type: 'test',
        blocks: [
          { label: 'Instructions', detail: 'Conduct your final MAS test and record your distance and time to calculate your end-of-program MAS.' }
        ]
      };

    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// EXTRACTION PROMPT
// ─────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a data extractor for a running calculator. Extract values from the user message.

If the user provides distance and time, calculate MAS (m/s) = distance_metres / time_seconds.
Unit conversions: yards x 0.9144 = metres, km x 1000 = metres, miles x 1609 = metres.
Example: 1200m in 5 minutes = 1200 / 300 = 4.0 m/s

Output ONLY valid JSON, no other text:
{
  "mas_ms": <number or null>,
  "session_number": <number 1-22 or null>,
  "units_preference": "metric" or "us",
  "is_squad": false,
  "athletes": [],
  "progress": null,
  "clarification_needed": null
}

For progress analysis (two MAS values given), set:
"progress": {"old_mas": <number>, "new_mas": <number>}

Examples:
"I ran 1200m in 5 minutes, calculate MAS 12"
-> {"mas_ms": 4.0, "session_number": 12, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": null}

"My MAS improved from 4.0 to 4.4"
-> {"mas_ms": 4.4, "session_number": null, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": {"old_mas": 4.0, "new_mas": 4.4}, "clarification_needed": null}

"What is MAS 7?"
-> {"mas_ms": null, "session_number": 7, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": "Need MAS value to calculate targets"}

"Now give me MAS 20"
-> {"mas_ms": null, "session_number": 20, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": null}

"And MAS 20"
-> {"mas_ms": null, "session_number": 20, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": null}

"What about MAS 14?"
-> {"mas_ms": null, "session_number": 14, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": null}

IMPORTANT: Always extract the session number from the CURRENT message if any number follows "MAS". Short follow-ups like "now give me MAS 20", "and MAS 20", "what about MAS 14" always contain a valid session number.`;

// ─────────────────────────────────────────────
// RESPONSE SYSTEM PROMPT
// ─────────────────────────────────────────────

const RESPONSE_SYSTEM = `You are MAS Session Calculator for Prepare to Perform (preparetoperform.com.au).

Present pre-calculated session data clearly. Rules:
- DO NOT recalculate anything. Use only numbers from the context.
- For rectangle sessions: each side takes 15 seconds. There are 4 sides per lap (long, short, long, short).
- Be specific about reps and sets — never say "multiple laps".
- Never say "track session" or "rectangular track".
- Include the cone diagram exactly as provided when present.
- Use bullet points. Avoid dense paragraphs.
- Only ask for clarification if told clarification is needed.
- For program questions, direct to: https://www.preparetoperform.com.au/mas-running-system`;

// ─────────────────────────────────────────────
// CHAT ENDPOINT
// ─────────────────────────────────────────────

app.post('/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return res.status(400).json({ error: 'No user message' });

    // Step 1: Extract from current message only
    let extraction = {
      mas_ms: null, session_number: null, units_preference: 'metric',
      is_squad: false, athletes: [], progress: null, clarification_needed: null
    };
    try {
      const extractResp = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: lastUserMsg.content }]
      });
      extraction = JSON.parse(extractResp.content[0].text.trim());
    } catch (e) {
      console.error('Extraction error:', e);
    }

    // If MAS not in current message, scan previous assistant messages for it
    if (!extraction.mas_ms) {
      for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant') {
          const match = msg.content.match(/([0-9]+[.][0-9]+) m\/s/);
          if (match) {
            extraction.mas_ms = parseFloat(match[1]);
            break;
          }
        }
      }
    }

    // If session number not in current message, scan previous user messages for it
    if (!extraction.session_number) {
      for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'user') {
          const match = msg.content.match(/MAS\s*(\d+)/i);
          if (match) {
            extraction.session_number = parseInt(match[1]);
            break;
          }
        }
      }
    }

    // Step 2: Build context with calculated data
    const contextParts = [`User said: "${lastUserMsg.content}"\n`];

    // MAS formats
    if (extraction.mas_ms) {
      const f = formatMAS(extraction.mas_ms);
      contextParts.push(`MAS:\n- ${f.ms} m/s\n- ${f.kmh} km/h\n- ${f.pace}`);
    }

    // Progress analysis
    if (extraction.progress) {
      const { old_mas, new_mas } = extraction.progress;
      const improvement = (((new_mas - old_mas) / old_mas) * 100).toFixed(1);
      contextParts.push(`Progress:\n- Previous MAS: ${old_mas} m/s\n- New MAS: ${new_mas} m/s\n- Improvement: ${improvement}%\n- Typical mid-program: ~5–6% | Final test: ~10–12%`);
    }

    // Session calculation
    let diagramMarkers = []; // collected separately, injected after Claude response
    if (extraction.session_number) {
      if (extraction.mas_ms) {
        const session = buildSession(extraction.session_number, extraction.mas_ms);
        if (session) {
          contextParts.push(`\n${session.name}:`);
          session.blocks.forEach(b => {
            if (b.label === 'diagram') {
              // Don't send diagram to Claude — collect it to inject after
              diagramMarkers.push(b.detail);
            } else {
              contextParts.push(`- ${b.label}: ${b.detail}`);
            }
          });
        } else {
          contextParts.push(`MAS ${extraction.session_number} is not a valid session (range: 1–22). Ask which session they mean.`);
        }
      } else {
        contextParts.push(`User asked about MAS ${extraction.session_number} but has not provided a test result. Ask: "How far did you run and how long did it take?"`);
      }
    }

    // Clarification
    if (extraction.clarification_needed) {
      contextParts.push(`\nNote: ${extraction.clarification_needed}`);
    }

    const contextMessage = {
      role: 'user',
      content: contextParts.join('\n') + '\n\nNow respond to the user.'
    };

    // Step 3: Generate final response
    const responseMessages = [...messages.slice(0, -1), contextMessage];
    const finalResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: RESPONSE_SYSTEM,
      messages: responseMessages
    });

    let reply = finalResp.content[0].text;
    reply = reply.replace(/rectangular track session/gi, 'rectangle session');
    reply = reply.replace(/track session/gi, 'session');

    // Append diagram markers — injected after Claude's text, not via Claude
    if (diagramMarkers.length > 0) {
      reply = reply + '\n\n' + diagramMarkers.join('\n\n');
    }

    res.json({ reply });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
// ─────────────────────────────────────────────
// RUNNING SPEED CALCULATOR ENDPOINT
// ─────────────────────────────────────────────

const SPEED_SYSTEM = `You are a running speed calculator. The user gives you a running scenario in plain English.
Extract the numbers, calculate ALL of the following metrics, then return ONLY valid JSON — no prose, no markdown, no backticks.

JSON format:
{
  "mps": number,
  "kmh": number,
  "mph": number,
  "minPerKm": string,
  "minPerMile": string,
  "context": string
}

Rules:
- mps = metres per second (2 decimal places)
- kmh = kilometres per hour (2 decimal places)
- mph = miles per hour (2 decimal places)
- minPerKm = pace in "M:SS /km" format
- minPerMile = pace in "M:SS /mile" format
- context = one friendly sentence summarising the result and what it compares to
- If the user gives pace or speed to convert, derive all other formats from that
- If input cannot be interpreted, return: {"error": "brief explanation"}
- Return ONLY the JSON object. No other text.`;

app.post('/running-speed', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'No query provided' });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SPEED_SYSTEM,
      messages: [{ role: 'user', content: query }]
    });

    const raw = response.content[0].text.trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    res.json(result);

  } catch (err) {
    console.error('Speed calc error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
// ─────────────────────────────────────────────
// WENDLER CALCULATOR
// Drop these helpers above your route handlers (alongside the MAS helpers),
// and the two route handlers anywhere with the others.
// ─────────────────────────────────────────────

// ─── HELPERS ───────────────────────────────────

function ceilTo(weight, increment) {
  return Math.ceil(weight / increment) * increment;
}

// Epley formula: e1RM = weight × (1 + 0.0333 × reps)
function epley(weight, reps) {
  return weight * (1 + 0.0333 * reps);
}

// Session percentage templates (all % of Training Max)
// AMRAP minimum reps shown for clarity in the prescription
const WENDLER_TEMPLATES = {
  week1: {
    name: 'Week 1 — 5/5/5+',
    description: 'Volume week. Build base reps, push the final AMRAP set.',
    warmups: [
      { pct: 40, reps: 5 },
      { pct: 50, reps: 5 },
      { pct: 60, reps: 3 }
    ],
    working: [
      { pct: 65, reps: 5, amrap: false },
      { pct: 75, reps: 5, amrap: false },
      { pct: 85, reps: 5, amrap: true, minReps: 5, capReps: 20 }
    ]
  },
  week2: {
    name: 'Week 2 — 3/3/3+',
    description: 'Intensity week. Heavier loads, fewer reps.',
    warmups: [
      { pct: 40, reps: 5 },
      { pct: 50, reps: 5 },
      { pct: 60, reps: 3 }
    ],
    working: [
      { pct: 70, reps: 3, amrap: false },
      { pct: 80, reps: 3, amrap: false },
      { pct: 90, reps: 3, amrap: true, minReps: 3, capReps: 20 }
    ]
  },
  week3: {
    name: 'Week 3 — 5/3/1+',
    description: 'Peak week. Top set is the AMRAP — the heart of 5/3/1.',
    warmups: [
      { pct: 40, reps: 5 },
      { pct: 50, reps: 5 },
      { pct: 60, reps: 3 }
    ],
    working: [
      { pct: 75, reps: 5, amrap: false },
      { pct: 85, reps: 3, amrap: false },
      { pct: 95, reps: 1, amrap: true, minReps: 1, capReps: 20 }
    ]
  },
  deload: {
    name: 'Deload — 5/5/5',
    description: 'Recovery week. No AMRAP. Move well, recover, return.',
    warmups: [
      { pct: 40, reps: 5 },
      { pct: 50, reps: 5 },
      { pct: 60, reps: 3 }
    ],
    working: [
      { pct: 40, reps: 5, amrap: false },
      { pct: 50, reps: 5, amrap: false },
      { pct: 60, reps: 5, amrap: false }
    ]
  },
  endurance: {
    name: 'Strength Endurance — 4×12',
    description: 'Conditioning and muscular endurance. Three warm-ups then one working set of 12+ AMRAP at 70% TM.',
    warmups: [
      { pct: 40, reps: 12 },
      { pct: 50, reps: 12 },
      { pct: 60, reps: 12 }
    ],
    working: [
      { pct: 70, reps: 12, amrap: true, minReps: 12, capReps: 30 }
    ]
  },
  foundation: {
    name: 'Foundation — 3×8',
    description: 'Hypertrophy-leaning base scheme. Three warm-ups then one working set of 8+ AMRAP at 70% TM.',
    warmups: [
      { pct: 40, reps: 8 },
      { pct: 50, reps: 8 },
      { pct: 60, reps: 8 }
    ],
    working: [
      { pct: 70, reps: 8, amrap: true, minReps: 8, capReps: 25 }
    ]
  }
};

// Build a session prescription from TM
function buildWendlerSession(sessionKey, trainingMax, rounding) {
  const template = WENDLER_TEMPLATES[sessionKey];
  if (!template) return null;

  const sets = [];

  template.warmups.forEach((s, i) => {
    sets.push({
      label: `Warm-up ${i + 1}`,
      pct: s.pct,
      weight: ceilTo(trainingMax * (s.pct / 100), rounding),
      reps: String(s.reps),
      amrap: false
    });
  });

  template.working.forEach((s, i) => {
    const setNum = template.warmups.length + i + 1;
    let repsLabel;
    if (s.amrap) {
      // Wendler convention: write "5+" for AMRAP starting at min reps
      repsLabel = `${s.minReps}+`;
    } else {
      repsLabel = String(s.reps);
    }
    sets.push({
      label: `Set ${setNum}`,
      pct: s.pct,
      weight: ceilTo(trainingMax * (s.pct / 100), rounding),
      reps: repsLabel,
      amrap: !!s.amrap,
      minReps: s.minReps || null,
      capReps: s.capReps || null
    });
  });

  return {
    sessionKey,
    name: template.name,
    description: template.description,
    sets,
    notes: template.working.some(s => s.amrap)
      ? `Final set: as many reps as possible with good form. Stop if you reach ${template.working.find(s => s.amrap).capReps} reps — that means the TM is too light and should be increased next cycle.`
      : 'No AMRAP this session — execute as prescribed.'
  };
}

// ─── MAIN ENDPOINT: /wendler ─────────────────

app.post('/wendler', (req, res) => {
  try {
    const {
      mode,              // 'e1rm' or 'topSet'
      e1rm,              // number, used when mode === 'e1rm'
      topSetWeight,      // number, used when mode === 'topSet'
      topSetReps,        // number, used when mode === 'topSet'
      tmPercent,         // 80–95
      rounding,          // 1, 2.5, or 5
      session            // 'week1' | 'week2' | 'week3' | 'deload' | 'endurance' | 'foundation'
    } = req.body;

    // Validate inputs
    if (!session || !WENDLER_TEMPLATES[session]) {
      return res.status(400).json({ error: 'Invalid or missing session. Use: week1, week2, week3, deload, endurance, foundation.' });
    }
    const tmPct = Number(tmPercent);
    if (!tmPct || tmPct < 80 || tmPct > 95) {
      return res.status(400).json({ error: 'tmPercent must be a number between 80 and 95.' });
    }
    const roundIncrement = Number(rounding);
    if (![1, 2.5, 5].includes(roundIncrement)) {
      return res.status(400).json({ error: 'rounding must be 1, 2.5, or 5.' });
    }

    // Derive e1RM
    let derivedE1RM;
    if (mode === 'topSet') {
      const w = Number(topSetWeight);
      const r = Number(topSetReps);
      if (!w || !r || w <= 0 || r <= 0 || r > 30) {
        return res.status(400).json({ error: 'topSet mode requires valid topSetWeight and topSetReps (1–30).' });
      }
      derivedE1RM = epley(w, r);
    } else if (mode === 'e1rm') {
      const e = Number(e1rm);
      if (!e || e <= 0) {
        return res.status(400).json({ error: 'e1rm mode requires a valid e1rm value.' });
      }
      derivedE1RM = e;
    } else {
      return res.status(400).json({ error: 'mode must be "e1rm" or "topSet".' });
    }

    const trainingMax = derivedE1RM * (tmPct / 100);
    const sessionData = buildWendlerSession(session, trainingMax, roundIncrement);

    res.json({
      e1rm: Math.round(derivedE1RM * 10) / 10,
      trainingMax: Math.round(trainingMax * 10) / 10,
      tmPercent: tmPct,
      rounding: roundIncrement,
      session: sessionData
    });

  } catch (err) {
    console.error('Wendler error:', err);
    res.status(500).json({ error: 'Something went wrong calculating the Wendler session.' });
  }
});

// ─── COACHING ENDPOINT: /wendler/coach ───────

const WENDLER_COACH_SYSTEM = `You are a strength coach providing brief, evidence-grounded feedback on a Wendler 5/3/1 AMRAP result for Prepare to Perform.

You will be given pre-calculated data. Your job is to interpret it and write a short coaching note (3–5 sentences max).

Tone: direct, knowledgeable, encouraging but never sycophantic. No emojis. No hedging.

Use these progression rules (based on Wendler's published guidance, with research-aware nuance):
- AMRAP reps below the minimum: TM is too heavy. Recommend dropping TM by 10% and rebuilding.
- AMRAP reps at the minimum (e.g. 5 on Week 1, 3 on Week 2, 1 on Week 3): hold TM, no increase this cycle.
- AMRAP reps 1–4 above minimum: standard progression (+2.5 kg upper body lifts, +5 kg lower body lifts).
- AMRAP reps 5–9 above minimum: strong session — standard progression and consider Joker sets next cycle.
- AMRAP reps 10+ above minimum, or capped at 20: TM is too light. Recommend increasing TM by 5–10% rather than the standard kg jump.

Always end with one concrete next-cycle action.

Output ONLY a plain text coaching note. No JSON. No markdown headers. No bullet lists unless the situation genuinely needs them.`;

app.post('/wendler/coach', async (req, res) => {
  try {
    const {
      lift,              // optional: 'squat' | 'bench' | 'deadlift' | 'press' | string
      session,           // 'week1' | 'week2' | 'week3' | etc.
      tmPercent,         // 80–95
      previousE1RM,      // number
      previousTM,        // number
      topSetWeight,      // the prescribed AMRAP weight
      topSetPct,         // the % of TM that top set represented (85, 90, 95, 70...)
      repsAchieved,      // number of reps the user hit
      minReps,           // the prescribed minimum for that AMRAP
      capReps            // the cap (e.g. 20)
    } = req.body;

    // Validate
    const reps = Number(repsAchieved);
    const tsw = Number(topSetWeight);
    if (!reps || reps <= 0 || !tsw || tsw <= 0) {
      return res.status(400).json({ error: 'repsAchieved and topSetWeight are required.' });
    }

    // Recalculate e1RM from the actual AMRAP performance
    const newE1RM = epley(tsw, reps);
    const oldE1RM = Number(previousE1RM) || (tsw / ((Number(topSetPct) || 85) / 100)) / ((Number(tmPercent) || 85) / 100);
    const deltaE1RM = newE1RM - oldE1RM;
    const deltaPct = (deltaE1RM / oldE1RM) * 100;

    // Classify
    const minR = Number(minReps) || 1;
    const cap = Number(capReps) || 20;
    const repsAboveMin = reps - minR;
    let classification;
    let progressionAdvice;

    if (reps < minR) {
      classification = 'below_minimum';
      progressionAdvice = 'Reduce TM by 10% and rebuild over the next cycle.';
    } else if (repsAboveMin === 0) {
      classification = 'at_minimum';
      progressionAdvice = 'Hold TM at current level for the next cycle. No increase.';
    } else if (repsAboveMin >= 1 && repsAboveMin <= 4) {
      classification = 'standard';
      progressionAdvice = 'Standard progression: +2.5 kg for upper body lifts (bench, press) or +5 kg for lower body lifts (squat, deadlift).';
    } else if (repsAboveMin >= 5 && repsAboveMin <= 9) {
      classification = 'strong';
      progressionAdvice = 'Standard progression next cycle, and consider adding Joker sets to capitalise on momentum.';
    } else {
      classification = 'tm_too_light';
      progressionAdvice = 'Increase TM by 5–10% next cycle rather than the standard small jump — the current TM is too conservative.';
    }

    const capped = reps >= cap;

    // Build context for AI
    const context = `
Lift: ${lift || 'main lift'}
Session: ${session}
Top set: ${tsw} kg × ${reps} reps (${topSetPct}% of TM)
Minimum prescribed reps: ${minR}
Reps above minimum: ${repsAboveMin}
Capped at ${cap}: ${capped ? 'yes' : 'no'}

Previous e1RM: ${oldE1RM.toFixed(1)} kg
New e1RM from this session: ${newE1RM.toFixed(1)} kg
Change: ${deltaE1RM >= 0 ? '+' : ''}${deltaE1RM.toFixed(1)} kg (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)

Classification: ${classification}
Recommended progression: ${progressionAdvice}

Write a 3–5 sentence coaching note interpreting this result. Reference the actual numbers. End with the concrete next-cycle action.`;

    const aiResp = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: WENDLER_COACH_SYSTEM,
      messages: [{ role: 'user', content: context }]
    });

    const note = aiResp.content[0].text.trim();

    res.json({
      newE1RM: Math.round(newE1RM * 10) / 10,
      previousE1RM: Math.round(oldE1RM * 10) / 10,
      deltaKg: Math.round(deltaE1RM * 10) / 10,
      deltaPct: Math.round(deltaPct * 10) / 10,
      classification,
      progressionAdvice,
      cappedAtMax: capped,
      coachNote: note
    });

  } catch (err) {
    console.error('Wendler coach error:', err);
    res.status(500).json({ error: 'Something went wrong generating the coaching note.' });
  }
});
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(process.env.PORT || 3000, () => console.log('MAS API running'));
