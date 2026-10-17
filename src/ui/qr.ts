import { toString } from 'qrcode';

export function qrSvg(url: string): Promise<string> {
  return toString(url, { type: 'svg', margin: 1 });
}
