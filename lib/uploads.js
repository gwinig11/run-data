export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function extractUploadedFit(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw tooLarge();
  }

  const contentType = request.headers.get("content-type") || "application/octet-stream";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Multipart upload must include a file field named file.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    enforceSize(buffer);
    return {
      buffer,
      filename: sanitizeFilename(file.name || "upload.fit"),
      contentType: file.type || "application/octet-stream",
    };
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  enforceSize(buffer);
  return {
    buffer,
    filename: sanitizeFilename(request.headers.get("x-filename") || "upload.fit"),
    contentType,
  };
}

export function sanitizeFilename(name) {
  return String(name).split(/[\\/]/).pop().replace(/[^\w. -]/g, "_").trim() || "upload.fit";
}

function enforceSize(buffer) {
  if (!buffer.length) throw new Error("Uploaded file is empty.");
  if (buffer.length > MAX_UPLOAD_BYTES) throw tooLarge();
}

function tooLarge() {
  const error = new Error("Upload is too large. Limit is 4 MB.");
  error.status = 413;
  return error;
}
