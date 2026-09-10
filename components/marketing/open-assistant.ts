export const OPEN_ASSISTANT_EVENT = "solvio:open-assistant";
export const OPEN_HUMAN_HANDOFF_EVENT = "solvio:open-human-handoff";

export function openSolvioAssistant() {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT));
}

export function openSolvioHumanHandoff() {
  window.dispatchEvent(new CustomEvent(OPEN_HUMAN_HANDOFF_EVENT));
}
