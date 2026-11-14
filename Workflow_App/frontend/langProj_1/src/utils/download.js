// src/utils/download.js

export function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(fileName, data) {
  downloadBlob(fileName, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}