import { createApp } from './app.js';
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 无效');
if (process.env.NODE_ENV === 'production') {
  if (!process.env.APP_ORIGIN || new URL(process.env.APP_ORIGIN).protocol !== 'https:')
    throw new Error('生产模式必须设置 HTTPS APP_ORIGIN');
} else if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('开发模式仅允许本机地址');
const { app, auth, waitForIdle } = await createApp();
const server = app.listen(port, host, () => {
  process.stdout.write(`CashLens local server: http://${host}:${port}\n`);
});
const close = () => {
  server.close(() => {
    void waitForIdle().then(() => {
      auth.close();
      process.exit(0);
    });
  });
};
process.on('SIGINT', close);
process.on('SIGTERM', close);
