import os
import json
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import AsyncGroq
from tools.construction_tools import (
    check_material_availability,
    check_worker_availability,
    check_permit_status,
    calculate_duration
)
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Construction Planning Assistant")
client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"
HISTORY_FILE = "static/history.json"


def load_history() -> list:
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def save_history(history: list):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_material_availability",
            "description": "Checks if construction materials are available for a given phase.",
            "parameters": {
                "type": "object",
                "properties": {"phase_name": {"type": "string"}},
                "required": ["phase_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_worker_availability",
            "description": "Checks worker availability for a given phase.",
            "parameters": {
                "type": "object",
                "properties": {"phase_name": {"type": "string"}},
                "required": ["phase_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_permit_status",
            "description": "Checks permit status for a given construction phase.",
            "parameters": {
                "type": "object",
                "properties": {"phase_name": {"type": "string"}},
                "required": ["phase_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_duration",
            "description": "Estimates duration in days for a construction phase.",
            "parameters": {
                "type": "object",
                "properties": {"phase_name": {"type": "string"}},
                "required": ["phase_name"]
            }
        }
    }
]

TOOL_MAP = {
    "check_material_availability": check_material_availability,
    "check_worker_availability": check_worker_availability,
    "check_permit_status": check_permit_status,
    "calculate_duration": calculate_duration
}

# Maps pill names (from UI) to tool function names
PILL_TO_TOOLS = {
    "materials": ["check_material_availability"],
    "labor":     ["check_worker_availability"],
    "permits":   ["check_permit_status"],
    "schedule":  ["calculate_duration"],
    # budget and risk have no dedicated tools yet — they influence the prompt only
    "budget":    [],
    "risk":      [],
}

# What each pill adds to the system prompt when active
PILL_PROMPT_EXTRAS = {
    "budget":  "- Include a rough budget estimate section based on phase complexity and duration.",
    "risk":    "- Include a Risk Summary section listing risks evident from tool data only.",
}


def build_system_prompt(active_pills: list[str]) -> str:
    tools_str = ", ".join([
        t for t, p in [
            ("check_material_availability", "materials"),
            ("check_worker_availability", "labor"),
            ("check_permit_status", "permits"),
            ("calculate_duration", "schedule"),
        ] if p in active_pills
    ]) or "none"

    phase_fields = "\n".join(filter(None, [
        "- **Materials:** [from check_material_availability]" if "materials" in active_pills else "",
        "- **Workers:** [from check_worker_availability]" if "labor" in active_pills else "",
        "- **Permit:** [from check_permit_status]" if "permits" in active_pills else "",
        "- **Duration:** [from calculate_duration]" if "schedule" in active_pills else "",
    ])) or "- (no tools selected)"

    schedule = """
## Execution Schedule

Present the schedule as a simple table. Calculate start and end days sequentially (phase 2 starts the day after phase 1 ends, etc.). Start from Day 1.

| # | Phase | Duration | Start | End | Status |
|---|-------|----------|-------|-----|--------|

After the table, add a single line: **Total Project Duration: X days** (sum of all durations).
Keep it clean — no extra columns, no footnotes.
""" if "schedule" in active_pills else ""
    extras = "\n".join(filter(None, [
        "Include a budget estimate section." if "budget" in active_pills else "",
        "Include a risk summary from tool data only." if "risk" in active_pills else "",
    ]))

    return f"""You are Arch, a professional construction project manager. Use ONLY tool return values — never invent data.
Tools available: {tools_str}
Phases to cover: Site Preparation, Foundation, Framing, Interior Finish.
Call ONE tool at a time. After collecting all results, write a detailed professional report.

Report requirements:
- Write 3-5 sentences per phase explaining the work involved, resource status, and any concerns
- Be specific and professional — this is a real project document
- Use exact values returned by tools, but explain them in context
- The schedule table must include all 6 phases with calculated sequential days

Output format (markdown):
## Project Overview
2-3 sentences describing the full project scope and approach.

## Construction Phases

### [Phase Name]
{phase_fields}
Write 3-4 sentences describing this phase in detail — what work is done, what the resource/permit status means for the project, and any recommendations.

(repeat for all 6 phases)
{schedule}{extras}"""


def get_active_tool_defs(active_pills: list[str]) -> list:
    active_fn_names = set()
    for pill in active_pills:
        active_fn_names.update(PILL_TO_TOOLS.get(pill, []))
    return [t for t in TOOLS if t["function"]["name"] in active_fn_names]


class ConstructionGoal(BaseModel):
    goal: str
    tools: list[str] = ["materials", "labor", "permits", "schedule"]


def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def agent_stream(goal: str, active_pills: list[str]):
    system_prompt = build_system_prompt(active_pills)
    active_tool_defs = get_active_tool_defs(active_pills)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": goal}
    ]

    call_kwargs = {"model": MODEL, "messages": messages, "max_tokens": 2048}
    if active_tool_defs:
        call_kwargs["tools"] = active_tool_defs
        call_kwargs["tool_choice"] = "auto"

    tool_calls_log = []
    import asyncio

    try:
        while True:
            response = None
            for attempt in range(3):
                try:
                    response = await client.chat.completions.create(**call_kwargs)
                    break
                except Exception as e:
                    err = str(e)
                    if "rate_limit_exceeded" in err or "429" in err:
                        import re
                        m = re.search(r'try again in (\d+m[\d.]+s)', err)
                        wait = m.group(1) if m else "a few minutes"
                        yield sse({"type": "error", "message": f"Rate limit reached. Please try again in {wait}."})
                        return
                    if attempt < 2 and ("tool_use_failed" in err or "failed_generation" in err):
                        await asyncio.sleep(2)
                        continue
                    raise
            if response is None:
                raise RuntimeError("Max retries exceeded")

            msg = response.choices[0].message
            finish_reason = response.choices[0].finish_reason
            print(f"[Arch] loop finish={finish_reason} tools={len(msg.tool_calls) if msg.tool_calls else 0} content={len(msg.content or '')}chars")

            # Treat truncated response as final too — send whatever we have
            if finish_reason == "length":
                final_content = (msg.content or "") + "\n\n*(Response truncated)*"

                import re as _re
                def _parse(raw):
                    raw = raw.strip().rstrip('.')
                    m = _re.search(r'(\d+)\s+workers available\.\s*Status:\s*(\w+)', raw)
                    if m: return f"{m.group(1)} workers ({m.group(2)})"
                    m = _re.search(r':\s*(.+?)\s+is\s+(.+)$', raw)
                    if m: return f"{m.group(1).strip()} — {m.group(2).strip()}"
                    m = _re.search(r'duration.*?:\s*(.+)$', raw, _re.IGNORECASE)
                    if m: return m.group(1).strip()
                    m = _re.search(r':\s*(.+)$', raw)
                    return m.group(1).strip() if m else raw

                phases: dict = {}
                day_cursor = 1
                total_days = 0
                for tc in tool_calls_log:
                    phase = tc.get("arg", "Unknown")
                    if phase not in phases:
                        phases[phase] = {}
                    key_map = {"check_material_availability":"material","check_worker_availability":"labor","check_permit_status":"permit","calculate_duration":"duration"}
                    key = key_map.get(tc["name"], tc["name"])
                    phases[phase][key] = _parse(tc.get("result",""))

                phases_final = {}
                for phase, checks in phases.items():
                    dur_match = _re.search(r'(\d+)', checks.get("duration","0"))
                    dur_days = int(dur_match.group(1)) if dur_match else 0
                    total_days += dur_days
                    phases_final[phase] = {**checks, "timeline": {"start_day": day_cursor, "end_day": day_cursor + dur_days - 1}}
                    day_cursor += dur_days

                now = datetime.utcnow()
                entry = {
                    "id": str(uuid.uuid4()),
                    "project": {
                        "goal": goal,
                        "created_on": now.strftime("%Y-%m-%d"),
                        "created_at": now.strftime("%H:%M UTC"),
                        "total_duration_days": total_days,
                        "tools_enabled": active_pills
                    },
                    "phases": phases_final,
                    "plan_markdown": final_content
                }
                history = load_history()
                history.insert(0, entry)
                save_history(history[:100])
                yield sse({"type": "final", "content": final_content, "id": entry["id"]})
                break

            msg = response.choices[0].message
            finish_reason = response.choices[0].finish_reason
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": msg.tool_calls
            })
            call_kwargs["messages"] = messages

            if finish_reason == "tool_calls" and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    fn_name = tool_call.function.name
                    fn_args = json.loads(tool_call.function.arguments)

                    if fn_name not in TOOL_MAP:
                        continue

                    result = TOOL_MAP[fn_name](**fn_args)
                    tool_calls_log.append({"name": fn_name, "arg": fn_args.get("phase_name", ""), "result": result})

                    yield sse({
                        "type": "tool_call",
                        "name": fn_name,
                        "arg": fn_args.get("phase_name", ""),
                        "result": result
                    })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result
                    })
            else:
                final_content = msg.content or ""

                # Build clean structured phase data
                import re as _re
                def _parse(raw):
                    raw = raw.strip().rstrip('.')
                    m = _re.search(r'(\d+)\s+workers available\.\s*Status:\s*(\w+)', raw)
                    if m: return f"{m.group(1)} workers ({m.group(2)})"
                    m = _re.search(r':\s*(.+?)\s+is\s+(.+)$', raw)
                    if m: return f"{m.group(1).strip()} — {m.group(2).strip()}"
                    m = _re.search(r'duration.*?:\s*(.+)$', raw, _re.IGNORECASE)
                    if m: return m.group(1).strip()
                    m = _re.search(r':\s*(.+)$', raw)
                    return m.group(1).strip() if m else raw

                phases: dict = {}
                day_cursor = 1
                total_days = 0
                for tc in tool_calls_log:
                    phase = tc.get("arg", "Unknown")
                    if phase not in phases:
                        phases[phase] = {}
                    key_map = {"check_material_availability":"material","check_worker_availability":"labor","check_permit_status":"permit","calculate_duration":"duration"}
                    key = key_map.get(tc["name"], tc["name"])
                    phases[phase][key] = _parse(tc.get("result",""))

                phases_final = {}
                for phase, checks in phases.items():
                    dur_match = _re.search(r'(\d+)', checks.get("duration","0"))
                    dur_days = int(dur_match.group(1)) if dur_match else 0
                    total_days += dur_days
                    phases_final[phase] = {**checks, "timeline": {"start_day": day_cursor, "end_day": day_cursor + dur_days - 1}}
                    day_cursor += dur_days

                now = datetime.utcnow()
                entry = {
                    "id": str(uuid.uuid4()),
                    "project": {
                        "goal": goal,
                        "created_on": now.strftime("%Y-%m-%d"),
                        "created_at": now.strftime("%H:%M UTC"),
                        "total_duration_days": total_days,
                        "tools_enabled": active_pills
                    },
                    "phases": phases_final,
                    "plan_markdown": final_content
                }
                history = load_history()
                history.insert(0, entry)
                save_history(history[:100])
                yield sse({"type": "final", "content": final_content, "id": entry["id"]})
                break

    except Exception as e:
        yield sse({"type": "error", "message": str(e)})


# Serve UI
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.post("/plan/stream")
async def plan_stream(request: ConstructionGoal):
    return StreamingResponse(
        agent_stream(request.goal, request.tools),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@app.get("/history")
def get_history():
    return load_history()

@app.delete("/history/{item_id}")
def delete_history_item(item_id: str):
    history = load_history()
    history = [h for h in history if h["id"] != item_id]
    save_history(history)
    return {"ok": True}

@app.get("/health")
def health_check():
    return {"status": "active"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8080)))
