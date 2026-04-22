# High-Level Design (HLD)
## Construction Planning Assistant Agent

**Document Version:** 1.0
**Date:** April 2026
**Agent Name:** Arch
**Project:** Construction Planning Assistant Agent

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 Scope of the Document
   - 1.2 Intended Audience
   - 1.3 System Overview
2. [System Design](#2-system-design)
   - 2.1 Application Design
   - 2.2 Process Flow
   - 2.3 Information Flow
   - 2.4 Components Design
   - 2.5 Key Design Considerations
   - 2.6 API Catalogue
3. [Data Design](#3-data-design)
   - 3.1 Data Model
   - 3.2 Data Access Mechanism
   - 3.3 Data Retention Policies
   - 3.4 Data Migration
4. [Interfaces](#4-interfaces)
5. [State and Session Management](#5-state-and-session-management)
6. [Caching](#6-caching)
7. [Non-Functional Requirements](#7-non-functional-requirements)
   - 7.1 Security Aspects
   - 7.2 Performance Aspects
8. [References](#8-references)

---

## 1. Introduction

### 1.1 Scope of the Document

This High-Level Design document describes the architecture, system design, data model, and technical decisions for the **Construction Planning Assistant Agent** — an AI-powered agentic system that generates detailed construction project execution plans from natural language goals.

The document covers:
- Overall system architecture and layered design
- Agent execution flow and tool-calling mechanism
- Frontend interface design and component breakdown
- Data storage schema and persistence strategy
- API surface and integration points
- Non-functional requirements including security and performance

This document does not cover low-level implementation details, database query optimization, or deployment infrastructure configuration.

---

### 1.2 Intended Audience

| Audience | Purpose |
|----------|---------|
| Software Developers | Understanding system architecture for development and extension |
| Technical Reviewers | Evaluating design decisions and architecture quality |
| Academic Evaluators | Assessing the agentic AI system design for project review |
| Future Maintainers | Onboarding to the codebase and understanding component responsibilities |

---

### 1.3 System Overview

The Construction Planning Assistant Agent is a full-stack AI agent application that accepts a natural language construction goal from the user and autonomously generates a comprehensive, phase-by-phase execution plan.

**Core Capabilities:**
- Accepts free-form construction goals (e.g., "Plan a 3-story residential building")
- Decomposes the goal into 4 standard construction phases
- Autonomously calls 4 specialized tool functions per phase (materials, labor, permits, duration)
- Streams live agent reasoning and tool execution to the browser via Server-Sent Events
- Renders a structured result dashboard with metrics, phase table, Gantt chart, and agent log
- Persists all plans to a local JSON history file with full phase data

**Technology Stack:**

| Layer | Technology |
|-------|-----------|
| LLM | Llama 3.1 8B Instant via Groq API |
| Backend | Python 3.11 · FastAPI · Uvicorn |
| Agent Framework | Custom ReAct loop (no external agent library) |
| Frontend | Vanilla HTML · CSS · JavaScript (no framework) |
| Streaming | Server-Sent Events (SSE) |
| Persistence | JSON flat file (`history.json`) |
| Data Validation | Pydantic v2 |

---

## 2. System Design

### 2.1 Application Design

The system follows an **Agent-Oriented Layered Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  Chat UI · Rotating Title · Tool Pills · Result Dashboard   │
│  Analysis Dropdown · Gantt Chart · Right Log Panel          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│                      API LAYER                               │
│  FastAPI · POST /plan/stream · GET /history                  │
│  DELETE /history/{id} · GET / · GET /health                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│               AGENT ORCHESTRATION LAYER                      │
│  agent_stream() · build_system_prompt() · ReAct Loop        │
│  Dynamic prompt construction based on active tool pills      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Function calls
┌──────────────────────────▼──────────────────────────────────┐
│                  TOOL EXECUTION LAYER                        │
│  check_material_availability · check_worker_availability     │
│  check_permit_status · calculate_duration                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   PERSISTENCE LAYER                          │
│  history.json · load_history() · save_history()             │
│  Structured JSON with project metadata + phase data          │
└─────────────────────────────────────────────────────────────┘
```

**Key Module — `agent_stream()` — AI Agent Core Loop**

The central function responsible for:
- Building a dynamic system prompt based on user-selected tool pills
- Sending messages to the Groq LLM (Llama 3.1 8B Instant)
- Interpreting `finish_reason: tool_calls` responses and executing tools
- Feeding tool results back into the conversation context
- Streaming SSE events to the browser for each tool call and the final response
- Saving the structured result to `history.json` on completion

---

### 2.2 Process Flow (Agent Execution Flow)

```
User submits construction goal
          │
          ▼
POST /plan/stream receives request
          │
          ▼
build_system_prompt(active_pills)
  → Selects which tools to include
  → Defines output format based on pills
          │
          ▼
Initial LLM call (Groq API)
          │
          ▼
┌─────────────────────────────┐
│      AGENT LOOP             │
│                             │
│  LLM Response               │
│       │                     │
│  finish_reason?             │
│       │                     │
│  ┌────┴────┐                │
│  │tool_calls│               │
│  └────┬────┘                │
│       │                     │
│  Execute tool function      │
│  Stream SSE {tool_call}     │
│  Append result to messages  │
│  Re-invoke LLM              │
│       │                     │
│  Repeat up to 16 times      │
│  (4 phases × 4 tools)       │
│                             │
│  finish_reason: stop/length │
│       │                     │
└───────┼─────────────────────┘
        │
        ▼
Stream SSE {type: "final"}
        │
        ▼
Save to history.json
        │
        ▼
Browser renders dashboard
```

**Execution Steps:**

1. User submits a construction goal and selects tool pills
2. Request sent to `POST /plan/stream`
3. `build_system_prompt()` constructs a context-aware prompt based on active pills
4. LLM begins reasoning over the task
5. Agent loop begins — LLM decides: continue reasoning OR trigger tool calls
6. If tool calls generated (up to 16 iterations — 4 phases × 4 tools):
   - Execute tool function
   - Stream `{type: "tool_call"}` SSE event to browser
   - Append result to `messages[]` context
   - Re-invoke LLM with updated state
7. Loop continues until `finish_reason: stop` or `finish_reason: length`
8. Final plan streamed as `{type: "final"}` SSE event
9. Plan saved to `history.json`
10. Browser populates dashboard tabs (Overview, Phases, Schedule, Agent Log)

---

### 2.3 Information Flow (Agent Data Flow)

```
User Input (natural language goal)
          ↓
Frontend UI (index.html / app.js)
  → Collects goal text + active tool pills
  → Sends POST /plan/stream
          ↓
API Layer (FastAPI)
  → Validates request via Pydantic
  → Calls agent_stream(goal, active_pills)
          ↓
Prompt Builder (build_system_prompt)
  → Dynamically constructs system prompt
  → Selects tool definitions to include
          ↓
LLM — Groq (Llama 3.1 8B Instant)
  → Reasons over goal
  → Decides tool call sequence
          ↓
Tool Decision (finish_reason: tool_calls)
          ↓
Tool Execution Layer
  → check_material_availability(phase)
  → check_worker_availability(phase)
  → check_permit_status(phase)
  → calculate_duration(phase)
          ↓
Observation — results appended to messages[]
          ↓
LLM Feedback Loop (re-invoked with updated context)
          ↓
Final Plan (finish_reason: stop)
          ↓
SSE Stream → Browser
  → {type: "tool_call"} — live log entries
  → {type: "final"} — complete plan
          ↓
Persistence — history.json
  → Structured entry with project + phases + plan_markdown
```

**SSE Event Types:**

| Event | When | Payload Fields |
|-------|------|---------------|
| `tool_call` | Each tool execution | `name`, `arg`, `result` |
| `final` | LLM produces complete response | `content`, `id` |
| `error` | Rate limit or exception | `message` |

---

### 2.4 Components Design

**1. FastAPI Server (`main.py`)**
- Exposes all API endpoints
- Serves the frontend SPA via `StaticFiles`
- Handles SSE streaming with `StreamingResponse`
- Manages request lifecycle, history read/write
- Contains `build_system_prompt()`, `get_active_tool_defs()`, `agent_stream()`, `_build_entry()`

**2. AI Agent Loop (`agent_stream`)**

Implements the ReAct (Reason + Act) pattern:
- **Reason** — LLM call via Groq API
- **Act** — Tool invocation based on LLM decision
- **Observe** — Tool result integration into `messages[]`
- **Iterate** — Loop up to 16 times before final response
- **Resilient** — Retries on `tool_use_failed`, handles rate limits, handles token truncation

**3. Tool Layer (`tools/construction_tools.py`)**

Four simulated tool functions representing external data sources:

| Tool | Simulates | Returns |
|------|-----------|---------|
| `check_material_availability(phase)` | Material stock system | Material name + status |
| `check_worker_availability(phase)` | Labor registry | Worker count + sufficiency |
| `check_permit_status(phase)` | Government permit database | Permit type + approval state |
| `calculate_duration(phase)` | Project scheduling system | Duration in days |

All tools use Python's `random` module to simulate responses. In production, these would connect to real APIs or databases.

**4. Frontend (`static/`)**

Three files — no framework, no build step:

| File | Responsibility |
|------|---------------|
| `index.html` | App shell — all DOM elements and IDs |
| `style.css` | All styles — sidebar, chat, dashboard, Gantt, waveform, log panel |
| `app.js` | All logic — SSE handling, markdown rendering, dashboard population, history management |

Key UI components:
- **Home screen** — rotating title, input card, tool pills
- **Chat screen** — user bubble, frequency waveform loading animation, analysis dropdown
- **Result dashboard** — 4 metric cards + 4 tabs (Overview, Phases, Schedule, Agent Log)
- **Right log panel** — 260px fixed panel with live THINK/CALL/OBS/DONE entries
- **Left sidebar** — history list with click-to-load and delete

**5. Persistence Layer**

- Flat JSON file: `static/history.json`
- Read: `load_history()` — returns list, handles missing file
- Write: `save_history()` — overwrites file with updated list
- Cap: 100 entries maximum (oldest dropped automatically)
- Served as a static file by FastAPI (accessible at `/static/history.json`)

---

### 2.5 Key Design Considerations

**1. Agent Scalability**
- Each HTTP request is stateless — no shared state between requests
- Within a request, `messages[]` grows as conversation context across tool iterations
- Tools are pluggable — new tools added to `TOOLS` list and `TOOL_MAP` without changing the loop
- `PILL_TO_TOOLS` mapping allows UI pills to control which tools are active per request

**2. Reliability**
- `finish_reason: length` handled gracefully — partial plan returned rather than error
- `tool_use_failed` errors retried up to 3 times with 2-second backoff
- Rate limit errors (429) caught and surfaced to user with retry timing extracted from error message
- All exceptions caught in `agent_stream()` and yielded as `{type: "error"}` SSE events

**3. Performance**
- Model: `llama-3.1-8b-instant` — optimized for speed, sub-second per tool call loop
- Dynamic prompt construction — deselecting pills removes tool definitions from the API call, reducing input tokens
- 4 phases instead of 6 — reduces tool calls from 24 to 16 per run
- `max_tokens: 2048` — limits output size for faster final response
- SSE streaming — user sees progress immediately, perceived latency is low

**4. Extensibility**
- New tools: add to `TOOLS`, `TOOL_MAP`, `PILL_TO_TOOLS` in `main.py` + new pill in `index.html`
- Prompt extras: `PILL_PROMPT_EXTRAS` dict allows pills to inject instructions without tool calls
- Switch model: change `MODEL` constant in `main.py` — no other changes needed
- Legacy `agents/` folder provides Google ADK multi-agent pattern for future expansion

**5. Maintainability**
- Clear separation: Reasoning (LLM) · Acting (tools/) · State (messages[]) · Persistence (history.json)
- All frontend logic in one file (`app.js`) with clearly named functions
- JSON history is human-readable — debuggable without any database tooling
- `verification.py` provides structural health check independent of API keys

---

### 2.6 API Catalogue

**1. `GET /`**
Serves the frontend single-page application (`index.html`).
- Response: `text/html`

---

**2. `POST /plan/stream`**
Triggers the AI agent execution loop. Streams output via Server-Sent Events.

Request body:
```json
{
  "goal": "Plan a 3-story residential building",
  "tools": ["materials", "labor", "permits", "schedule"]
}
```

SSE stream (one JSON object per line, prefixed with `data: `):
```
data: {"type": "tool_call", "name": "check_material_availability", "arg": "Foundation", "result": "Concrete is Delivered."}
data: {"type": "tool_call", "name": "calculate_duration", "arg": "Foundation", "result": "14 days."}
data: {"type": "final", "content": "## Project Overview\n...", "id": "uuid"}
data: {"type": "error", "message": "Rate limit reached. Please try again in 5m20s."}
```

---

**3. `GET /history`**
Returns all stored plan entries as a JSON array.
- Response: `application/json` — array of history objects

---

**4. `DELETE /history/{id}`**
Removes a specific plan entry by UUID.
- Response: `{"ok": true}`

---

**5. `GET /health`**
System health check.
- Response: `{"status": "active"}`

---

## 3. Data Design

### 3.1 Data Model

All plan data is stored in `static/history.json` as a JSON array. Each entry follows this schema:

```json
{
  "id": "26832b1c-2ab7-4766-a042-4689426ce766",
  "project": {
    "goal": "Plan a 3-story residential building",
    "created_on": "2026-04-11",
    "created_at": "09:26 UTC",
    "total_duration_days": 55,
    "tools_enabled": ["materials", "labor", "permits", "schedule"]
  },
  "phases": {
    "Site Preparation": {
      "material": "Steel — Delayed",
      "labor": "6 workers (Sufficient)",
      "permit": "Structural permit — Pending Review",
      "duration": "7 days",
      "timeline": {
        "start_day": 1,
        "end_day": 7
      }
    },
    "Foundation": { "...": "..." },
    "Framing":    { "...": "..." },
    "Interior Finish": { "...": "..." }
  },
  "plan_markdown": "## Project Overview\n..."
}
```

**Field Reference:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID string | Unique identifier, generated at save time |
| `project.goal` | string | Original user input verbatim |
| `project.created_on` | string | ISO date (YYYY-MM-DD) |
| `project.created_at` | string | UTC time (HH:MM UTC) |
| `project.total_duration_days` | integer | Sum of all phase durations |
| `project.tools_enabled` | string[] | Active pill names at time of generation |
| `phases` | object | Dict keyed by phase name |
| `phases[n].material` | string | Parsed material status e.g. "Concrete — Delivered" |
| `phases[n].labor` | string | Parsed labor status e.g. "6 workers (Sufficient)" |
| `phases[n].permit` | string | Parsed permit status e.g. "Zoning permit — Approved" |
| `phases[n].duration` | string | e.g. "14 days" |
| `phases[n].timeline.start_day` | integer | Sequential start day (Day 1 = project start) |
| `phases[n].timeline.end_day` | integer | Sequential end day |
| `plan_markdown` | string | Full LLM-generated report in markdown format |

---

### 3.2 Data Access Mechanism

Data access is handled by two synchronous utility functions in `main.py`:

```python
def load_history() -> list:
    # Reads history.json, returns [] if file missing or corrupt
    
def save_history(history: list):
    # Overwrites history.json with updated list (indent=2 for readability)
```

- **Read path:** `GET /history` → `load_history()` → return JSON array
- **Write path:** `agent_stream()` completes → `_build_entry()` → `load_history()` → insert at index 0 → `save_history()`
- **Delete path:** `DELETE /history/{id}` → `load_history()` → filter by id → `save_history()`
- **No locking:** Single-user local application — concurrent write safety is not required

---

### 3.3 Data Retention Policies

| Policy | Detail |
|--------|--------|
| Maximum entries | 100 plans (enforced at write time: `history[:100]`) |
| Eviction strategy | Oldest entries dropped (list is newest-first, slice from index 100) |
| Deletion | Manual via `DELETE /history/{id}` API or direct JSON edit |
| Backup | No automated backup — file is in `static/` and served as a static asset |
| Sensitive data | No PII stored — only construction goals and tool results |

---

### 3.4 Data Migration

The history file has evolved through several schema versions during development. The current schema (v3) uses:
- `project` object (vs earlier `meta` object)
- `phases` as a dict with `timeline` sub-object
- `plan_markdown` key (vs earlier `plan` key)

**Backward compatibility:** `loadHistoryItem()` in `app.js` uses optional chaining with fallbacks:
```javascript
const goal = item.project?.goal || item.meta?.goal || item.goal || 'Untitled';
const plan = item.plan_markdown || item.plan || '';
```

**Migration script:** A one-time Python migration was run to restructure existing entries. No automated migration pipeline exists — for schema changes, run a manual Python script against `history.json`.

---

## 4. Interfaces

### 4.1 User Interface

The frontend is a single-page application served at `http://localhost:8080`.

**Home Screen:**
- Rotating title (5 phrases, 3.5s interval, CSS transition)
- Input card with auto-resizing textarea
- Tool pills (Materials, Labor, Permits, Schedule, Budget, Risk) — toggleable
- Model badge showing current LLM

**Result Screen:**
- Topbar with status dot, plan title, "New plan" button
- Thin progress bar (fills as tool calls complete)
- User message bubble (right-aligned)
- Frequency waveform loading animation (canvas-based, dual sine waves)
- Analysis dropdown (7 checkpoints, collapsible)
- 4 metric cards: Phases · Duration · Tool Calls · Readiness %
- 4 tabs: Overview · Phases · Schedule · Agent Log
- Right log panel (260px, live THINK/CALL/OBS/DONE entries)
- Left sidebar: history list with click-to-load and delete

### 4.2 API Interface

RESTful HTTP API with SSE streaming. See Section 2.6 for full catalogue.

### 4.3 LLM Interface

The system communicates with Groq's OpenAI-compatible API:
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Auth: Bearer token via `GROQ_API_KEY` environment variable
- Client: `groq` Python SDK (`AsyncGroq`)
- Tool calling: OpenAI function-calling format (`tools`, `tool_choice: "auto"`)

---

## 5. State and Session Management

### 5.1 Request-Level State

The system is **stateless at the HTTP level**. Each `POST /plan/stream` request is fully independent.

Within a single request, the agent maintains a growing `messages[]` list:

```python
messages = [
    {"role": "system",    "content": system_prompt},
    {"role": "user",      "content": goal},
    # After each LLM call:
    {"role": "assistant", "content": None, "tool_calls": [...]},
    # After each tool execution:
    {"role": "tool",      "tool_call_id": "...", "content": result},
    # ... repeats per tool call
    {"role": "assistant", "content": final_plan}  # final
]
```

This context window grows with each tool call iteration and is discarded when the request completes.

### 5.2 Client-Side State

The browser maintains application state in JavaScript variables:

| Variable | Type | Purpose |
|----------|------|---------|
| `historyData` | array | Cached history from last `/history` fetch |
| `activeHistoryId` | string | Currently displayed plan ID |
| `completedSteps` | Set | Analysis steps marked complete |
| `sidebarOpen` | boolean | History sidebar open/closed state |
| `waveAnimId` | number | Canvas animation frame ID |
| `titleIdx` | number | Current rotating title index |

No cookies, localStorage, or sessionStorage are used. State is lost on page refresh.

### 5.3 No Server-Side Sessions

There is no user authentication, session tokens, or server-side session storage. The application is designed as a single-user local tool.

---

## 6. Caching

### 6.1 Current Caching Strategy

The application has **minimal caching** appropriate for a local single-user tool:

| Layer | Caching |
|-------|---------|
| LLM responses | None — each request generates fresh tool calls and plan |
| History data | In-memory in browser (`historyData` array), refreshed after each plan |
| Static assets | Browser default HTTP caching (no explicit cache headers set) |
| Tool results | None — tools are called fresh each request (intentional — simulates live data) |

### 6.2 SSE Headers

The `/plan/stream` endpoint explicitly disables caching:
```python
headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
```
This ensures SSE events are not buffered by proxies or the browser.

### 6.3 Future Caching Opportunities

For production use, the following could be cached:
- Tool results per phase (Redis TTL cache — avoid redundant API calls)
- LLM responses for identical goals (semantic similarity cache)
- History data (browser localStorage for offline access)

---

## 7. Non-Functional Requirements

### 7.1 Security Aspects

| Concern | Current Approach | Production Recommendation |
|---------|-----------------|--------------------------|
| API Key | Stored in `.env`, loaded via `python-dotenv`, never exposed to frontend | Use secrets manager (AWS Secrets Manager, Vault) |
| Input validation | Pydantic model validates request body type and structure | Add max length validation on `goal` field |
| CORS | Not configured (localhost only) | Configure `CORSMiddleware` for production domains |
| Authentication | None — single-user local tool | Add API key or OAuth for multi-user deployment |
| History file | Served as static file — readable at `/static/history.json` | Move outside `static/` directory for production |
| Prompt injection | System prompt uses f-string with user input | Sanitize user input before prompt construction |
| Rate limiting | Handled by Groq API (100k tokens/day free tier) | Add application-level rate limiting for production |

### 7.2 Performance Aspects

| Metric | Current Value | Notes |
|--------|--------------|-------|
| Model | Llama 3.1 8B Instant | ~0.5–1s per tool call loop on Groq |
| Tool calls per plan | 16 (4 phases × 4 tools) | Reduced from 24 for speed |
| Total plan generation time | ~8–12 seconds | Depends on Groq API latency |
| Max output tokens | 2048 | Limits final response generation time |
| SSE perceived latency | Near-zero | User sees tool calls streaming immediately |
| History file read | Synchronous, O(n) | Acceptable for ≤100 entries |
| Frontend bundle | ~0 KB (no framework) | Pure HTML/CSS/JS, no build step |
| Concurrent requests | Not tested | FastAPI is async — supports concurrent SSE streams |

**Performance Optimizations Applied:**
- Switched from `llama-3.3-70b-versatile` to `llama-3.1-8b-instant` — ~3× faster
- Reduced phases from 6 to 4 — 33% fewer tool calls
- Dynamic prompt construction — inactive pills remove tool definitions from API payload
- `max_tokens: 2048` cap on final response

---

## 8. References

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Groq API Documentation](https://console.groq.com/docs)
- [Groq Model Deprecations](https://console.groq.com/docs/deprecations)
- [Server-Sent Events (SSE) Specification — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Llama 3.1 8B Instant — Groq](https://console.groq.com/docs/models)
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
- [OpenAI Function Calling Format](https://platform.openai.com/docs/guides/function-calling)
- [Pydantic v2 Documentation](https://docs.pydantic.dev/latest/)
- Project README (`README.md`)
