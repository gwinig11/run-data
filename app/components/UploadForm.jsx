"use client";

import { useRef, useState } from "react";

export default function UploadForm() {
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  function openFilePicker() {
    inputRef.current?.click();
  }

  function uploadSelectedFile(event) {
    if (!event.currentTarget.files.length) return;
    setIsUploading(true);
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} className="compact-upload" action="/api/webhook/fit" method="post" encType="multipart/form-data">
      <input
        ref={inputRef}
        className="visually-hidden-file"
        name="file"
        type="file"
        accept=".fit,application/octet-stream"
        onChange={uploadSelectedFile}
      />
      <button type="button" onClick={openFilePicker} disabled={isUploading}>
        {isUploading ? "Uploading" : "Upload"}
      </button>
    </form>
  );
}
