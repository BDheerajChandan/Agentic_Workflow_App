// src/utils/uploadFiles.js
// Streams files to /files/upload via XHR (progress, no in-memory buffering of file contents).

export function uploadFiles(apiBase, files, context = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    ["flow_id", "bot_id", "session_id"].forEach((k) => {
      if (context[k] !== undefined && context[k] !== null && context[k] !== "") {
        fd.append(k, String(context[k]));
      }
    });

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/files/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else reject(new Error(body?.detail || "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Could not reach the server."));
    xhr.send(fd);
  });
}