// mrc-ng-server reads any MRC-format file under its root; .map is MRC under another name.
const EXTENSIONS = ['.mrc', '.map'];

export function canOpenInNeuroglancer(path: string): boolean {
  const lower = path.toLowerCase();
  return EXTENSIONS.some(e => lower.endsWith(e));
}

// A link to the portal's own Neuroglancer with one image layer reading the map from
// mrc-ng-server (OME-Zarr, full resolution). Everything stays on the portal's origin, so the
// login cookie goes with every request and edge_auth lets it through.
export function neuroglancerUrl(origin: string, mapPath: string): string {
  const encodedPath = mapPath.split('/').map(encodeURIComponent).join('/');
  const state = {
    layers: [
      {
        type: 'image',
        // zarr3://, as in ai-cryoet: Neuroglancer centres OME-Zarr voxels correctly.
        source: `zarr3://${origin}/mrc-ng-server/omezarr/${encodedPath}`,
        name: mapPath.split('/').pop()
      }
    ],
    layout: '4panel'
  };
  return `/neuroglancer/#!${encodeURIComponent(JSON.stringify(state))}`;
}
