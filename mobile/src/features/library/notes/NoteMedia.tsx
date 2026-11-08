import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { FIXED } from '@/components/fixedColors';
import { device } from '@/features/diary/device';
import { Face } from '@/features/diary/MediaTiles';
import type { DiaryMedia } from '@/features/diary/media';
import { radius, role } from '@/theme';
import { MEDIA_GAP, MEDIA_RATIO, mediaPlan, tileLabel } from './timeline';

// The photos and videos of a note, as the grid of a post: one wide tile, two side by side, one tall and two stacked, two by two, always
// 16 : 9 (timeline.ts mediaPlan has the shapes). The corners of the grid are round and the lines between the tiles are square, so the
// tiles are drawn with no corner of their own. Each tile is the diary's own (MediaTiles.tsx Face): the picture, the dark tile with the
// play mark and the length of a clip, or the calm tile of a file that is not on this phone. A tap on a tile opens the full-screen viewer
// on that one; behind the last tile "+N" says there are more, and the viewer swipes to them. A tile whose file is not here cannot be
// pressed, so a tap on it opens the note like a tap anywhere else on the row.

function Tile({ uid, m, index, count, small, more, onOpen }: { uid: string; m: DiaryMedia; index: number; count: number; small: boolean; more: number; onOpen: (index: number) => void }) {
  const here = useMemo(() => device.fileUri(uid, m.name) !== null, [uid, m.name]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(m, index, count, here, more)}
      disabled={!here}
      onPress={() => onOpen(index)}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}
    >
      <Face uid={uid} m={m} small={small} corner={0} compact />
      {more > 0 && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="h4" color={FIXED.onPhoto}>{`+${more}`}</AppText>
        </View>
      )}
    </Pressable>
  );
}

export function NoteMedia({ uid, items, onOpen }: { uid: string; items: DiaryMedia[]; onOpen: (index: number) => void }) {
  const plan = mediaPlan(items.length);
  if (plan.kind === 'none') return null;
  return (
    <View style={{ aspectRatio: MEDIA_RATIO, borderRadius: radius.md, overflow: 'hidden', flexDirection: 'row', gap: MEDIA_GAP, backgroundColor: role.bg }}>
      {plan.columns.map((column, c) => (
        <View key={c} style={{ flex: 1, gap: MEDIA_GAP }}>
          {column.map((k) => (
            <Tile key={items[k].id} uid={uid} m={items[k]} index={k} count={items.length} small={column.length > 1} more={k === plan.shown - 1 ? plan.more : 0} onOpen={onOpen} />
          ))}
        </View>
      ))}
    </View>
  );
}
