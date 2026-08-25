/** Trigger a browser download for an authenticated fetch URL (e.g. SBD PDFs). */
export async function downloadAuthenticatedFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => (j as { detail?: string }).detail)
      .catch(() => null);
    throw new Error(detail || "Download failed");
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
