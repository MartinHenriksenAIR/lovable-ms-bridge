"use client";

import React, { useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

/**
 * Helper to download a base64-encoded PDF as a file in the browser.
 */
function downloadBase64Pdf(base64: string, fileName: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TestSignaturePage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGeneratePdf() {
    if (!dataUrl) {
      alert("Please draw a mark and click 'Use this mark' first.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch("/api/apply-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signaturePngDataUrl: dataUrl,
        }),
      });

      if (!res.ok) {
        console.error("API error:", res.status, await res.text());
        alert("Failed to generate PDF.");
        return;
      }

      const json = await res.json();

      if (!json.pdfBase64) {
        alert("API did not return pdfBase64.");
        return;
      }

      downloadBase64Pdf(json.pdfBase64, "ink-mark-test.pdf");
    } catch (error) {
      console.error("Error calling /api/apply-signature:", error);
      alert("Something went wrong while generating the PDF.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "40px auto",
        padding: 24,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>
        Test: Ink Mark Capture + PDF
      </h1>

      <p style={{ marginBottom: 16, fontSize: 14, color: "#555" }}>
        1) Draw a mark below. 2) Click &quot;Use this mark&quot; in the box. 3)
        Click &quot;Generate PDF with this mark&quot; to download a test PDF.
      </p>

      <SignatureCanvas onChange={setDataUrl} />

      {dataUrl && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Preview of your mark</h2>
          <img
            src={dataUrl}
            alt="Ink mark preview"
            style={{
              border: "1px solid #ddd",
              borderRadius: 4,
              maxWidth: "100%",
              background: "white",
            }}
          />
          <p style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
            This image is generated from the{" "}
            <code style={{ fontSize: 12 }}>data:image/png;base64,...</code>{" "}
            string that will be embedded into the PDF.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleGeneratePdf}
        disabled={!dataUrl || isGenerating}
        style={{
          marginTop: 24,
          padding: "10px 18px",
          borderRadius: 6,
          border: "none",
          cursor: !dataUrl || isGenerating ? "not-allowed" : "pointer",
          backgroundColor: !dataUrl || isGenerating ? "#9ca3af" : "#2563eb",
          color: "white",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {isGenerating ? "Generating PDF..." : "Generate PDF with this mark"}
      </button>
    </div>
  );
}
