# Final Project Report

## Construction Planning Assistant Agent

**Subject:** Agentic AI
**Agent Name:** Arch
**Technology:** Python · FastAPI · Groq API · Llama 3.1 8B Instant · Vanilla JS

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Problem Statement & Objectives](#2-problem-statement--objectives)
   - 2.1 Problem Statement
   - 2.2 Project Objectives
   - 2.3 Scope of the Project
3. [Proposed Solution](#3-proposed-solution)
   - 3.1 Key Features
   - 3.2 Overall Architecture / Workflow
   - 3.3 Tools & Technologies Used
4. [Results & Output](#4-results--output)
   - 4.1 Screenshots / Outputs
   - 4.2 Reports
   - 4.3 Key Outcomes
5. [Conclusion](#5-conclusion)
6. [Future Scope & Enhancements](#6-future-scope--enhancements)

---

## 1. Introduction

Artificial Intelligence is rapidly transforming how complex, multi-step planning tasks are handled across industries. In the construction domain, project planning traditionally requires significant manual effort — coordinating materials, labor, permits, and timelines across multiple phases while managing dependencies and resource constraints.

This project presents the **Construction Planning Assistant Agent**, an AI-powered agentic system named **Arch**, built to automate and streamline construction project planning. Arch accepts a high-level natural language goal from the user and autonomously decomposes it into a structured, phase-by-phase execution plan by reasoning over the task, calling specialized tools, observing results, and iterating — all in real time.

The system demonstrates the practical application of **Agentic AI** — specifically the **ReAct (Reason + Act)** pattern — where an LLM does not simply generate text but actively decides which tools to call, interprets their outputs, and uses that information to produce grounded, data-backed plans.

---

## 2. Problem Statement & Objectives

### 2.1 Problem Statement

> **Engineer a sophisticated 'Planner Agent' designed to orchestrate complex construction tasks through a multi-step reasoning loop. Upon receiving a high-level goal (e.g., 'Permit Requirements'), the agent autonomously decomposes the objective into actionable steps, validates resource availability through mock interface tools, and generates a detailed execution schedule. This implementation highlights the agent's ability to handle dependencies and optimize task sequences in a dynamic environment.**

Construction project planning is inherently complex:

- A single project involves multiple interdependent phases (Site Preparation → Foundation → Framing → Interior Finish)
- Each phase requires validation of materials, labor availability, permit status, and duration estimates
- Traditional planning tools require manual data entry and do not reason about dependencies
- Existing AI chatbots generate plans from training data alone — they hallucinate resource availability and timelines without grounding in real data
- There is no existing lightweight, open-source tool that combines LLM reasoning with live tool execution for construction planning

The core challenge is building an agent that:
1. Understands a high-level construction goal
2. Autonomously decides what information to gather
3. Calls the right tools in the right order
4. Uses only tool-returned data (not hallucinated values) in the final plan
5. Presents the result in a structured, professional format

---

### 2.2 Project Objectives

| # | Objective | Status |
|---|-----------|--------|
| 1 | Build an AI agent that decomposes construction goals into phases | ✅ Achieved |
| 2 | Implement a multi-step reasoning loop (ReAct pattern) | ✅ Achieved |
| 3 | Integrate tool-calling for materials, labor, permits, and scheduling | ✅ Achieved |
| 4 | Ensure agent uses only tool-returned data (no hallucination) | ✅ Achieved |
| 5 | Stream agent reasoning and tool execution live to the UI | ✅ Achieved |
| 6 | Build a professional web interface with real-time feedback | ✅ Achieved |
| 7 | Persist all plans with structured phase data for history review | ✅ Achieved |
| 8 | Provide a Gantt chart and phase breakdown dashboard | ✅ Achieved |
| 9 | Document the system with README and HLD | ✅ Achieved |

---

### 2.3 Scope of the Project

**In Scope:**
- Natural language construction goal input
- Autonomous phase decomposition into 4 standard phases: Site Preparation, Foundation, Framing, Interior Finish
- Tool-calling for 4 data points per phase: material availability, labor availability, permit status, phase duration
- Real-time streaming of agent activity via Server-Sent Events
- Web-based chat interface with result dashboard (metrics, phase table, Gantt chart, agent log)
- Persistent plan history with structured JSON storage
- Selectable tool pills allowing users to control which tools the agent uses

**Out of Scope:**
- Real integration with construction management databases or government permit APIs (tools are simulated)
- Multi-user authentication and authorization
- Cost estimation with real market pricing
- Mobile application
- Integration with project management tools (Jira, MS Project)
- Real-time collaboration between multiple planners

---

## 3. Proposed Solution

### 3.1 Key Features

**1. Agentic ReAct Loop**
The core of the system is a multi-step reasoning loop where the LLM autonomously decides which tools to call, executes them, observes the results, and iterates — up to 16 times (4 phases × 4 tools) before generating the final plan. This is not a single prompt-response — it is a genuine agent loop.

**2. Dynamic Tool Selection via Pills**
Users can toggle which tools the agent uses before submitting a goal. Deselecting a pill removes that tool from both the system prompt and the API call, reducing token usage and focusing the output. Six pills are available: Materials, Labor, Permits, Schedule, Budget, Risk.

**3. Real-Time Streaming**
Agent activity streams to the browser via Server-Sent Events. Users see each tool call as it happens — the phase name, tool called, and result — before the final plan is generated. A frequency waveform animation provides visual feedback during processing.

**4. Anti-Hallucination System Prompt**
The system prompt explicitly instructs the agent: *"Use ONLY tool return values — never invent data."* The output format template uses placeholders like `[from check_material_availability]` to reinforce that each field must come from a tool call.

**5. Result Dashboard**
After plan generation, the result screen shows:
- 4 metric cards: Phases count, Total duration days, Tool calls made, Permit readiness %
- 4 tabs: Overview (full markdown plan), Phases (structured table), Schedule (Gantt chart), Agent Log (THINK/CALL/OBS/DONE trace)

**6. Live Agent Log Panel**
A fixed right-side panel streams live log entries as the agent works, color-coded by type: INIT, THINK, MATL, LABR, PRMT, DURN, DONE.

**7. Persistent History**
Every plan is saved to `history.json` with full structured data — project metadata, per-phase tool results with sequential timeline, and the complete markdown plan. History is accessible from the left sidebar with click-to-load and delete.

---

### 3.2 Overall Architecture / Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Frontend)                        │
│                                                             │
│  Home Screen          Result Screen                         │
│  ┌──────────────┐    ┌─────────────────────────────────┐   │
│  │ Rotating     │    │ User Bubble                     │   │
│  │ Title        │    │ Waveform Animation              │   │
│  │ Input Card   │    │ Analysis Dropdown (7 steps)     │   │
│  │ Tool Pills   │    │ Metrics · Tabs · Gantt          │   │
│  └──────────────┘    │ Right Log Panel (live)          │   │
│                      └─────────────────────────────────┘   │
│  Left Sidebar: History List                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ POST /plan/stream (SSE)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Server (main.py)                    │
│                                                             │
│  build_system_prompt(active_pills)                          │
│       ↓                                                     │
│  agent_stream() — ReAct Loop                                │
│       ↓                                                     │
│  Groq API → Llama 3.1 8B Instant                           │
│       ↓                                                     │
│  finish_reason: tool_calls                                  │
│       ↓                                                     │
│  Execute tool → stream SSE → append to messages[]          │
│       ↓ (repeat up to 16×)                                  │
│  finish_reason: stop → stream final → save history         │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼                ▼
  check_material   check_worker    check_permit    calculate
  _availability    _availability    _status         _duration
```

**Agent Execution Workflow:**

```
Step 1: User types goal + selects tool pills → Submit
Step 2: POST /plan/stream → build_system_prompt()
Step 3: LLM receives prompt → decides tool call sequence
Step 4: For each phase (4 phases):
          → call check_material_availability(phase)  → stream SSE
          → call check_worker_availability(phase)    → stream SSE
          → call check_permit_status(phase)          → stream SSE
          → call calculate_duration(phase)           → stream SSE
Step 5: LLM receives all 16 tool results → generates final plan
Step 6: Stream {type: "final"} → save to history.json
Step 7: Browser renders dashboard (metrics + tabs + Gantt + log)
```

---

### 3.3 Tools & Technologies Used

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Language | Python | 3.11 | Backend runtime |
| Web Framework | FastAPI | 0.135.3 | API server + SSE streaming |
| ASGI Server | Uvicorn | 0.44.0 | Production-grade async server |
| LLM Provider | Groq API | — | Ultra-fast LLM inference |
| LLM Model | Llama 3.1 8B Instant | — | Agent reasoning + tool calling |
| LLM Client | groq (Python SDK) | 1.1.2 | Async API calls |
| Data Validation | Pydantic | 2.12.5 | Request/response validation |
| Environment | python-dotenv | 1.2.2 | API key management |
| Frontend | HTML + CSS + JS | — | No framework, no build step |
| Streaming | Server-Sent Events | — | Real-time browser updates |
| Storage | JSON flat file | — | Plan history persistence |
| Agent Pattern | ReAct (custom) | — | Reason + Act + Observe loop |
| Legacy Framework | Google ADK | 1.29.0 | Original multi-agent prototype |

**Why Groq over OpenAI/Anthropic?**
Groq's LPU (Language Processing Unit) hardware delivers significantly faster inference than GPU-based providers. `llama-3.1-8b-instant` on Groq achieves sub-second per tool call loop, making the 16-iteration agent loop complete in ~8–12 seconds total — fast enough for interactive use.

**Why no LangChain/CrewAI?**
The original prototype used Google ADK (preserved in `agents/`). The production implementation uses a custom ReAct loop directly against the Groq API. This decision was made because:
- LangChain/CrewAI added significant overhead and compatibility issues with Groq's tool-calling format
- The custom loop is simpler, more debuggable, and fully controllable
- The ReAct pattern is straightforward to implement directly for this use case

---

## 4. Results & Output

### 4.1 Screenshots / Outputs

**Home Screen**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│           Plan your build.                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Describe your construction project...       │   │
│  │                                    Llama 8B │ ↑ │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [📦 Materials] [👷 Labor] [📄 Permits]             │
│  [📅 Schedule]  [💰 Budget] [⚠ Risk]               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Result Screen — Metrics + Tabs**
```
● Plan complete                              [New plan]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ PHASES   │ │ DURATION │ │ TOOL     │ │ READINESS│
│    4     │ │   55     │ │ CALLS    │ │   75%    │
│ phases   │ │ total    │ │   16     │ │ permits  │
│          │ │ days     │ │ actions  │ │ approved │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

[Overview] [Phases] [Schedule] [Agent Log]
```

**Phases Tab — Sample Output**
```
# | Phase            | Start  | End    | Duration | Material          | Labor              | Permit
1 | Site Preparation | Day 1  | Day 7  | 7 days   | Lumber — Delivered| 6 workers (Suff.)  | Safety — Approved
2 | Foundation       | Day 8  | Day 21 | 14 days  | Steel — On Order  | 0 workers (Short.) | Structural — Pending
3 | Framing          | Day 22 | Day 42 | 21 days  | Concrete — In Stock| 8 workers (Suff.) | Zoning — Approved
4 | Interior Finish  | Day 43 | Day 55 | 13 days  | Drywall — Delayed | 3 workers (Short.) | Utility — Approved
```

**Schedule Tab — Gantt Chart**
```
Day 7    Day 18   Day 28   Day 37   Day 46   Day 55
  |        |        |        |        |        |
Site Prep  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  7d
Foundation ░░░░████████████░░░░░░░░░░░░░░░░░░░░░  14d
Framing    ░░░░░░░░░░░░░░░░████████████████░░░░░  21d
Int. Finish░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█████  13d
```

**Agent Log Panel — Live Execution Trace**
```
> AGENT LOG
INIT  Goal received — initializing Arch agent
THINK Decomposing into 4 construction phases
MATL  Site Preparation → Lumber — Delivered
LABR  Site Preparation → 6 workers (Sufficient)
PRMT  Site Preparation → Safety permit — Approved
DURN  Site Preparation → 7 days
MATL  Foundation → Steel — On Order
LABR  Foundation → 0 workers (Shortage)
PRMT  Foundation → Structural permit — Pending Review
DURN  Foundation → 14 days
...
DONE  Plan finalized — all tool calls complete
```

---

### 4.2 Reports

**Sample Generated Plan (Overview Tab)**

```markdown
## Project Overview
The project involves constructing a 3-story residential building with 4 bedrooms,
designed for a family of 6. The construction will proceed through 4 phases with
careful attention to material procurement and permit compliance.

## Construction Phases

### Site Preparation
- **Materials:** Lumber — Delivered
- **Workers:** 6 workers (Sufficient)
- **Permit:** Safety permit — Approved
- **Duration:** 7 days

The site preparation phase involves clearing the land and establishing the
construction perimeter. With lumber delivered and sufficient workers available,
this phase can proceed immediately. The approved safety permit removes any
compliance risk for this phase.

### Foundation
- **Materials:** Steel — On Order
- **Workers:** 0 workers (Shortage)
- **Permit:** Structural permit — Pending Review
- **Duration:** 14 days

The foundation phase presents two significant risks: steel materials are on order
(not yet delivered) and there is a critical worker shortage. The structural permit
is also pending review. It is recommended to resolve the worker shortage and
expedite material delivery before commencing this phase.

[... continues for Framing and Interior Finish ...]

## Execution Schedule

| # | Phase            | Duration | Start  | End    | Status  |
|---|------------------|----------|--------|--------|---------|
| 1 | Site Preparation | 7 days   | Day 1  | Day 7  | Pending |
| 2 | Foundation       | 14 days  | Day 8  | Day 21 | Pending |
| 3 | Framing          | 21 days  | Day 22 | Day 42 | Pending |
| 4 | Interior Finish  | 13 days  | Day 43 | Day 55 | Pending |

**Total Project Duration: 55 days**
```

**History JSON Entry (Structured Data)**

```json
{
  "id": "26832b1c-2ab7-4766-a042-4689426ce766",
  "project": {
    "goal": "Plan a 3-story residential building",
    "created_on": "2026-04-15",
    "created_at": "09:26 UTC",
    "total_duration_days": 55,
    "tools_enabled": ["materials", "labor", "permits", "schedule"]
  },
  "phases": {
    "Site Preparation": {
      "material": "Lumber — Delivered",
      "labor": "6 workers (Sufficient)",
      "permit": "Safety permit — Approved",
      "duration": "7 days",
      "timeline": { "start_day": 1, "end_day": 7 }
    },
    "Foundation": {
      "material": "Steel — On Order",
      "labor": "0 workers (Shortage)",
      "permit": "Structural permit — Pending Review",
      "duration": "14 days",
      "timeline": { "start_day": 8, "end_day": 21 }
    }
  },
  "plan_markdown": "## Project Overview\n..."
}
```

---

### 4.3 Key Outcomes

| Outcome | Detail |
|---------|--------|
| Agent loop implemented | ReAct pattern with up to 16 tool call iterations per plan |
| Zero hallucination | System prompt enforces tool-only data; verified across 8 test plans |
| Response time | ~8–12 seconds for a complete 4-phase plan with 16 tool calls (4 tools × 4 phases = 16 Groq API round trips) |
| Token efficiency | ~1,500–2,000 tokens per plan (dynamic prompt reduces unused tool definitions) |
| History entries | 8 plans stored across multiple sessions, all with consistent schema |
| UI completeness | Home screen, chat screen, 4-tab dashboard, Gantt chart, live log panel |
| Documentation | README (453 lines) + HLD (666 lines) covering all design aspects |
| Code quality | All Python files pass syntax check; clean separation of concerns |

---

## 5. Conclusion

The Construction Planning Assistant Agent successfully demonstrates the practical application of Agentic AI to a real-world domain problem. The system goes beyond a simple chatbot by implementing a genuine multi-step reasoning loop where the agent:

1. **Reasons** about the construction goal and decides which tools to call
2. **Acts** by executing tool functions that return real (simulated) data
3. **Observes** the results and incorporates them into its context
4. **Iterates** this cycle 16 times before producing a grounded, data-backed plan

The key technical achievement is the **anti-hallucination architecture** — by combining a strict system prompt with mandatory tool calls, the agent is constrained to report only what the tools return. This is a fundamental property of reliable agentic systems that distinguishes them from standard LLM text generation.

The project also demonstrates that a sophisticated agentic system does not require heavyweight frameworks like LangChain or CrewAI. A custom ReAct loop built directly against the Groq API is simpler, faster, more debuggable, and fully controllable — while achieving the same agentic behavior.

The web interface brings the agent's reasoning process to life — users can watch the agent work in real time through the waveform animation, analysis dropdown, and live log panel, making the agentic behavior visible and understandable rather than a black box.

---

## 6. Future Scope & Enhancements

### 6.1 Real Tool Integration
Replace the simulated `random`-based tools with actual API integrations:
- **Materials:** Connect to supplier inventory APIs (e.g., Home Depot, Grainger)
- **Labor:** Integrate with workforce management platforms
- **Permits:** Connect to municipal permit tracking systems
- **Duration:** Use historical project data and ML models for accurate estimates

### 6.2 Multi-Agent Architecture
Expand to a true multi-agent system using the existing `agents/` folder as a foundation:
- **Planner Agent** — decomposes goals into phases
- **Resource Validator Agent** — checks materials, labor, permits in parallel
- **Scheduler Agent** — optimizes phase sequencing using Critical Path Method (CPM)
- **Risk Analyst Agent** — identifies and quantifies project risks

### 6.3 Cost Estimation
Add a real cost estimation tool that calculates:
- Labor costs based on worker count × daily rate × duration
- Material costs from supplier price APIs
- Permit fees from municipal fee schedules
- Contingency buffer (typically 10–15%)

### 6.4 Enhanced Scheduling
Replace the simple sequential schedule with Critical Path Method (CPM):
- Identify task dependencies (Foundation cannot start before Site Prep completes)
- Calculate float/slack for non-critical tasks
- Identify the critical path and highlight it in the Gantt chart
- Support parallel task execution where dependencies allow

### 6.5 Production Deployment
- Add user authentication (OAuth / API key)
- Move from JSON flat file to PostgreSQL for multi-user history
- Deploy on cloud infrastructure (AWS/GCP) with proper secrets management
- Add rate limiting and request queuing for concurrent users
- Implement WebSocket for more efficient bidirectional streaming

### 6.6 Export & Reporting
- Export plans as PDF reports with professional formatting
- Export Gantt chart as PNG/SVG
- Generate CSV export of phase data for import into MS Project or Primavera P6
- Email plan summary to stakeholders

### 6.7 Conversational Follow-up
Enable multi-turn conversation — after the initial plan is generated, allow the user to ask follow-up questions:
- "What happens if the Foundation permit is delayed by 2 weeks?"
- "Can we reduce the Framing duration by adding more workers?"
- "What is the impact of the material shortage on the overall timeline?"

---

*End of Report*
