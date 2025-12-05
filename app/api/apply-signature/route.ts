export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

/**
 * POST /api/apply-signature
 *
 * Expects JSON body:
 * {
 *   "signaturePngDataUrl": "data:image/png;base64,...",
 *   "pdfUrl": "https://.../your-report.pdf"
 * }
 *
 * Returns:
 * {
 *   "pdfBase64": "<base64 encoded FINAL PDF with ink mark>"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const signaturePngDataUrl = body.signaturePngDataUrl as string | undefined;
    const pdfUrl = body.pdfUrl as string | undefined;

    if (!signaturePngDataUrl || typeof signaturePngDataUrl !== "string") {
      return NextResponse.json(
        { error: "signaturePngDataUrl is required" },
        { status: 400 }
      );
    }

    if (!pdfUrl || typeof pdfUrl !== "string") {
      return NextResponse.json(
        { error: "pdfUrl is required" },
        { status: 400 }
      );
    }

    // ----------------------------------------------------------------
    // 1) Download your REAL report PDF from Supabase (or any URL)
    // ----------------------------------------------------------------
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch PDF from pdfUrl",
          status: pdfResponse.status,
        },
        { status: 400 }
      );
    }

    // Response body -> ArrayBuffer -> Uint8Array
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const existingPdfBytes = new Uint8Array(pdfArrayBuffer);

    // ----------------------------------------------------------------
    // 2) Decode the signature PNG data URL into bytes
    // ----------------------------------------------------------------
    const commaIndex = signaturePngDataUrl.indexOf(",");
    if (commaIndex === -1) {
      return NextResponse.json(
        { error: "Invalid signature data URL format" },
        { status: 400 }
      );
    }
    const base64Signature = signaturePngDataUrl.slice(commaIndex + 1);

    const signatureBytes = Uint8Array.from(
      Buffer.from(base64Signature, "base64")
    );

    // ----------------------------------------------------------------
    // 3) Load the EXISTING PDF with pdf-lib
    // ----------------------------------------------------------------
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Get the last page of the existing report
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const { width: pageWidth, height: pageHeight } = lastPage.getSize();

    // ----------------------------------------------------------------
    // 4) Embed the signature PNG into the PDF
    // ----------------------------------------------------------------
    const pngImage = await pdfDoc.embedPng(signatureBytes);

    // Decide how big the ink mark should be on the page
    const desiredWidth = 200; // in PDF points
    const aspectRatio = pngImage.height / pngImage.width;
    const desiredHeight = desiredWidth * aspectRatio;

    // Choose position: bottom-right with some margin
    const margin = 50; // 50pt gap from edges
    const x = pageWidth - desiredWidth - margin;
    const y = margin;

    lastPage.drawImage(pngImage, {
      x,
      y,
      width: desiredWidth,
      height: desiredHeight,
    });

    // ----------------------------------------------------------------
    // 5) Save the UPDATED PDF and return as base64
    // ----------------------------------------------------------------
    const updatedPdfBytes = await pdfDoc.save();
    const pdfBase64 = Buffer.from(updatedPdfBytes).toString("base64");

    return NextResponse.json({ pdfBase64 }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/apply-signature:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
