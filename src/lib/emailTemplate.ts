const LOGO_URL = 'https://buchung.jakob-neumann.net/Logo.png';

export function buildEmail(contentHtml: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">

          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding:32px 40px 24px;">
              <img src="${LOGO_URL}" alt="Jakob Neumann Training" width="180" style="display:block;height:auto;" />
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;color:#1a1a1a;font-size:16px;line-height:1.6;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Signature -->
          <tr>
            <td style="padding:0 40px 32px;">
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 20px;" />
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:15px;font-weight:bold;color:#1a1a1a;">Jakob</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#666666;">Jakob Neumann Personal Training</p>
                    <p style="margin:2px 0 0;font-size:13px;color:#666666;">Stronger Every Day</p>
                  </td>
                </tr>
              </table>
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
