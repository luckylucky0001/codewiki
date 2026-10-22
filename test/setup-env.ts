// Global test environment: the LLM facts fallback of `kb compound` is on by default, so tests must never reach a
// real agent. Every spawned kb inherits KB_LLM_FACTS=0; test/llmfacts.test.ts re-enables it with a fake agent.
process.env.KB_LLM_FACTS = '0';
