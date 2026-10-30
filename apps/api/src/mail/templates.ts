import type { OutgoingMail } from './mail.module.js';

export const verificationEmail = (to: string, name: string, code: string): OutgoingMail => ({
  to,
  subject: `${code} is your AI Staff verification code`,
  text: `Hi ${name},\n\nYour verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't sign up, you can ignore this email.`,
});

export const accountExistsEmail = (to: string, name: string, appUrl: string): OutgoingMail => ({
  to,
  subject: 'You already have an AI Staff account',
  text: `Hi ${name},\n\nSomeone tried to sign up with this email address, but you already have an account.\n\nSign in at ${appUrl}/login, or reset your password at ${appUrl}/forgot-password.\n\nIf this wasn't you, you can ignore this email.`,
});

export const passwordResetEmail = (to: string, name: string, link: string): OutgoingMail => ({
  to,
  subject: 'Reset your AI Staff password',
  text: `Hi ${name},\n\nUse this link to choose a new password. It expires in 30 minutes and works once:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email; your password has not changed.`,
});

export const invitationEmail = (to: string, inviter: string, workspace: string, link: string): OutgoingMail => ({
  to,
  subject: `${inviter} invited you to ${workspace} on AI Staff`,
  text: `${inviter} invited you to join ${workspace} on AI Staff.\n\nAccept the invitation here (it expires in 7 days):\n\n${link}`,
});
