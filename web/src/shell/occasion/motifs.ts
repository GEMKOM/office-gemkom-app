/**
 * The 19 Özel Günler motifs, ported from the design canvas (Emblem): each is
 * drawn on a 200×200 viewBox in two colours, C (the ink) and A (the accent).
 * They are plain data so the same drawing renders as a React <svg> (Motif)
 * and as a data URI for the page band (motifDataUrl).
 */

export const MOTIFS = [
  'ayyildiz',
  'hilal',
  'defne',
  'konfeti',
  'kar',
  'balon',
  'disli',
  'gelincik',
  'lale',
  'cicek',
  'kitap',
  'baret',
  'fener',
  'geometrik',
  'yildizlar',
  'pasta',
  'rozet',
  'kivilcim',
  'cizgi',
] as const;

export type MotifId = (typeof MOTIFS)[number];

export const MOTIF_LABEL: Record<MotifId, string> = {
  ayyildiz: 'Ay yıldız',
  hilal: 'Hilal',
  defne: 'Defne',
  konfeti: 'Konfeti',
  kar: 'Kar tanesi',
  balon: 'Balon',
  disli: 'Dişli',
  gelincik: 'Gelincik',
  lale: 'Lale',
  cicek: 'Çiçek',
  kitap: 'Kitap',
  baret: 'Baret',
  fener: 'Fener',
  geometrik: 'Geometrik yıldız',
  yildizlar: 'Yıldızlar',
  pasta: 'Pasta',
  rozet: 'Rozet',
  kivilcim: 'Kıvılcım',
  cizgi: 'Çizgi',
};

export function isMotif(value: unknown): value is MotifId {
  return typeof value === 'string' && (MOTIFS as readonly string[]).includes(value);
}

/** [tag, attributes, children]. 'C' and 'A' in a value stand for the two colours; '#m' is the motif's mask id. */
export type MotifNode = [string, Record<string, string | number>, MotifNode[]?];

const C = 'C';
const A = 'A';
const LEAF = '#5f8a4a';
const STEM = '#6f9a5a';

const sparkle = (d: string, fill = A): MotifNode => ['path', { d, fill }];

function ellipses(list: [number, number, number][], fill = C): MotifNode {
  return [
    'g',
    { fill },
    list.map(([cx, cy, r]) => [
      'ellipse',
      { cx, cy, rx: 8, ry: 17, transform: `rotate(${r} ${cx} ${cy})` },
    ]),
  ];
}

const flake: MotifNode[] = [
  ['line', { x1: 100, y1: 34, x2: 100, y2: 166 }],
  ['path', { d: 'M100 56 L86 42 M100 56 L114 42 M100 144 L86 158 M100 144 L114 158' }],
];

function geoPair(x: number, y: number, cx: number, cy: number): MotifNode[] {
  return [
    ['rect', { x, y, width: 24, height: 24 }],
    ['rect', { x, y, width: 24, height: 24, transform: `rotate(45 ${cx} ${cy})` }],
  ];
}

