// One-off: bring the stored dimensions of the CNC remnant plates (fire plakalar)
// into the one format the forms now enforce, "<genişlik>x<yükseklik>" in mm
// ("1200x800"). Uses the same normaliser as the page.
//
//   GEMKOM_API=https://<backend>  GEMKOM_TOKEN=<access token>  \
//     node --experimental-strip-types scripts/fix-remnant-dimensions.mjs [--apply]
//
// GEMKOM_TOKEN is the JWT the app keeps in localStorage.accessToken (it
// expires after a while). Without --apply nothing is written: the script
// prints what it would change and what it cannot fix. With --apply it PATCHes
// only the `dimensions` of the fixable plates. The ones it cannot fix are left
// for a person: the page lists them under "Boyut Formatı: Hatalı format".

import {
  isCanonicalDimensions,
  normalizeDimensions,
} from '../src/pages/manufacturing/cnc-cutting/remnants/dimensions.ts';

const api = process.env.GEMKOM_API?.replace(/\/+$/, '');
const token = process.env.GEMKOM_TOKEN;
const apply = process.argv.includes('--apply');

if (!api || !token) {
  console.error('GEMKOM_API and GEMKOM_TOKEN are required (see the header of this file).');
  process.exit(1);
}

async function request(path, init = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

// The list hides fully used plates unless `unassigned` is sent; true and false
// together are every plate. (false can return a plate once per cut using it.)
async function allPlates() {
  const byId = new Map();
  for (const unassigned of ['true', 'false']) {
    for (let page = 1; ; page += 1) {
      const data = await request(
        `/cnc_cutting/remnants/?unassigned=${unassigned}&page_size=1000&page=${page}`,
      );
      const results = Array.isArray(data) ? data : data.results;
      for (const plate of results) byId.set(plate.id, plate);
      if (Array.isArray(data) || !data.next || results.length === 0) break;
    }
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

const plates = await allPlates();
const fixable = [];
const unfixable = [];
for (const plate of plates) {
  if (isCanonicalDimensions(plate.dimensions)) continue;
  const fixed = normalizeDimensions(plate.dimensions);
  if (fixed) fixable.push({ id: plate.id, from: plate.dimensions, to: fixed });
  else unfixable.push({ id: plate.id, dimensions: plate.dimensions, material: plate.material });
}

console.log(
  `${plates.length} plates, ${fixable.length} fixable, ${unfixable.length} to fix by hand.`,
);
if (fixable.length) {
  console.log('\nFixable:');
  console.table(fixable);
}
if (unfixable.length) {
  console.log('\nCannot be fixed automatically (fix on the page):');
  console.table(unfixable);
}

if (!apply) {
  if (fixable.length)
    console.log('\nDry run: nothing written. Run again with --apply to save the fixes.');
  process.exit(0);
}

let saved = 0;
for (const { id, to } of fixable) {
  try {
    await request(`/cnc_cutting/remnants/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ dimensions: to }),
    });
    saved += 1;
  } catch (error) {
    console.error(`Plate ${id}: ${error.message}`);
  }
}
console.log(`\nSaved ${saved} of ${fixable.length}.`);
