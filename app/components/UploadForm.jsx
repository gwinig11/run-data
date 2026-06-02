"use client";

import { useState } from "react";

export default function UploadForm() {
  const [hasFile, setHasFile] = useState(false);

  return (
    <form className="upload" action="/api/webhook/fit" method="post" encType="multipart/form-data">
      <input
        name="file"
        type="file"
        accept=".fit,application/octet-stream"
        onChange={(event) => setHasFile(event.currentTarget.files.length > 0)}
      />
      <button type="submit" disabled={!hasFile}>Upload</button>
    </form>
  );
}
