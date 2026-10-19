/**
 * mail.mjs — outbound email.
 *
 *   smtp      any relay (Postmark, SES, Mailgun, a Gmail app password, Postfix)
 *   sendmail  the local sendmail binary
 *   log       print and do nothing (the default until SMTP_HOST is set, so a
 *             dev box never emails a real contractor)
 *
 * Callers treat a mail failure as non-fatal: whatever the email is about (a
 * lead, a payment) is already in the database before sending is attempted.
 */
import { config } from "./config.mjs";

let _transport = null;
let _mode = null;
export const outbox = [];   // tests read this

async function transport() {
  if (_transport && _mode === config.mailTransport) return _transport;
  _mode = config.mailTransport;
  if (_mode === "smtp" || _mode === "sendmail") {
    const nodemailer = (await import("nodemailer")).default;
    _transport = _mode === "smtp"
      ? nodemailer.createTransport({
        host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
      : nodemailer.createTransport({ sendmail: true, newline: "unix" });
  } else {
    _transport = {
      log: true,
      async sendMail(m) {
        if (!process.env.ACP_QUIET) console.log(`[mail:log] to=${m.to} subject=${JSON.stringify(m.subject)}`);
        return { messageId: "log" };
      },
    };
  }
  return _transport;
}

/** @returns {Promise<boolean>} true when handed to a transport */
export async function sendMail({ to, subject, text, html, replyTo, bcc }) {
  if (!to) return false;
  const msg = { from: config.mailFrom, to, subject, text };
  if (html) msg.html = html;
  if (replyTo) msg.replyTo = replyTo;
  if (bcc) msg.bcc = bcc;
  outbox.push(msg);
  if (outbox.length > 200) outbox.shift();
  await (await transport()).sendMail(msg);
  return true;
}

/** Fire-and-log: for notifications that must never fail the request. */
export function notify(msg, label = "mail") {
  return sendMail(msg).catch((err) => {
    console.error(`[${label}] send failed to ${msg.to}:`, err.message || err);
    return false;
  });
}

export const mailMode = () => config.mailTransport;

export async function verifyMail() {
  const t = await transport();
  if (t.log) return { ok: true, mode: "log" };
  await t.verify();
  return { ok: true, mode: config.mailTransport };
}
