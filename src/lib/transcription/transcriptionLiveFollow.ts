import { usePresentationStore } from "@/stores/presentationStore";

/** True when transcription content is currently on program output. */
export function isTranscriptionOnAir(): boolean {
  const { program, liveFollow, previewSource } = usePresentationStore.getState();
  if (!liveFollow || previewSource !== "transcription") return false;
  if (!program || program.type === "blackout") return false;
  return true;
}
