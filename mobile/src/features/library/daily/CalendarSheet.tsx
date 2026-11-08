import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { layout, radius, role, scrim } from '@/theme';
import type { Range, Ym, Ymd } from './calendar';
import { MonthCalendar } from './MonthCalendar';

// The month calendar of the Daily reading screen, in a sheet from the bottom over everything, opened by the calendar button of the header. A day
// that is chosen closes it (the screen then picks that day and the strip moves to its week); its Today button picks today and closes it; the Close
// button, a tap on the dimmed part, the phone's back button and, in a browser, the Escape key all close it without changing anything. It is only
// drawn while it is open, so the month it starts on is always that of the picked day (the hook sets it when the button is pressed).
export type CalendarSheetProps = {
  shown: Ym;
  today: Ymd;
  selected: Ymd;
  range: Range;
  canGoBack: boolean;
  canGoForward: boolean;
  onSelect: (day: Ymd) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onClose: () => void;
};

export function CalendarSheet({ shown, today, selected, range, canGoBack, canGoForward, onSelect, onPrevious, onNext, onToday, onClose }: CalendarSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: scrim }}>
        {/* The dimmed part takes a tap and closes the sheet; the sheet is its sibling, so a tap on the sheet never reaches it. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Close the calendar" onPress={onClose} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
        <View
          accessibilityViewIsModal
          style={{ alignSelf: 'center', width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 12, paddingBottom: insets.bottom + 16, gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <AppText variant="h4" accessibilityRole="header">Calendar</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close calendar"
              onPress={onClose}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ height: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: role.border }}>
                <AppText variant="label" color={role.action}>Close</AppText>
              </View>
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            <MonthCalendar
              shown={shown}
              today={today}
              selected={selected}
              range={range}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onSelect={onSelect}
              onPrevious={onPrevious}
              onNext={onNext}
              onToday={onToday}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
