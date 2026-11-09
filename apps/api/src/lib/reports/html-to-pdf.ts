import { chromium } from 'playwright';

export interface HtmlToPdfOptions {
  html: string;
}

export async function renderPdfFromHtml({
  html,
}: HtmlToPdfOptions): Promise<Uint8Array> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '12mm',
        bottom: '12mm',
        left: '12mm',
        right: '12mm',
      },
    });

    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
