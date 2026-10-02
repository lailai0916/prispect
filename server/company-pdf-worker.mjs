import { PDFParse } from 'pdf-parse';
import pdfLimits from './pdf-limits.json' with { type: 'json' };

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
    const maximumBytes = message?.maximumBytes ?? pdfLimits.uploadBytes;
    if (
      ![pdfLimits.uploadBytes, pdfLimits.officialBytes].includes(maximumBytes) ||
      buffer.length > maximumBytes
    )
      throw { code: 'PDF_SIZE_LIMIT' };
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw { code: 'PDF_INVALID' };
    parser = new PDFParse({ data: new Uint8Array(buffer), isEvalSupported: false });
    const info = await parser.getInfo();
    if (!Number.isInteger(info.total) || info.total > 500) throw { code: 'PDF_PAGE_LIMIT' };
    const text = await parser.getText({ cellSeparator: '\t' });
    if (text.text.length > 8_000_000) throw { code: 'PDF_TEXT_LIMIT' };
    if (text.pages.map((page) => page.text.trim()).join('').length < 40)
      throw { code: 'PDF_NO_TEXT' };
    // Only the cash supplement needs cell geometry to distinguish a blank year
    // from a missing column. Use the parser's vector-grid tables, never infer zero.
    const tablePages = text.pages
      .filter((page) =>
        /将净利润调节|现金流量表补充资料|经营性应收项目|经营性应付项目/.test(page.text)
      )
      .slice(0, 20)
      .map((page) => page.num);
    const tables = tablePages.length
      ? await parser.getTable({ partial: tablePages })
      : { pages: [] };
    const byPage = new Map(
      tables.pages.map((page) => [
        page.num,
        page.tables
          .filter(
            (table) =>
              table.length <= 200 &&
              table.every((row) => row.length === 3 && row.every((cell) => cell.length <= 2000))
          )
          .slice(0, 10),
      ])
    );
    if (JSON.stringify([...byPage.values()]).length > 1_000_000) throw { code: 'PDF_TEXT_LIMIT' };
    response = {
      ok: true,
      total: info.total,
      text: text.text,
      pages: text.pages.map((page) => ({
        page: page.num,
        text: page.text,
        ...(byPage.get(page.num)?.length ? { tables: byPage.get(page.num) } : {}),
      })),
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
