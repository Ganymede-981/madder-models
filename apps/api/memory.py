from langgraph.checkpoint.memory import MemorySaver

# Global in-memory checkpointer storing conversational threads and SDF states
memory_saver = MemorySaver()

def get_checkpointer():
    """Returns the active LangGraph checkpointer for conversation memory."""
    return memory_saver
