/**
 * Email shell and building blocks.
 *
 * Mail clients are not browsers. Everything here obeys four rules that the site
 * itself doesn't have to:
 *
 *  1. Nested <table> layout at a fixed 600px. No flexbox, no grid, no float —
 *     Outlook renders through Word, which supports none of them.
 *  2. Every style inline. The Gmail app strips <head> styles for non-Gmail
 *     accounts, so a stylesheet is not a place to put anything load-bearing.
 *  3. Both the bgcolor attribute and a background-color style on coloured
 *     cells; Word honours the attribute more reliably than the property.
 *  4. No web fonts. Google Fonts never load in mail, so the site's Bricolage
 *     and Instrument Serif are replaced by stacks that exist everywhere. The
 *     brand carries through colour and layout instead of typeface.
 *
 * Explicit `color:` on every text node is also deliberate — Gmail on iOS
 * inverts dark emails, and a node without an explicit colour can end up dark
 * text on a dark ground.
 */

export const C = {
  bg: "#07090d",
  panel: "#0e1116",
  panelRaised: "#161b24",
  border: "#1c2230",
  saffron: "#ff8112",
  saffronLight: "#ff9d38",
  emerald: "#22c55e",
  red: "#ef4444",
  text: "#e8ecf4",
  muted: "#8592a7",
  faint: "#515d73",
  white: "#ffffff",
} as const;

export const FONT = {
  display: "'Trebuchet MS', 'Segoe UI', Tahoma, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  body: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Courier New', monospace",
} as const;

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Spacer rows, never margin — margin is unreliable in Word. */
export function gap(px: number): string {
  return `<tr><td height="${px}" style="font-size:0;line-height:0;height:${px}px;">&nbsp;</td></tr>`;
}

export function rule(color: string = C.border, height = 1): string {
  return `<tr><td bgcolor="${color}" height="${height}" style="background-color:${color};font-size:0;line-height:0;height:${height}px;">&nbsp;</td></tr>`;
}

/**
 * Bulletproof button. The MSO conditional gives Outlook a real rounded shape;
 * everything else gets the styled anchor.
 */
export function button(opts: {
  href: string; label: string; variant?: "primary" | "ghost" | "danger";
}): string {
  const v = opts.variant ?? "primary";
  const bg = v === "primary" ? C.saffron : C.panelRaised;
  const fg = v === "primary" ? C.white : v === "danger" ? C.red : C.text;
  const border = v === "primary" ? C.saffron : C.border;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr><td align="center">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
      href="${esc(opts.href)}" style="height:46px;v-text-anchor:middle;width:100%;" arcsize="50%"
      strokecolor="${border}" fillcolor="${bg}">
      <w:anchorlock/><center style="color:${fg};font-family:${FONT.body};font-size:15px;font-weight:bold;">${esc(opts.label)}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" bgcolor="${bg}"
        style="background-color:${bg};border:1px solid ${border};border-radius:999px;padding:14px 24px;">
        <a href="${esc(opts.href)}" style="display:block;color:${fg};font-family:${FONT.body};font-size:15px;font-weight:bold;text-decoration:none;line-height:1.2;">${esc(opts.label)}</a>
      </td></tr>
    </table>
    <!--<![endif]-->
  </td></tr>
</table>`;
}

/** A label/value row in the detail block. */
export function detailRow(label: string, value: string, isHtml = false): string {
  return `
<tr>
  <td style="padding:9px 0;border-bottom:1px solid ${C.border};font-family:${FONT.mono};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.faint};" width="38%" valign="top">${esc(label)}</td>
  <td style="padding:9px 0;border-bottom:1px solid ${C.border};font-family:${FONT.body};font-size:14px;color:${C.text};" valign="top">${isHtml ? value : esc(value)}</td>
</tr>`;
}

/** A free-text block with the saffron spine, used for requests / pricing notes. */
export function quoteBlock(label: string, body: string, accent: string = C.saffron): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr><td style="border-left:3px solid ${accent};padding:2px 0 2px 14px;">
    <div style="font-family:${FONT.mono};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.faint};padding-bottom:5px;">${esc(label)}</div>
    <div style="font-family:${FONT.body};font-size:14px;line-height:1.55;color:${C.text};">${esc(body)}</div>
  </td></tr>
</table>`;
}

/**
 * The outer shell: hidden preheader, saffron hairline, wordmark, content, foot.
 * `preheader` is what shows in the inbox list next to the subject — worth
 * setting, because otherwise clients scrape the first visible words instead.
 */
export function emailShell(opts: {
  preheader: string;
  children: string;
  footNote?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Baari</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(opts.preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:28px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">
        <tr><td bgcolor="${C.saffron}" height="3" style="background-color:${C.saffron};font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

        <tr><td bgcolor="${C.panel}" style="background-color:${C.panel};padding:26px 32px 30px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="padding-bottom:22px;">
              <span style="font-family:${FONT.display};font-size:21px;font-weight:bold;letter-spacing:-0.5px;color:${C.white};">baari</span>
              <span style="font-family:'Nirmala UI','Noto Sans Devanagari',sans-serif;font-size:15px;color:${C.saffronLight};padding-left:7px;">बारी</span>
            </td></tr>
            ${opts.children}
          </table>
        </td></tr>

        <tr><td bgcolor="${C.panel}" style="background-color:${C.panel};border-top:1px solid ${C.border};padding:16px 32px 22px 32px;">
          <div style="font-family:${FONT.body};font-size:11px;line-height:1.6;color:${C.faint};">
            ${esc(opts.footNote ?? "Baari — WhatsApp-first virtual queuing for Indian restaurants.")}
          </div>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

/** The small uppercase label above a headline. */
export function eyebrow(text: string, color: string = C.saffronLight): string {
  return `<tr><td style="font-family:${FONT.mono};font-size:10px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:${color};padding-bottom:8px;">${esc(text)}</td></tr>`;
}

/** Headline, with an optional Georgia-italic accent carrying the site's serif. */
export function headline(main: string, accent?: string): string {
  return `<tr><td style="font-family:${FONT.display};font-size:27px;line-height:1.2;font-weight:bold;letter-spacing:-0.5px;color:${C.white};padding-bottom:6px;">${esc(main)}${
    accent ? ` <span style="font-family:${FONT.serif};font-style:italic;font-weight:normal;color:${C.saffronLight};">${esc(accent)}</span>` : ""
  }</td></tr>`;
}

/** The bordered slot card. */
export function slotCard(opts: { label: string; slot: string; note?: string }): string {
  return `
<tr><td style="padding:4px 0 20px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.panelRaised}" style="background-color:${C.panelRaised};border:1px solid ${C.border};border-radius:10px;">
    <tr><td style="padding:16px 18px;">
      <div style="font-family:${FONT.mono};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.faint};padding-bottom:6px;">${esc(opts.label)}</div>
      <div style="font-family:${FONT.display};font-size:18px;font-weight:bold;color:${C.white};">${esc(opts.slot)}</div>
      ${opts.note ? `<div style="font-family:${FONT.body};font-size:12px;color:${C.muted};padding-top:6px;">${esc(opts.note)}</div>` : ""}
    </td></tr>
  </table>
</td></tr>`;
}
