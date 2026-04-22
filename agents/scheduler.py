from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from tools.construction_tools import calculate_duration

GROQ_MODEL = LiteLlm(model="groq/llama-3.3-70b-versatile")

def get_scheduler_agent():
    return Agent(
        name="SchedulerAgent",
        model=GROQ_MODEL,
        instruction=(
            "You are a project manager specializing in scheduling. Your goal is to "
            "generate a sequenced execution timeline for construction phases. "
            "Consider task dependencies (e.g., foundation must come before framing). "
            "Use the tools to estimate durations and output a structured day-wise "
            "plan for project completion."
        ),
        tools=[calculate_duration]
    )
