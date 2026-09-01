import { getConfiguredAppOrigin } from "./app-url.ts";

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

export const generateToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

export const sendPaidSignupFinishEmail = async (email: string, token: string) => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const resendFromName = Deno.env.get("RESEND_FROM_NAME") || "Sermon Slide Pro";
  if (!resendApiKey || !resendFromEmail) return { sent: false, error: "Resend is not configured" };

  const finishUrl = `${getConfiguredAppOrigin()}/signup/complete?token=${encodeURIComponent(token)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: [email],
      subject: "Finish creating your Sermon Slide Pro account",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
          <h2>Your Sermon Slide Pro subscription is ready</h2>
          <p>Thanks for subscribing. Finish creating your account so you can start building sermon slides.</p>
          <p><a href="${finishUrl}">Finish creating your account</a></p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Your Sermon Slide Pro subscription is ready.\n\nFinish creating your account: ${finishUrl}\n\nIf you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    return { sent: false, error: `Resend failed: ${response.status} ${await response.text()}` };
  }

  return { sent: true, error: null };
};
