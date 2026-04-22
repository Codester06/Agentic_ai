import asyncio
import os
from agents.orchestrator import get_orchestrator_agent
from google.adk import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types
import uuid

async def test_initialization():
    print("Testing Agent and Runner initialization...")
    try:
        orchestrator = get_orchestrator_agent()
        print("✓ Orchestrator (Arch) initialized successfully.")
        
        session_service = InMemorySessionService()
        print("✓ SessionService initialized successfully.")
        
        app_name = "TestApp"
        user_id = "test_user"
        session_id = str(uuid.uuid4())
        
        await session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id
        )
        print("✓ Session created successfully.")
        
        runner = Runner(
            app_name=app_name,
            agent=orchestrator,
            session_service=session_service
        )
        print("✓ Runner initialized successfully.")
        
        print("\nAll structural checks passed!")
    except Exception as e:
        print(f"\n❌ Initialization failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_initialization())
