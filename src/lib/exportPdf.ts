import type { ServicePlanDetail } from "@/lib/tauri";

export function exportServicePlanPdf(plan: ServicePlanDetail) {
  const html = `<!DOCTYPE html>
<html><head><title>${plan.title}</title>
<style>
  body { font-family: Georgia, serif; padding: 40px; color: #111; }
  h1 { margin-bottom: 4px; }
  .meta { color: #555; margin-bottom: 24px; }
  .item { border-bottom: 1px solid #ddd; padding: 12px 0; }
  .type { font-size: 11px; text-transform: uppercase; color: #666; }
</style></head><body>
  <h1>${plan.title}</h1>
  <p class="meta">${plan.service_date ?? "No date"} · ${plan.items.length} items</p>
  ${plan.notes ? `<p><strong>Notes:</strong> ${plan.notes}</p>` : ""}
  ${plan.items
    .map(
      (item) => `
    <div class="item">
      <div class="type">${item.item_type}</div>
      <strong>${item.title}</strong>
    </div>`,
    )
    .join("")}
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
