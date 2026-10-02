import { PDFParse } from 'pdf-parse';

// Startup may finish after the parent has already crashed or closed its IPC channel.
if (!process.connected) process.exit(1);
const finish = (message) => {
  if (!process.connected) process.exit(1);
  process.send?.(message, () => process.exit(0));
};
process.once('message', async (message) => {
  let parser;
  let response;
  try {
    const buffer = Buffer.from(message?.buffer || []);
    if (buffer.length > 25 * 1024 * 1024) throw { code: 'PDF_SIZE_LIMIT' };
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw { code: 'PDF_INVALID' };
    parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false });
    const info = await parser.getInfo();
    if (!Number.isInteger(info.total) || info.total > 500) throw { code: 'PDF_PAGE_LIMIT' };
    const text = await parser.getText({ cellSeparator: '\t' });
    if (text.text.length > 8_000_000) throw { code: 'PDF_TEXT_LIMIT' };
    if (text.pages.map((page) => page.text.trim()).join('').length < 40)
      throw { code: 'PDF_NO_TEXT' };
    response = {
      ok: true,
      total: info.total,
      text: text.text,
      pages: text.pages.map((page) => ({ page: page.num, text: page.text })),
    };
  } catch (error) {
    const code = [
      'PDF_INVALID',
      'PDF_SIZE_LIMIT',
      'PDF_PAGE_LIMIT',
      'PDF_TEXT_LIMIT',
      'PDF_NO_TEXT',
    ].includes(error?.code)
      ? error.code
      : 'PDF_PARSE_FAILED';
    response = { ok: false, code };
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
  finish(response);
});
process.once('disconnect', () => process.exit(1));
