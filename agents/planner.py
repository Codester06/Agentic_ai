from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm

GROQ_MODEL = LiteLlm(model="groq/llama-3.3-70b-versatile")

def get_planner_agent():
    return Agent(
        name="PlannerAgent",
        model=GROQ_MODEL,
        instruction=(
            "You are a construction planning expert. Your job is to break down high-level "
            "construction goals into ordered, logical phases. For each goal, provide a "
            "list of specific phases required to complete it (e.g., 'Site Prep', 'Foundation', "
            "'Framing', 'Inspection'). Be concise but thorough."
        )
    )
