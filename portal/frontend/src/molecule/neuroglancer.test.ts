import { canOpenInNeuroglancer, neuroglancerUrl } from './neuroglancer';

const stateOf = (url: string) => JSON.parse(decodeURIComponent(url.split('#!')[1]));

test('points one image layer at mrc-ng-server on the portal', () => {
  const url = neuroglancerUrl('https://d1.cloudfront.net', 'Mol9_gRNAde/CryoEM/Maps/map.mrc');
  expect(url.startsWith('/neuroglancer/#!')).toBe(true);
  const layer = stateOf(url).layers[0];
  expect(layer.type).toBe('image');
  expect(layer.name).toBe('map.mrc');
  expect(layer.source).toBe('zarr3://https://d1.cloudfront.net/mrc-ng-server/omezarr/Mol9_gRNAde/CryoEM/Maps/map.mrc');
});

test('encodes paths in the Neuroglancer source', () => {
  const layer = stateOf(neuroglancerUrl('https://h', 'Mol 9/Maps/a b#c.mrc')).layers[0];
  expect(layer.source).toBe('zarr3://https://h/mrc-ng-server/omezarr/Mol%209/Maps/a%20b%23c.mrc');
});

test('opens .mrc and .map files only', () => {
  expect(canOpenInNeuroglancer('M/a.MRC')).toBe(true);
  expect(canOpenInNeuroglancer('M/emd_75574.map')).toBe(true);
  expect(canOpenInNeuroglancer('M/10ZT.pdb')).toBe(false);
});
