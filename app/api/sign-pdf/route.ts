export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";

/**
 * POST /api/sign-pdf
 *
 * Expects JSON body:
 * {
 *   "pdfBase64": "<base64 of the UNSIGNED PDF>",
 *   "signaturePngDataUrl": "data:image/png;base64,..."
 * }
 *
 * Returns:
 * {
 *   "signedPdfBase64": "<base64 of the SIGNED PDF>"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const pdfBase64 = body.pdfBase64 as string | undefined;
    const signaturePngDataUrl = body.signaturePngDataUrl as string | undefined;

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return NextResponse.json(
        { error: "pdfBase64 is required" },
        { status: 400 }
      );
    }

    if (!signaturePngDataUrl || typeof signaturePngDataUrl !== "string") {
      return NextResponse.json(
        { error: "signaturePngDataUrl is required" },
        { status: 400 }
      );
    }

    // -----------------------------------------------
    // 1) Decode PDF base64 -> bytes
    // -----------------------------------------------
    const pdfBytes = Uint8Array.from(Buffer.from(pdfBase64, "base64"));

    // -----------------------------------------------
    // 2) Decode PNG data URL -> bytes
    // -----------------------------------------------
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

    // -----------------------------------------------
    // 3) Load existing PDF and embed signature
    // -----------------------------------------------
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const { width: pageWidth, height: pageHeight } = lastPage.getSize();

    const pngImage = await pdfDoc.embedPng(signatureBytes);

    const desiredWidth = 200; // adjust size if needed
    const aspectRatio = pngImage.height / pngImage.width;
    const desiredHeight = desiredWidth * aspectRatio;

    const margin = 50;
    const x = pageWidth - desiredWidth - margin;
    const y = margin;

    lastPage.drawImage(pngImage, {
      x,
      y,
      width: desiredWidth,
      height: desiredHeight,
    });

    const signedPdfBytes = await pdfDoc.save();
    const signedPdfBase64 = Buffer.from(signedPdfBytes).toString("base64");

    return NextResponse.json({ signedPdfBase64 }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/sign-pdf:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
