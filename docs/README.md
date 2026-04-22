# Construction Planning Assistant Agent

**Arch** — An AI-powered construction project planning agent built with a tool-calling architecture, real-time streaming, and a clean chat-style web interface. Arch takes a natural language construction goal and produces a detailed, phase-by-phase execution plan backed by live tool calls.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Agent & Tool System](#agent--tool-system)
- [API Reference](#api-reference)
- [Data Schema](#data-schema)
- [Frontend](#frontend)
- [Setup & Running](#setup--running)
- [Environment Variables](#environment-variables)
- [Dependencies](#dependencies)

---

## Overview

**Arch** is the construction AI agent at the core of this system. You describe a project — a farmhouse, an apartment complex, a mansion — and Arch:

1. Breaks it into **4 standard construction phases** (Site Preparation, Foundation, Framing, Interior Finish)
2. Calls real tools to check materials, labor, permits, and durations for each phase
3. Streams the analysis live to the UI with a frequency waveform animation
4. Produces a structured report with metrics, phase table, Gantt chart, and agent log
5. Saves everything to a persistent history file

**Stack:** Python · FastAPI · Groq (Llama 3.1 8B Instant) · Vanilla JS · Server-Sent Events

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌──────────┐   ┌──────────────────────────────────┐   │
│  │ Sidebar  │   │         Chat Interface            │   │
│  │ History  │   │  User Bubble → Analysis → Plan    │   │
│  └──────────┘   └──────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │ POST /plan/stream (SSE)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Server                        │
│                      main.py                            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              agent_stream()                      │   │
│  │                                                  │   │
│  │  1. Build system prompt (based on active pills)  │   │
│  │  2. Send to Groq API (Llama 3.1 8B Instant)             │   │
│  │  3. Receive tool_calls → execute tools           │   │
│  │  4. Stream SSE events back to browser            │   │
│  │  5. On final response → save to history.json     │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
  check_material   check_worker   check_permit
  _availability    _availability    _status
                         │
                  calculate_duration
```

### Request Flow

```
User types goal
      │
      ▼
POST /plan/stream
      │
      ▼
build_system_prompt()  ← active pills determine which tools are included
      │
      ▼
Groq API (Llama 3.1 8B Instant)
      │
      ├── finish_reason: tool_calls
      │         │
      │         ▼
      │   Execute tool → stream SSE {type: "tool_call"}
      │   Append result to messages
      │   Loop back to Groq
      │
      └── finish_reason: stop
                │
                ▼
          Stream SSE {type: "final", content: "..."}
          Save to history.json
```

---

## Project Structure

```
agentic/
│
├── main.py                    # FastAPI server, agent loop, history management
├── demo.py                    # CLI demo (terminal-based)
├── verification.py            # Structural health check script
├── requirements.txt           # Python dependencies
├── .env                       # API keys (not committed)
│
├── agents/                    # Legacy Google ADK agent definitions
│   ├── orchestrator.py        # Arch — lead orchestrator agent
│   ├── planner.py             # Phase decomposition agent
│   ├── resource_validator.py  # Materials/labor/permit checker agent
│   └── scheduler.py           # Timeline scheduling agent
│
├── tools/
│   └── construction_tools.py  # 4 tool functions called by the LLM
│
└── static/                    # Frontend (served by FastAPI)
    ├── index.html             # Single-page app shell
    ├── style.css              # All UI styles
    ├── app.js                 # All frontend logic
    └── history.json           # Persistent plan history
```

---

## How It Works

### 1. Tool Selection (Pills)

The user selects which tools Arch should use before submitting a goal. Each pill maps to one or more tool functions:

| Pill | Tool Function | What it checks |
|------|--------------|----------------|
| Materials | `check_material_availability` | Material name + stock status |
| Labor | `check_worker_availability` | Worker count + sufficiency |
| Permits | `check_permit_status` | Permit type + approval status |
| Schedule | `calculate_duration` | Phase duration in days |
| Budget | *(prompt only)* | Adds budget section to report |
| Risk | *(prompt only)* | Adds risk summary to report |

### 2. System Prompt Construction

`build_system_prompt()` dynamically builds the LLM instruction based on which pills are active. If only Materials and Schedule are selected, the prompt only instructs Arch to call those two tools — reducing token usage and keeping the output focused.

### 3. Agent Loop

The core loop in `agent_stream()` runs up to **16 iterations** (4 phases × 4 tools) before generating the final plan:

```python
while True:
    response = await groq.chat.completions.create(...)
    
    if finish_reason == "tool_calls":
        # Execute each tool, stream result to browser, append to messages
        for tool_call in msg.tool_calls:
            result = TOOL_MAP[fn_name](**fn_args)
            yield sse({"type": "tool_call", ...})
            messages.append({"role": "tool", ...})
    
    elif finish_reason == "stop":
        # Final plan — save to history, stream to browser
        yield sse({"type": "final", "content": plan})
        break
    
    elif finish_reason == "length":
        # Token limit hit — send what we have
        yield sse({"type": "final", "content": partial_plan})
        break
```

### 4. Streaming (SSE)

The server uses Server-Sent Events to push updates to the browser in real time. Three event types:

```json
{"type": "tool_call", "name": "check_material_availability", "arg": "Foundation", "result": "..."}
{"type": "final", "content": "## Project Overview\n...", "id": "uuid"}
{"type": "error", "message": "Rate limit reached. Please try again in 5m."}
```

---

## Agent & Tool System

### Tools (`tools/construction_tools.py`)

Four functions that simulate a real construction data system. In production these would connect to actual databases or APIs.

#### `check_material_availability(phase_name)`
Returns the status of a randomly selected material for the given phase.
- Materials pool: Steel, Concrete, Lumber, PVC Pipes, Electrical Wiring, Drywall
- Statuses: In Stock, On Order, Delivered, Delayed

#### `check_worker_availability(phase_name)`
Returns worker count and sufficiency status.
- Generates random available (0–10) and needed (2–8) counts
- Status: Sufficient if available ≥ needed, else Shortage

#### `check_permit_status(phase_name)`
Returns permit type and approval status.
- Permit types: Zoning, Structural, Utility, Safety
- Statuses: Approved, Pending Review, Under Revision, Not Started

#### `calculate_duration(phase_name)`
Returns estimated days for a phase.
- Known phases have fixed durations (Foundation=14, Framing=21, Interior Finish=30, etc.)
- Unknown phases get a random 5–15 day estimate

### Legacy Agents (`agents/`)

The `agents/` folder contains the original Google ADK multi-agent implementation. These are not used in the current production path (`main.py`) but are preserved for reference:

| Agent | Role |
|-------|------|
| `orchestrator.py` (Arch) | Delegates to sub-agents, assembles final report |
| `planner.py` | Decomposes goal into phases |
| `resource_validator.py` | Checks materials, labor, permits |
| `scheduler.py` | Generates timeline |

The current `main.py` consolidates all of this into a single agent loop with direct tool calls, which is more reliable with Groq's API.

---

## API Reference

### `POST /plan/stream`

Streams a construction plan as Server-Sent Events.

**Request body:**
```json
{
  "goal": "Plan a 3-story residential building",
  "tools": ["materials", "labor", "permits", "schedule"]
}
```

**SSE stream:**
```
data: {"type": "tool_call", "name": "check_material_availability", "arg": "Foundation", "result": "Concrete is Delivered."}
data: {"type": "tool_call", "name": "calculate_duration", "arg": "Foundation", "result": "14 days."}
data: {"type": "final", "content": "## Project Overview\n...", "id": "uuid-here"}
```

---

### `GET /history`

Returns all saved plans.

**Response:** Array of history entries (see Data Schema below).

---

### `DELETE /history/{item_id}`

Deletes a history entry by ID.

**Response:** `{"ok": true}`

---

### `GET /health`

Health check.

**Response:** `{"status": "active"}`

---

## Data Schema

Each plan is saved to `static/history.json` with this structure:

```json
{
  "id": "26832b1c-2ab7-4766-a042-4689426ce766",
  "project": {
    "goal": "Design a sustainable eco-friendly farmhouse...",
    "created_on": "2026-04-11",
    "created_at": "09:26 UTC",
    "total_duration_days": 94,
    "tools_enabled": ["materials", "labor", "permits", "schedule"]
  },
  "phases": {
    "Site Preparation": { ... },
    "Foundation": { ... },
    "Framing": { ... },
    "Interior Finish": { ... }
  },
  "plan_markdown": "## Project Overview\n..."
}
```

**Field descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID string | Unique identifier for the plan |
| `project.goal` | string | Original user input |
| `project.created_on` | date string | Date plan was generated |
| `project.created_at` | time string | Time in UTC |
| `project.total_duration_days` | integer | Sum of all phase durations |
| `project.tools_enabled` | string[] | Pills that were active |
| `phases` | object | Keyed by phase name |
| `phases[name].material` | string | Parsed material status |
| `phases[name].labor` | string | Parsed worker status |
| `phases[name].permit` | string | Parsed permit status |
| `phases[name].duration` | string | e.g. "14 days" |
| `phases[name].timeline.start_day` | integer | Sequential start day |
| `phases[name].timeline.end_day` | integer | Sequential end day |
| `plan_markdown` | string | Full LLM-generated report |

---

## Frontend

The UI is a single-page app with no framework — plain HTML, CSS, and JavaScript split across three files.

### `static/index.html`
App shell. Contains all markup: narrow icon sidebar (44px), full history sidebar (240px), home screen, chat screen with result dashboard, right log panel, and reply bar.

### `static/style.css`
All styles. Key sections:
- **Icon sidebar** — 44px fixed left strip with navigation icons
- **Full sidebar** — 240px history panel that slides in/out
- **Home screen** — centered input card with rotating title and tool pills
- **Chat screen** — user bubble, analysis dropdown, tabbed result dashboard
- **Result dashboard** — 4 metric cards + 4 tabs (Overview, Phases, Schedule, Agent Log)
- **Right log panel** — 260px fixed right panel showing live agent execution log
- **Waveform** — canvas-based frequency animation shown during loading
- **Analysis block** — collapsible dropdown with 7 step checkpoints
- **Gantt chart** — proportional bar chart built from phase timeline data

### `static/app.js`
All frontend logic. Key functions:

| Function | Purpose |
|----------|---------|
| `generatePlan()` | Reads input, calls `/plan/stream`, handles SSE events |
| `renderPlan(text)` | Converts markdown to HTML and injects into Overview tab |
| `populateDashboard(item, calls)` | Fills metrics, phase table, Gantt, and agent log from history data |
| `buildGantt(phases, total)` | Renders proportional Gantt bars from timeline data |
| `buildAgentLog(phases)` | Builds THINK→CALL→OBS→DONE log entries |
| `switchPlanTab(name)` | Switches between Overview / Phases / Schedule / Agent Log tabs |
| `renderAnalysisBlock(doneKeys, open)` | Builds the analysis dropdown with step states |
| `markStep(key)` | Ticks a step green as tool calls arrive |
| `startWave() / stopWave()` | Canvas frequency animation during loading |
| `sidebarLog(tag, cls, text)` | Appends a live log entry to the right panel |
| `loadHistory()` | Fetches `/history` and populates sidebar |
| `loadHistoryItem(id)` | Loads a saved plan into the full dashboard view |
| `toggleSidebar()` | Opens/closes the history panel |
| `togglePill(el)` | Activates/deactivates a tool pill |

### Result Dashboard Tabs

After a plan is generated, the result screen shows:

1. **Overview** — Full markdown plan rendered with section headers and schedule table
2. **Phases** — Table with phase name, start/end days, duration, material, labor, permit status pills
3. **Schedule** — Gantt chart with colored bars proportional to phase duration
4. **Agent Log** — Full THINK → CALL → OBS → DONE execution trace in terminal style

### Analysis Steps

The 7 checkpoints shown in the collapsible Analysis dropdown:

```
1. Goal received & phases identified     ← marked immediately on submit
2. Material availability checked         ← marked on check_material_availability call
3. Labor resources verified              ← marked on check_worker_availability call
4. Permit status confirmed               ← marked on check_permit_status call
5. Phase durations estimated             ← marked on calculate_duration call
6. Execution schedule assembled          ← marked on final response
7. Plan finalized                        ← marked 250ms after final
```

---

## Setup & Running

### 1. Clone and install

```bash
git clone <repo>
cd agentic
pip install -r requirements.txt
```

### 2. Set up environment

```bash
cp .env.example .env
# Add your GROQ_API_KEY
```

### 3. Run

```bash
python3 main.py
```

Open `http://localhost:8080`

### CLI demo (terminal only)

```bash
python3 demo.py
```

### Structural verification

```bash
python3 verification.py
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | From [console.groq.com](https://console.groq.com) |
| `PORT` | No | Server port (default: 8080) |

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.135.3 | Web framework + API server |
| `uvicorn` | 0.44.0 | ASGI server |
| `groq` | 1.1.2 | Groq API client (Llama 3.1 8B Instant) |
| `pydantic` | 2.12.5 | Request/response validation |
| `python-dotenv` | 1.2.2 | `.env` file loading |
| `google-adk` | 1.29.0 | Legacy agent framework (agents/ folder) |

---

## Notes

- **Free tier limits:** Groq free tier allows 100k tokens/day on `llama-3.1-8b-instant`. Each full plan uses ~1.5–2k tokens (4 phases × 4 tools + final response). Upgrade to Dev tier for higher limits.
- **Model choice:** `llama-3.1-8b-instant` is used for speed — sub-second per tool call loop. Switch to `llama-3.3-70b-versatile` in `main.py` for higher quality output at the cost of speed and more tokens.
- **Tool data is simulated:** `construction_tools.py` uses `random` to simulate real data. In production, replace these functions with actual database or API calls.
- **History cap:** The last 100 plans are kept in `history.json`. Older entries are automatically dropped.
- **Token truncation:** If the model hits the token limit mid-response, the partial plan is saved and displayed with a truncation notice.
