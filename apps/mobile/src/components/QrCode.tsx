/**
 * QrCode — draws a QR module matrix (computed server-side) as a grid of
 * Views, so neither app needs a QR/SVG library. Rows are run-length
 * merged for fewer Views. Optional centered Doondo mark.
 *
 * The matrix comes from the backend (`buildQrMatrix`), shared by the Score
 * credential and Doondo Collect QR.
 */

import { View } from 'react-native';
import { Text } from './Text';

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

const DOONDO_BLUE = '#2563EB';

function mergeRuns(row: boolean[]): Array<{ dark: boolean; len: number }> {
  const runs: Array<{ dark: boolean; len: number }> = [];
  for (const dark of row) {
    const last = runs[runs.length - 1];
    if (last && last.dark === dark) last.len += 1;
    else runs.push({ dark, len: 1 });
  }
  return runs;
}

export function QrCode({
  matrix,
  side: sidePx = 248,
  withMark = true,
}: {
  matrix: QrMatrix;
  side?: number;
  withMark?: boolean;
}) {
  const QUIET = 4;
  const total = matrix.size + QUIET * 2;
  const cell = Math.max(3, Math.floor(sidePx / total));
  const side = cell * total;
  const pad = QUIET * cell;
  const logo = Math.round(side * 0.2);

  return (
    <View style={{ width: side, height: side, backgroundColor: '#FFFFFF', padding: pad, borderRadius: 8 }}>
      {matrix.modules.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {mergeRuns(row).map((run, i) => (
            <View
              key={i}
              style={{ width: cell * run.len, height: cell, backgroundColor: run.dark ? '#0F172A' : '#FFFFFF' }}
            />
          ))}
        </View>
      ))}
      {withMark ? (
        <View
          style={{
            position: 'absolute',
            top: (side - logo) / 2,
            left: (side - logo) / 2,
            width: logo,
            height: logo,
            borderRadius: 9,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: logo - 10,
              height: logo - 10,
              borderRadius: 7,
              backgroundColor: DOONDO_BLUE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: logo * 0.46 }}>D</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
