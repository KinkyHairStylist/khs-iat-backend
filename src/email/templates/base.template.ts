const KHS_LOGO_URL = 'https://firebasestorage.googleapis.com/v0/b/cvtocareer-394713.appspot.com/o/logo.png?alt=media&token=21e63b9f-cc30-420a-9592-6048701b1836';
const BRAND_RED = '#ED3131';
const ICON_COLOR = '52525b';

export function buildBaseTemplate(innerHtml: string, frontendUrl: string): string {
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kinky Hairstylist</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:40px 0;">
<tr>
<td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #ececec;">

  <tr>
    <td style="padding:32px 40px 24px 40px; text-align:center; border-bottom:1px solid #f1f1f1;">
      <img src="${KHS_LOGO_URL}" width="108" height="39" alt="KHS - Kinky Hairstylist" style="display:inline-block;" />
    </td>
  </tr>

  <tr>
    <td style="height:4px; background-color:${BRAND_RED}; line-height:4px; font-size:0;">&nbsp;</td>
  </tr>

  <tr>
    <td style="padding:40px 40px 8px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      ${innerHtml}
    </td>
  </tr>

  <tr><td style="padding:0 40px;"><hr style="border:none; border-top:1px solid #f1f1f1; margin:0;" /></td></tr>

  <tr>
    <td style="padding:24px 40px 32px 40px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; text-align:center;">
      <p style="margin:0 0 6px 0; font-size:13px; color:#a1a1aa;">Kinky Hairstylist &mdash; find and book the perfect stylist.</p>
      <p style="margin:0 0 16px 0; font-size:13px;"><a href="${frontendUrl}" style="color:${BRAND_RED}; text-decoration:none;">${frontendUrl}</a></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto;">
        <tr>
          <td style="padding:0 5px;"><a href="#" style="display:inline-block; width:26px; height:26px; line-height:26px; border-radius:50%; background-color:#f1f1f1; text-align:center; text-decoration:none;"><img src="https://cdn.simpleicons.org/facebook/${ICON_COLOR}" width="14" height="14" alt="Facebook" style="display:inline-block; vertical-align:middle; border:0;" /></a></td>
          <td style="padding:0 5px;"><a href="#" style="display:inline-block; width:26px; height:26px; line-height:26px; border-radius:50%; background-color:#f1f1f1; text-align:center; text-decoration:none;"><img src="https://cdn.simpleicons.org/x/${ICON_COLOR}" width="14" height="14" alt="X" style="display:inline-block; vertical-align:middle; border:0;" /></a></td>
          <td style="padding:0 5px;"><a href="#" style="display:inline-block; width:26px; height:26px; line-height:26px; border-radius:50%; background-color:#f1f1f1; text-align:center; text-decoration:none;"><img src="https://cdn.simpleicons.org/instagram/${ICON_COLOR}" width="14" height="14" alt="Instagram" style="display:inline-block; vertical-align:middle; border:0;" /></a></td>
        </tr>
      </table>
      <p style="margin:0; font-size:12px; color:#d4d4d8;">&copy; ${year} Kinky Hairstylist. All rights reserved.</p>
      <p style="margin:6px 0 0 0; font-size:12px; color:#d4d4d8;">This is an automated message, please don't reply directly to this email.</p>
    </td>
  </tr>

</table>

</td>
</tr>
</table>
</body>
</html>`.trim();
}
