Generate a sample PDF of the current assessment certificate template using placeholder data, save it to `/mnt/documents/`, and deliver it as a downloadable artifact.

## Approach

1. Write a small Node script (`/tmp/render-cert.mjs`) that imports `jsPDF` and reproduces the exact `generateCertificate` layout from `src/lib/generateAssessmentPdfs.ts` — same fonts, positions, colors, corner blobs, diamond divider, and the CAPACITI logo loaded from `src/assets/capaciti-logo.png`.
2. Render with representative placeholder data:
   - Name: `JANE DOE`
   - Assessment: `Sample Skills Assessment`
   - Score: `16 / 20 (80.00%)`
   - Date: `1 July 2026`
3. Write output to `/mnt/documents/assessment-certificate-sample.pdf`.
4. QA: rasterize with `pdftoppm` and visually inspect the page for overlaps, clipping, or logo issues. Fix and re-render if anything looks off.
5. Deliver via a `<presentation-artifact>` tag so you can preview/download it.

No changes to project source files — this is a one-off artifact export.
