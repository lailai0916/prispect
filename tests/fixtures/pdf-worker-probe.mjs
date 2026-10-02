process.once('message', (message) => {
  const mode = Buffer.from(message.buffer).toString('utf8');
  if (mode.includes('busy')) {
    const until = Date.now() + 10000;
    while (Date.now() < until) {}
  }
  const text = JSON.stringify({
    privateEnvironmentPresent: !!process.env.PDF_PRIVATE_TEST,
    probe: 'trusted test worker',
  });
  if (mode.includes('linger')) {
    process.send({ ok: true, total: 1, text, pages: [{ page: 1, text }] });
    setInterval(() => {}, 1000);
    return;
  }
  process.send({ ok: true, total: 1, text, pages: [{ page: 1, text }] }, () => process.exit(0));
});
