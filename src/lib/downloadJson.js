// Shared by Settings.jsx (data backup, feedback-report export) and
// Progress.jsx (Tajweed analytics summary, Phase 6) -- one download
// mechanism, not duplicated per page.
export function downloadJson(payload, baseName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
