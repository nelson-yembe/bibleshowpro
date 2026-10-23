import { useState } from "react";
import type { OpenBibleMeta, OpenBiblePreview } from "@/lib/tauri";

const fieldClass =
  "h-8 w-full rounded-md border border-[var(--color-border-light)] bg-[var(--color-surface)] px-2 text-xs";
const labelClass = "mb-1 block text-[10px] uppercase tracking-wide text-[var(--color-subtle)]";

/**
 * What a Bible file holds, shown before anything is written, with the listing details
 * the operator can correct: files often carry long titles or no abbreviation at all.
 */
export function OpenBibleImportForm({
  preview,
  fileCount,
  importing,
  onImport,
  onCancel,
}: {
  preview: OpenBiblePreview;
  fileCount: number;
  importing: boolean;
  onImport: (meta: OpenBibleMeta) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(preview.name);
  const [abbreviation, setAbbreviation] = useState(preview.abbreviation);
  const [language, setLanguage] = useState(preview.language);
  const [copyright, setCopyright] = useState(preview.copyright ?? "");
  const ready = name.trim() && /[a-z0-9]/i.test(abbreviation);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--color-border-light)] bg-[var(--color-surface)] p-3">
      <p className="text-[11px] text-[var(--color-foreground)]">
        {preview.format}
        {fileCount > 1 ? ` · ${fileCount} files` : ""} · {preview.bookCount} books ·{" "}
        {preview.verseCount.toLocaleString()} verses
      </p>
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-[10px] text-amber-400">
          {warning}
        </p>
      ))}
      <div className="grid grid-cols-[1fr_120px_110px] gap-2">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Abbreviation</span>
          <input value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass}>
            {!["en", "fr", "es", "pt", "de"].includes(language) && <option value={language}>{language}</option>}
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Copyright</span>
        <input
          value={copyright}
          onChange={(e) => setCopyright(e.target.value)}
          placeholder="Shown with the verse where the license requires it"
          className={fieldClass}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="control-btn text-xs">
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready || importing}
          onClick={() => onImport({ name: name.trim(), abbreviation: abbreviation.trim(), language, copyright: copyright.trim() || null })}
          className="control-btn-primary text-xs"
        >
          {importing ? "Importing…" : `Import ${abbreviation.trim() || "Bible"}`}
        </button>
      </div>
    </div>
  );
}
