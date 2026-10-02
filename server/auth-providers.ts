import nodemailer from 'nodemailer';
import { ApiFault } from './validation.js';

export function emailProviderFromEnv() {
  const configured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.MAIL_FROM
  );
  return {
    configured,
    async send(to: string, subject: string, text: string) {
      if (!configured) throw new ApiFault(503, 'EMAIL_UNAVAILABLE', '邮件服务尚未配置，未发送邮件');
      const port = Number(process.env.SMTP_PORT || 465);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new ApiFault(503, 'EMAIL_UNAVAILABLE', '邮件服务配置无效');
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
        connectionTimeout: 10000,
        socketTimeout: 15000,
        logger: false,
        debug: false,
      });
      try {
        const result = await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
        if (!result.accepted?.length) throw new Error('not accepted');
      } catch {
        throw new ApiFault(503, 'EMAIL_DELIVERY_FAILED', '邮件服务未接受投递，请稍后重试');
      } finally {
        transport.close();
      }
    },
  };
}
export const smsProvider = {
  configured: false,
  async send(_phone: string, _code: string): Promise<never> {
    throw new ApiFault(503, 'SMS_UNAVAILABLE', '短信服务尚未配置，未发送验证码');
  },
};