export const MOTIF_NODES: Record<MotifId, MotifNode[]> = {
  ayyildiz: [
    [
      'defs',
      {},
      [
        [
          'mask',
          { id: '#m' },
          [
            ['rect', { width: 200, height: 200, fill: 'white' }],
            ['circle', { cx: 100, cy: 100, r: 48, fill: 'black' }],
          ],
        ],
      ],
    ],
    ['circle', { cx: 82, cy: 100, r: 60, fill: C, mask: 'url(#m)' }],
    ['polygon', { fill: C, points: '172,100 132.2,112.9 156.8,79.1 156.8,120.9 132.2,87.1' }],
  ],
  hilal: [
    [
      'defs',
      {},
      [
        [
          'mask',
          { id: '#m' },
          [
            ['rect', { width: 200, height: 200, fill: 'white' }],
            ['circle', { cx: 116, cy: 88, r: 52, fill: 'black' }],
          ],
        ],
      ],
    ],
    ['circle', { cx: 96, cy: 104, r: 60, fill: C, mask: 'url(#m)' }],
    [
      'g',
      { fill: A },
      [
        [
          'path',
          {
            d: 'M158 36 L161.4 44.6 L170 48 L161.4 51.4 L158 60 L154.6 51.4 L146 48 L154.6 44.6 Z',
          },
        ],
        [
          'path',
          {
            d: 'M170 110 L172.2 115.8 L178 118 L172.2 120.2 L170 126 L167.8 120.2 L162 118 L167.8 115.8 Z',
          },
        ],
        [
          'path',
          {
            d: 'M138 154 L140.8 161.2 L148 164 L140.8 166.8 L138 174 L135.2 166.8 L128 164 L135.2 161.2 Z',
          },
        ],
      ],
    ],
  ],
  defne: [
    [
      'g',
      { fill: 'none', stroke: C, 'stroke-width': 4, 'stroke-linecap': 'round' },
      [
        ['path', { d: 'M100 182 Q42 160 44 52' }],
        ['path', { d: 'M100 182 Q158 160 156 52' }],
      ],
    ],
    ellipses([
      [78, 172, -70],
      [64, 159, -55],
      [53, 143, -40],
      [44, 124, -28],
      [38, 101, -15],
      [36, 76, -5],
      [44, 44, 8],
      [122, 172, 70],
      [136, 159, 55],
      [147, 143, 40],
      [156, 124, 28],
      [162, 101, 15],
      [164, 76, 5],
      [156, 44, -8],
    ]),
    ['circle', { cx: 100, cy: 182, r: 7, fill: A }],
  ],
  konfeti: [
    [
      'g',
      { fill: C },
      [
        ['circle', { cx: 34, cy: 44, r: 7 }],
        ['circle', { cx: 166, cy: 154, r: 6 }],
        ['circle', { cx: 112, cy: 96, r: 5 }],
        ['rect', { x: 138, y: 60, width: 14, height: 14, transform: 'rotate(30 145 67)' }],
        ['polygon', { points: '40,160 52,138 64,160' }],
      ],
    ],
    [
      'g',
      { fill: A },
      [
        ['circle', { cx: 160, cy: 34, r: 5 }],
        ['circle', { cx: 64, cy: 112, r: 6 }],
        ['rect', { x: 88, y: 150, width: 12, height: 12, transform: 'rotate(20 94 156)' }],
        ['polygon', { points: '120,40 130,22 140,40' }],
      ],
    ],
    [
      'g',
      { fill: 'none', stroke: C, 'stroke-width': 5, 'stroke-linecap': 'round' },
      [
        ['path', { d: 'M70 30 q10 -14 20 0 t20 0' }],
        ['path', { d: 'M120 180 q10 -14 20 0 t20 0' }],
      ],
    ],
    [
      'g',
      { stroke: A, 'stroke-width': 5, 'stroke-linecap': 'round' },
      [
        ['line', { x1: 20, y1: 90, x2: 34, y2: 104 }],
        ['line', { x1: 176, y1: 96, x2: 186, y2: 82 }],
      ],
    ],
  ],
  kar: [
    [
      'g',
      { stroke: C, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' },
      [
        ['g', {}, flake],
        ['g', { transform: 'rotate(60 100 100)' }, flake],
        ['g', { transform: 'rotate(120 100 100)' }, flake],
      ],
    ],
    ['circle', { cx: 100, cy: 100, r: 9, fill: A }],
    [
      'g',
      { fill: A },
      [
        sparkle('M30 24 L32.8 31.2 L40 34 L32.8 36.8 L30 44 L27.2 36.8 L20 34 L27.2 31.2 Z'),
        sparkle(
          'M172 160 L174.2 165.8 L180 168 L174.2 170.2 L172 176 L169.8 170.2 L164 168 L169.8 165.8 Z',
        ),
      ],
    ],
  ],
  balon: [
    [
      'g',
      { fill: 'none', stroke: C, 'stroke-width': 2 },
      [
        ['path', { d: 'M70 122 q-8 20 4 40 t-2 30' }],
        ['path', { d: 'M118 104 q8 20 -4 40 t2 34' }],
        ['path', { d: 'M150 145 q-6 16 2 30' }],
      ],
    ],
    ['ellipse', { cx: 70, cy: 80, rx: 30, ry: 36, fill: C }],
    ['polygon', { points: '65,115 75,115 70,123', fill: C }],
    ['ellipse', { cx: 118, cy: 64, rx: 28, ry: 34, fill: A }],
    ['polygon', { points: '113,97 123,97 118,105', fill: A }],
    ['ellipse', { cx: 150, cy: 116, rx: 24, ry: 29, fill: C, opacity: 0.8 }],
    ['polygon', { points: '146,144 154,144 150,150', fill: C }],
  ],
  disli: [
    [
      'g',
      { fill: 'none', stroke: C },
      [
        ['circle', { cx: 92, cy: 96, r: 56, 'stroke-width': 18, 'stroke-dasharray': '13 9' }],
        ['circle', { cx: 92, cy: 96, r: 40, 'stroke-width': 20 }],
      ],
    ],
    ['circle', { cx: 92, cy: 96, r: 8, fill: A }],
    [
      'g',
      { fill: 'none', stroke: A },
      [
        ['circle', { cx: 156, cy: 152, r: 26, 'stroke-width': 10, 'stroke-dasharray': '9 7.34' }],
        ['circle', { cx: 156, cy: 152, r: 18, 'stroke-width': 10 }],
      ],
    ],
  ],
  gelincik: [
    [
      'g',
      { fill: 'none', stroke: LEAF, 'stroke-linecap': 'round' },
      [
        ['path', { d: 'M100 104 Q96 150 104 190', 'stroke-width': 4 }],
        ['path', { d: 'M150 148 Q148 170 152 192', 'stroke-width': 3 }],
      ],
    ],
    ['path', { d: 'M100 152 q-26 -6 -34 -24 q22 2 34 24 Z', fill: LEAF }],
    [
      'g',
      { fill: A },
      [
        ['circle', { cx: 84, cy: 76, r: 26 }],
        ['circle', { cx: 116, cy: 76, r: 26 }],
        ['circle', { cx: 86, cy: 98, r: 24 }],
        ['circle', { cx: 114, cy: 98, r: 24 }],
        ['circle', { cx: 140, cy: 132, r: 14 }],
        ['circle', { cx: 160, cy: 132, r: 14 }],
        ['circle', { cx: 150, cy: 146, r: 13 }],
      ],
    ],
    [
      'g',
      { fill: '#1b1b1b' },
      [
        ['circle', { cx: 100, cy: 88, r: 11 }],
        ['circle', { cx: 150, cy: 137, r: 6 }],
      ],
    ],
  ],
  lale: [
    [
      'line',
      {
        x1: 100,
        y1: 126,
        x2: 100,
        y2: 190,
        stroke: STEM,
        'stroke-width': 5,
        'stroke-linecap': 'round',
      },
    ],
    [
      'g',
      { fill: STEM },
      [
        ['path', { d: 'M100 178 C 80 170, 66 152, 64 130 C 82 140, 94 154, 100 178 Z' }],
        ['path', { d: 'M100 168 C 120 160, 134 142, 136 120 C 118 130, 106 144, 100 168 Z' }],
      ],
    ],
    [
      'g',
      { fill: C },
      [
        ['path', { d: 'M100 128 C 74 122, 64 92, 72 60 C 86 72, 94 88, 100 100 Z' }],
        ['path', { d: 'M100 128 C 126 122, 136 92, 128 60 C 114 72, 106 88, 100 100 Z' }],
      ],
    ],
    ['ellipse', { cx: 100, cy: 90, rx: 16, ry: 36, fill: A }],
  ],
  cicek: [
    [
      'g',
      { fill: C },
      [
        ['circle', { cx: 90, cy: 70, r: 15 }],
        ['circle', { cx: 109, cy: 83.8, r: 15 }],
        ['circle', { cx: 101.8, cy: 106.2, r: 15 }],
        ['circle', { cx: 78.2, cy: 106.2, r: 15 }],
        ['circle', { cx: 71, cy: 83.8, r: 15 }],
        ['circle', { cx: 150, cy: 133, r: 10 }],
        ['circle', { cx: 162.4, cy: 142, r: 10 }],
        ['circle', { cx: 157.6, cy: 156.5, r: 10 }],
        ['circle', { cx: 142.4, cy: 156.5, r: 10 }],
        ['circle', { cx: 137.6, cy: 142, r: 10 }],
        ['circle', { cx: 44, cy: 142, r: 7.5 }],
        ['circle', { cx: 53.5, cy: 148.9, r: 7.5 }],
        ['circle', { cx: 49.9, cy: 160.1, r: 7.5 }],
        ['circle', { cx: 38.1, cy: 160.1, r: 7.5 }],
        ['circle', { cx: 34.5, cy: 148.9, r: 7.5 }],
      ],
    ],
    [
      'g',
      { fill: A },
      [
        ['circle', { cx: 90, cy: 90, r: 10 }],
        ['circle', { cx: 150, cy: 146, r: 7 }],
        ['circle', { cx: 44, cy: 152, r: 5 }],
      ],
    ],
  ],
  kitap: [
    [
      'g',
      { fill: C },
      [
        ['path', { d: 'M100 76 C 80 64, 52 62, 30 68 L30 150 C 52 144, 80 146, 100 158 Z' }],
        ['path', { d: 'M100 76 C 120 64, 148 62, 170 68 L170 150 C 148 144, 120 146, 100 158 Z' }],
      ],
    ],
    [
      'g',
      { fill: 'none', stroke: A, 'stroke-width': 3, 'stroke-linecap': 'round' },
      [
        ['path', { d: 'M44 92 C 60 88, 76 90, 88 96' }],
        ['path', { d: 'M44 110 C 60 106, 76 108, 88 114' }],
        ['path', { d: 'M44 128 C 60 124, 76 126, 88 132' }],
        ['path', { d: 'M156 92 C 140 88, 124 90, 112 96' }],
        ['path', { d: 'M156 110 C 140 106, 124 108, 112 114' }],
        ['path', { d: 'M156 128 C 140 124, 124 126, 112 132' }],
      ],
    ],
    [
      'g',
      { transform: 'rotate(-30 140 44)' },
      [
        ['rect', { x: 104, y: 38, width: 62, height: 12, rx: 2, fill: A }],
        ['polygon', { points: '166,38 180,44 166,50', fill: C }],
      ],
    ],
  ],
  baret: [
    ['path', { d: 'M38 132 C 38 82, 64 56, 100 56 C 136 56, 162 82, 162 132 Z', fill: C }],
    ['rect', { x: 92, y: 56, width: 16, height: 76, rx: 6, fill: A }],
    ['rect', { x: 26, y: 128, width: 148, height: 16, rx: 8, fill: C }],
  ],
  fener: [
    ['line', { x1: 100, y1: 14, x2: 100, y2: 38, stroke: C, 'stroke-width': 3 }],
    ['circle', { cx: 100, cy: 42, r: 6, fill: 'none', stroke: C, 'stroke-width': 3 }],
    ['polygon', { points: '82,60 118,60 109,47 91,47', fill: C }],
    ['rect', { x: 74, y: 60, width: 52, height: 86, rx: 14, fill: C }],
    ['rect', { x: 86, y: 72, width: 28, height: 60, rx: 10, fill: A }],
    [
      'g',
      { stroke: C, 'stroke-width': 2 },
      [
        ['line', { x1: 100, y1: 72, x2: 100, y2: 132 }],
        ['line', { x1: 86, y1: 102, x2: 114, y2: 102 }],
      ],
    ],
    ['polygon', { points: '80,146 120,146 112,160 88,160', fill: C }],
    [
      'g',
      { fill: A },
      [
        sparkle('M40 50 L42.8 57.2 L50 60 L42.8 62.8 L40 70 L37.2 62.8 L30 60 L37.2 57.2 Z'),
        sparkle(
          'M162 84 L164.2 89.8 L170 92 L164.2 94.2 L162 100 L159.8 94.2 L154 92 L159.8 89.8 Z',
        ),
        sparkle(
          'M150 160 L152.8 167.2 L160 170 L152.8 172.8 L150 180 L147.2 172.8 L140 170 L147.2 167.2 Z',
        ),
      ],
    ],
  ],
  geometrik: [
    [
      'g',
      { fill: 'none', stroke: C, 'stroke-width': 6 },
      [
        ['rect', { x: 55, y: 55, width: 90, height: 90 }],
        ['rect', { x: 55, y: 55, width: 90, height: 90, transform: 'rotate(45 100 100)' }],
      ],
    ],
    ['circle', { cx: 100, cy: 100, r: 22, fill: A }],
    [
      'g',
      { fill: 'none', stroke: A, 'stroke-width': 3 },
      [
        ...geoPair(18, 18, 30, 30),
        ...geoPair(158, 18, 170, 30),
        ...geoPair(18, 158, 30, 170),
        ...geoPair(158, 158, 170, 170),
      ],
    ],
  ],
  yildizlar: [
    ['polygon', { fill: C, points: '100,56 123.5,128.4 62,83.6 138,83.6 76.5,128.4' }],
    [
      'g',
      { fill: A },
      [
        ['polygon', { points: '158,32 166.2,57.3 144.7,41.7 171.3,41.7 149.8,57.3' }],
        ['polygon', { points: '44,138 51,159.7 32.6,146.3 55.4,146.3 37,159.7' }],
        ['polygon', { points: '160,151 165.3,167.3 151.4,157.2 168.6,157.2 154.7,167.3' }],
      ],
    ],
  ],
  pasta: [
    ['rect', { x: 40, y: 160, width: 120, height: 7, rx: 3, fill: C }],
    ['rect', { x: 50, y: 110, width: 100, height: 50, rx: 8, fill: C }],
    ['rect', { x: 66, y: 80, width: 68, height: 34, rx: 8, fill: C, opacity: 0.85 }],
    [
      'path',
      { d: 'M50 126 q12.5 10 25 0 t25 0 t25 0 t25 0', fill: 'none', stroke: A, 'stroke-width': 5 },
    ],
    [
      'g',
      { fill: A },
      [
        ['rect', { x: 84, y: 58, width: 6, height: 22, rx: 2 }],
        ['rect', { x: 97, y: 58, width: 6, height: 22, rx: 2 }],
        ['rect', { x: 110, y: 58, width: 6, height: 22, rx: 2 }],
        ['ellipse', { cx: 87, cy: 50, rx: 4, ry: 6 }],
        ['ellipse', { cx: 100, cy: 50, rx: 4, ry: 6 }],
        ['ellipse', { cx: 113, cy: 50, rx: 4, ry: 6 }],
      ],
    ],
  ],
  rozet: [
    [
      'g',
      { fill: A },
      [
        ['polygon', { points: '78,120 64,182 84,170 96,186 100,128' }],
        ['polygon', { points: '122,120 136,182 116,170 104,186 100,128' }],
      ],
    ],
    ['circle', { cx: 100, cy: 92, r: 50, fill: C }],
    ['circle', { cx: 100, cy: 92, r: 38, fill: 'none', stroke: A, 'stroke-width': 4 }],
    ['polygon', { fill: A, points: '100,74 110.6,106.6 82.9,86.4 117.1,86.4 89.4,106.6' }],
  ],
  kivilcim: [
    [
      'path',
      {
        d: 'M96 54 L108.9 87.1 L142 100 L108.9 112.9 L96 146 L83.1 112.9 L50 100 L83.1 87.1 Z',
        fill: C,
      },
    ],
    [
      'g',
      { fill: A },
      [
        sparkle('M154 34 L159 47 L172 52 L159 57 L154 70 L149 57 L136 52 L149 47 Z'),
        sparkle(
          'M156 138 L159.4 146.6 L168 150 L159.4 153.4 L156 162 L152.6 153.4 L144 150 L152.6 146.6 Z',
        ),
      ],
    ],
  ],
  cizgi: [
    ['line', { x1: 36, y1: 100, x2: 164, y2: 100, stroke: C, 'stroke-width': 3 }],
    ['rect', { x: 93, y: 93, width: 14, height: 14, transform: 'rotate(45 100 100)', fill: A }],
  ],
};

/** Replace the colour tokens and the mask id in one attribute value. */
export function motifValue(value: string | number, color: string, accent: string, maskId: string) {
  if (value === C) return color;
  if (value === A) return accent;
  if (value === '#m') return maskId;
  if (value === 'url(#m)') return `url(#${maskId})`;
  return value;
}

const escapeAttr = (value: string | number) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function nodeToString(node: MotifNode, color: string, accent: string): string {
  const [tag, attrs, children = []] = node;
  const attrText = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(motifValue(v, color, accent, 'm'))}"`)
    .join('');
  const inner = children.map((child) => nodeToString(child, color, accent)).join('');
  return `<${tag}${attrText}>${inner}</${tag}>`;
}

/** The motif as a standalone SVG document. */
export function motifSvg(id: MotifId, color: string, accent: string, opacity = 1): string {
  const body = MOTIF_NODES[id].map((n) => nodeToString(n, color, accent)).join('');
  const group = opacity === 1 ? body : `<g opacity="${opacity}">${body}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${group}</svg>`;
}

/** A CSS url() for the motif, e.g. the band's background image. */
export function motifCssUrl(id: MotifId, color: string, accent: string, opacity = 1): string {
  return `url("data:image/svg+xml,${encodeURIComponent(motifSvg(id, color, accent, opacity))}")`;
}
