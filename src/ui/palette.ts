export type ShapeId = 'kreis' | 'dreieck' | 'quadrat' | 'raute' | 'stern' | 'plus' | 'sechseck' | 'kreuz';

export interface PaletteEntry {
  name: string;
  shape: ShapeId;
  path: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  { name: 'Lime', shape: 'kreis', path: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z' },
  { name: 'Pink', shape: 'dreieck', path: 'M12 3L22 21H2z' },
  { name: 'Cyan', shape: 'quadrat', path: 'M3 3H21V21H3z' },
  { name: 'Orange', shape: 'raute', path: 'M12 1L23 12L12 23L1 12z' },
  {
    name: 'Violett',
    shape: 'stern',
    path: 'M12 1.8L14.8 9L22.5 9.4L16.5 14.3L18.5 21.7L12 17.5L5.5 21.7L7.5 14.3L1.5 9.4L9.2 9z',
  },
  { name: 'Gelb', shape: 'plus', path: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z' },
  { name: 'Mint', shape: 'sechseck', path: 'M12 1.5L21.1 6.75V17.25L12 22.5L2.9 17.25V6.75z' },
  {
    name: 'Blau',
    shape: 'kreuz',
    path: 'M5 1.5L12 8.5L19 1.5L22.5 5L15.5 12L22.5 19L19 22.5L12 15.5L5 22.5L1.5 19L8.5 12L1.5 5z',
  },
];

export const paletteAt = (color: number): PaletteEntry => PALETTE[((color % 8) + 8) % 8] as PaletteEntry;
