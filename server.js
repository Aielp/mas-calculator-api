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
  return `
Cone layout:

A ──── ${longSide}m ──── B
|                        |
${shortSide}m          ${shortSide}m
|                        |
D ──── ${longSide}m ──── C

A→B = long side (fast, 15 sec)
B→C = short side (float, 15 sec)
C→D = long side (fast, 15 sec)
D→A = short side (float, 15 sec)
4 cones only — run continuously around the rectangle`;
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
-> {"mas_ms": null, "session_number": 7, "units_preference": "metric", "is_squad": false, "athletes": [], "progress": null, "clarification_needed": "Need MAS value to calculate targets"}`;

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
    if (extraction.session_number) {
      if (extraction.mas_ms) {
        const session = buildSession(extraction.session_number, extraction.mas_ms);
        if (session) {
          contextParts.push(`\n${session.name}:`);
          session.blocks.forEach(b => {
            if (b.label === 'diagram') {
              contextParts.push(b.detail);
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

    res.json({ reply });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(process.env.PORT || 3000, () => console.log('MAS API running'));
