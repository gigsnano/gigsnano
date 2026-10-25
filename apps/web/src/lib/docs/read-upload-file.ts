/** Read file bytes for story attachment upload (text as UTF-8, binary as data URL). */
export async function readUploadFileContent(file: File): Promise<string> {
  const isText =
    file.type.startsWith("text/") ||
    /\.(md|txt|csv|json|xml|html?)$/i.test(file.name);

  if (isText) {
    return file.text();
  }

  return readFileAsDataUrl(file);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
