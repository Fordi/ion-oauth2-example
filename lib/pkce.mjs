import { sha256 } from "./sha265.mjs";

/**
 * Dead-simple in-memory store for OAuth state/code_verifier pairs with 1 minute expiration
 * Not for production use.
 */
const MAX_AGE = 60000;
const states = new Map();
function tidyStates() {
  const now = Date.now();
  // Clean up entries in the store older than MAX_AGE
  for (const oldState of states.keys())
    if (now - (states.get(oldState)?.[1] ?? 0) > MAX_AGE)
      states.delete(oldState);
  return states;
}

export function getVerifier(state) {
  const record = tidyStates().get(state);
  states.delete(state);
  return record?.[0];
};

export async function newPkceState() {
  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID();
  tidyStates().set(state, [verifier, Date.now()]);
  return [
    state,
    // Calculate and return the challenge
    await sha256(verifier),
  ];
}