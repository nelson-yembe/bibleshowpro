import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OpenBibleImportForm } from "@/modules/settings/OpenBibleImportForm";
import type { OpenBiblePreview } from "@/lib/tauri";

const preview: OpenBiblePreview = {
  format: "Bible XML",
  name: "The Holy Bible, New International Version®",
  abbreviation: "NIV",
  language: "en",
  copyright: null,
  bookCount: 27,
  verseCount: 7957,
  warnings: ["New Testament only: 27 of 27 books."],
};

describe("OpenBibleImportForm", () => {
  afterEach(cleanup);

  it("shows what the file holds before anything is imported", () => {
    render(<OpenBibleImportForm preview={preview} fileCount={1} importing={false} onImport={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Bible XML · 27 books · 7,957 verses/)).toBeInTheDocument();
    expect(screen.getByText(/New Testament only/)).toBeInTheDocument();
  });

  it("imports with the details the operator corrected", () => {
    const onImport = vi.fn();
    render(<OpenBibleImportForm preview={preview} fileCount={1} importing={false} onImport={onImport} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue(preview.name), { target: { value: "New International Version" } });
    fireEvent.click(screen.getByRole("button", { name: "Import NIV" }));
    expect(onImport).toHaveBeenCalledWith({
      name: "New International Version",
      abbreviation: "NIV",
      language: "en",
      copyright: null,
    });
  });

  it("will not import without an abbreviation", () => {
    render(<OpenBibleImportForm preview={preview} fileCount={1} importing={false} onImport={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("NIV"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: /^Import/ })).toBeDisabled();
  });
});
