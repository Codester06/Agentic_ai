from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from tools.construction_tools import (
    check_material_availability,
    check_worker_availability,
    check_permit_status,
    calculate_duration
)

GROQ_MODEL = LiteLlm(model="groq/llama-3.3-70b-versatile")

def get_orchestrator_agent():
    return Agent(
        name="Arch",
        model=GROQ_MODEL,
        instruction=(
            "You are the Lead Construction Orchestrator. Your goal is to receive a high-level "
            "construction request from the user and deliver a comprehensive, structured "
            "Execution Plan.\n\n"
            "Follow these steps:\n"
            "1. Decompose the goal into logical construction phases "
            "(e.g., Site Prep, Foundation, Framing, MEP, Interior Finish, Inspection).\n"
            "2. For each phase, call check_material_availability, check_worker_availability, "
            "and check_permit_status to gather resource and compliance data.\n"
            "3. For each phase, call calculate_duration to estimate the timeline.\n"
            "4. Merge everything into a final structured report containing:\n"
            "   - Goal Summary\n"
            "   - Construction Phases\n"
            "   - Resource and Permit Status per phase\n"
            "   - Sequenced Execution Schedule with start/end days\n\n"
            "Work through all phases before writing the final report."
        ),
        tools=[
            check_material_availability,
            check_worker_availability,
            check_permit_status,
            calculate_duration
        ]
    )
