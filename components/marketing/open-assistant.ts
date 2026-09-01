export const OPEN_ASSISTANT_EVENT = "solvio:open-assistant";

export function openSolvioAssistant() {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT));
}
