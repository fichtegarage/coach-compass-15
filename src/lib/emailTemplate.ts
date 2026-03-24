const LOGO_URL = 'https://buchung.jakob-neumann.net/Logo.png';

export function buildEmail(contentHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding:32px 40px 24px;">
              <img
                src="${LOGO_URL}"
                alt="Jakob Neumann Training"
                width="180"
                style="display:block;height:auto;max-width:180px;"
              />
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;color:#18181b;font-size:16px;line-height:1.7;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0;" />
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:20px 40px 32px;">
              <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#18181b;">Jakob</p>
              <p style="margin:0 0 1px;font-size:13px;color:#71717a;">Jakob Neumann Personal Training</p>
              <p style="margin:0;font-size:13px;color:#71717a;font-style:italic;">Stronger Every Day</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
