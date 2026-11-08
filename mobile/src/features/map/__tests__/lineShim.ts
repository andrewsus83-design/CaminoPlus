// The compiled tests live in node_modules/.cache/<suite>, which is not where the app's files are, so the compiled copy of routeLines.ts
// (it requires '../../../assets/map/lines/...json', which is right in src/ and wrong in the compiled folder) cannot find the lines of the
// stages. This file, imported first by the test files that reach sampleRoute, answers such a request with the file in mobile/assets/map/lines
// (the tests run from mobile/). It changes nothing else: any other request is resolved as it always was. A suite that does not import it
// (places, lib, ...) finds no OSM line, and sampleRoute draws the hand-placed ones, which is the fallback working.
import Module from 'node:module';
import { join } from 'node:path';

const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function resolveLines(this: unknown, request: string, ...rest: unknown[]): string {
  const m = /(?:^|\/)assets\/map\/lines\/((?:camino-frances-\d\d)|manifest)\.json$/.exec(request);
  return m ? join(process.cwd(), 'assets', 'map', 'lines', `${m[1]}.json`) : resolveFilename.call(this, request, ...rest);
};
