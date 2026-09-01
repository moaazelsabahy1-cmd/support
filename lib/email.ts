import nodemailer from "nodemailer";
import { getEnv, isConfigured } from "@/lib/env";

type TemplateName =
  | "welcome"
  | "password-reset"
  | "ticket-created"
  | "ticket-assigned"
  | "ticket-reply"
  | "ticket-resolved"
  | "meeting-confirmed"
  | "meeting-cancelled";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  template: TemplateName;
  data: Record<string, string>;
}) {
  const html = renderTemplate(opts.template, opts.data);
  const env = getEnv();
  if (!isConfigured(env.SMTP_HOST)) {
    console.info("[email:dev]", { to: opts.to, subject: opts.subject, html });
    return { delivered: false, mode: "log" as const };
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    html,
  });
  return { delivered: true, mode: "smtp" as const };
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px">
    <h1 style="color:#2dd4bf;font-size:20px;margin:0 0 16px">Solvio</h1>
    <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
    <div style="line-height:1.6;color:#cbd5e1">${body}</div>
  </div></body></html>`;
}

export function renderTemplate(name: TemplateName, data: Record<string, string>) {
  switch (name) {
    case "welcome":
      return shell("Welcome to Solvio", `Hi ${data.name}, your account is ready. <a href="${data.url}">Open dashboard</a>`);
    case "password-reset":
      return shell("Reset password", `Hi ${data.name}, <a href="${data.url}">reset your password</a>. This link expires soon.`);
    case "ticket-created":
      return shell("Ticket created", `Ticket <strong>${data.number}</strong>: ${data.title}<br/><a href="${data.url}">View ticket</a>`);
    case "ticket-assigned":
      return shell("Ticket assigned", `You were assigned <strong>${data.number}</strong>. <a href="${data.url}">Open it</a>`);
    case "ticket-reply":
      return shell("New reply", `${data.author} replied on ${data.number}. <a href="${data.url}">Read message</a>`);
    case "ticket-resolved":
      return shell("Ticket resolved", `${data.number} was marked resolved. <a href="${data.url}">Leave feedback</a>`);
    case "meeting-confirmed":
      return shell("Meeting confirmed", `${data.title} on ${data.when}. <a href="${data.url}">Details</a>`);
    case "meeting-cancelled":
      return shell("Meeting cancelled", `${data.title} was cancelled.`);
    default:
      return shell("Solvio", JSON.stringify(data));
  }
}
