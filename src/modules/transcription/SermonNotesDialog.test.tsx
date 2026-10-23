import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NotesReference } from "@/lib/tauri";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const references: NotesReference[] = [
  { reference: "John 3:16", bookNumber: 43, chapter: 3, verseStart: 16, verseEnd: null, context: "God's love — John 3:16" },
  { reference: "Romans 5:8", bookNumber: 45, chapter: 5, verseStart: 8, verseEnd: null, context: "While we were sinners (Rom 5:8)" },
];

vi.mock("@/lib/tauri", () => ({
  api: {
    findSermonReferences: vi.fn(async () => references),
    readSermonNotes: vi.fn(async () => []),
  },
}));

const { SermonNotesDialog } = await import("@/modules/transcription/SermonNotesDialog");

describe("SermonNotesDialog", () => {
  afterEach(cleanup);

  it("queues the references the operator keeps from pasted notes", async () => {
    const onQueue = vi.fn(async (passages: NotesReference[]) => passages.length);
    const onClose = vi.fn();
    render(<SermonNotesDialog loadedCount={0} onQueue={onQueue} onClear={vi.fn()} onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/paste the notes/), { target: { value: "notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Find references" }));
    expect(await screen.findByText("While we were sinners (Rom 5:8)")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Queue 1 reference" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onQueue).toHaveBeenCalledWith([references[0]]);
  });

  it("says which references the active Bible could not find", async () => {
    render(<SermonNotesDialog loadedCount={0} onQueue={async () => 1} onClear={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/paste the notes/), { target: { value: "notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Find references" }));
    fireEvent.click(await screen.findByRole("button", { name: "Queue 2 references" }));
    expect(await screen.findByText(/1 of 2 queued/)).toBeInTheDocument();
  });

  it("clears notes loaded earlier", () => {
    const onClear = vi.fn();
    render(<SermonNotesDialog loadedCount={5} onQueue={async () => 0} onClear={onClear} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear 5 loaded" }));
    expect(onClear).toHaveBeenCalled();
  });
});
