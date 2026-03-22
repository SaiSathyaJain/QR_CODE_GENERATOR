import QRCode from 'qrcode';

const QR_OPTIONS: QRCode.QRCodeToStringOptions = {
  errorCorrectionLevel: 'H',
  type: 'svg',
  width: 400,
  margin: 2,
  color: {
    dark: '#1a237e',
    light: '#ffffff',
  },
};

/**
 * Generates a QR code as a base64 data URL for the given student's grade card URL.
 * No R2 or external storage required — generated on-the-fly.
 */
export async function generateQRDataURL(baseUrl: string, studentId: string): Promise<string> {
  const url = `${baseUrl}/gradecard/${studentId}`;
  const svg = await QRCode.toString(url, QR_OPTIONS);
  const b64 = btoa(svg);
  return `data:image/svg+xml;base64,${b64}`;
}
