// Picking friends: used by "New group" and by "Add pilgrims" in the group info screen.
import { ReactNode, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { c, radius } from '@/theme';
import { filterPeople, personName } from '../logic';
import type { Friend } from '../types';
import { SearchField } from './primitives';
import { PersonRow } from './rows';

/** Round check mark: filled blue with a tick when picked, an empty ring otherwise. */
export function SelectMark({ on }: { on: boolean }) {
  return (
    <View style={{ width: 32, height: 32, borderRadius: radius.pill, borderWidth: 2, borderColor: on ? c.blue : c.sand400, backgroundColor: on ? c.blue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Icon name="check" color={c.parchment} size={18} strokeWidth={2.6} />}
    </View>
  );
}

type Props = {
  friends: Friend[];
  selected: ReadonlySet<string>;
  onToggle: (f: Friend) => void;
  disabled?: ReadonlySet<string>;   // already in the group
  header?: ReactNode;               // shown above the search field
  empty?: ReactNode;                // when I have no friends at all
  bottomSpace?: number;
};

export function FriendPickList({ friends, selected, onToggle, disabled, header, empty, bottomSpace = 24 }: Props) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterPeople(friends, query), [friends, query]);
  return (
    <FlatList
      data={shown}
      keyExtractor={(f) => f.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: bottomSpace }}
      ListHeaderComponent={
        <View>
          {header}
          {friends.length > 0 && <View style={{ paddingHorizontal: 24, paddingVertical: 10 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search your friends" label="Search your friends" /></View>}
        </View>
      }
      ListEmptyComponent={friends.length === 0 ? <>{empty}</> : <View style={{ padding: 32, alignItems: 'center' }}><PersonHint text={`No friend matches "${query.trim()}".`} /></View>}
      renderItem={({ item: f }) => {
        const name = personName(f);
        const already = disabled?.has(f.id);
        const on = already || selected.has(f.id);
        return (
          <PersonRow
            name={name} username={f.username} detail={already ? 'Already in the group' : null} uri={f.avatar_url} seed={f.id} selected={on}
            accessibilityLabel={already ? `${name}, already in the group` : name}
            onPress={already ? undefined : () => onToggle(f)}
            trailing={already ? <View style={{ opacity: 0.45 }}><SelectMark on /></View> : <SelectMark on={on} />}
          />
        );
      }}
    />
  );
}

const PersonHint = ({ text }: { text: string }) => <AppText variant="small" muted style={{ textAlign: 'center' }}>{text}</AppText>;
