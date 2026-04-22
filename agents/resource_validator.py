from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from tools.construction_tools import check_material_availability, check_worker_availability, check_permit_status

GROQ_MODEL = LiteLlm(model="groq/llama-3.3-70b-versatile")

def get_resource_validator_agent():
    return Agent(
        name="ResourceValidatorAgent",
        model=GROQ_MODEL,
        instruction=(
            "You are a logistics and compliance specialist for construction projects. "
            "Your role is to check the status of materials, labor, and permits for "
            "specific construction phases. Use the provided tools to gather data "
            "and summarize the availability and readiness for each phase."
        ),
        tools=[check_material_availability, check_worker_availability, check_permit_status]
    )
