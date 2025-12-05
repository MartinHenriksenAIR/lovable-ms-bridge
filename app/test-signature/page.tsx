"use client";

import React, { useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

// TODO: Replace this with a REAL Supabase URL to one of your BYGGE PDFs
const TEST_PDF_URL =
  "https://airadgivning.sharepoint.com/sites/AIRdgivning/_layouts/15/download.aspx?UniqueId=f237e8f3-012b-4036-a3ae-4846d7994e44&Translate=false&tempauth=v1.eyJzaXRlaWQiOiIyODc5ZWI5YS1mZGI3LTQxZjEtOGJlYi00NDEzMDg3ZjFlOTUiLCJhcHBfZGlzcGxheW5hbWUiOiJMb3ZhYmxlIFNoYXJlUG9pbnQgKERlbGVnYXRlZCBNdWx0aVRlbmFudCkiLCJhcHBpZCI6ImVmYzkwYzNhLWVlYTAtNGYzOS1hNDVjLWVjMDYzZmE1MmVmNSIsImF1ZCI6IjAwMDAwMDAzLTAwMDAtMGZmMS1jZTAwLTAwMDAwMDAwMDAwMC9haXJhZGdpdm5pbmcuc2hhcmVwb2ludC5jb21AOWRlM2Q5YzMtYjBiYi00ZDJlLTkzYWItZjY0MDdhOGIzNzkzIiwiZXhwIjoiMTc2NDg2MDcwNyJ9.CkAKDGVudHJhX2NsYWltcxIwQ09Tbnhza0dFQUFhRm5OUVEwdDFVRmhEU0ZWeFJIaGtOMWd5UTFscFFVRXFBQT09CjIKCmFjdG9yYXBwaWQSJDAwMDAwMDAzLTAwMDAtMDAwMC1jMDAwLTAwMDAwMDAwMDAwMAoKCgRzbmlkEgI2NBILCJCH5pqF0tk-EAUaDTQwLjEyNi4yMy4xNjIqLDV1anVIVkE2ZnlDd2lodExSMWNzdXNKMUx0azUrVzJpNjZwbVB1WXRNNFk9MI0BOAFCEKHfvbKg0ADgpyyNSTY7WOZKEGhhc2hlZHByb29mdG9rZW5SCFsia21zaSJdaiQwMDlhOWEzOS0wN2UxLTBkMjYtZTFjYi1kNGM0NzAyMTNkMzZyKTBoLmZ8bWVtYmVyc2hpcHwxMDAzMjAwNGJmYjg1MjkzQGxpdmUuY29tegEyggESCcPZ4527sC5NEZOr9kB6izeTkgEGTWFydGlumgEJSGVucmlrc2VuogEZbWFydGluaEBhaS1yYWFkZ2l2bmluZy5ka6oBEDEwMDMyMDA0QkZCODUyOTOyAWphbGxmaWxlcy5yZWFkIG15ZmlsZXMud3JpdGUgYWxsZmlsZXMud3JpdGUgbXlhcHBmb2xkZXIud3JpdGUgYWxsc2l0ZXMucmVhZCBhbGxzaXRlcy53cml0ZSBhbGxwcm9maWxlcy5yZWFkyAEB.ERs1V6tOcTNdSkApXagmkRmHR25DZHSE2SHL-0-70Ao&ApiVersion=2.0";

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

    if (!TEST_PDF_URL || TEST_PDF_URL.startsWith("https://your-supabase")) {
      alert(
        "Please set TEST_PDF_URL at the top of this file to a real Supabase PDF URL before testing."
      );
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
          pdfUrl: TEST_PDF_URL,
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

      downloadBase64Pdf(json.pdfBase64, "bygge-report-with-mark.pdf");
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
        Test: Ink Mark on REAL BYGGE Report
      </h1>

      <p style={{ marginBottom: 12, fontSize: 14, color: "#555" }}>
        1) Make sure <code>TEST_PDF_URL</code> at the top of this file points
        to a real PDF in Supabase.
        <br />
        2) Draw a mark below and click &quot;Use this mark&quot;.
        <br />
        3) Click &quot;Generate PDF with this mark&quot; to download a new
        version of that report with the ink mark applied.
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
            This is the PNG that will be embedded into your real BYGGE report
            PDF from Supabase.
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
