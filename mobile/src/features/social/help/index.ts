// Help bell ("Need help") for the Maps screen.
//
// A pilgrim in trouble taps the bell. The sheet puts "Call 112" first and biggest, finds a fresh position,
// and lets the pilgrim send "I need help" with that position to the friends and groups they choose, through
// the normal chat (direct chats via start_direct_chat, then the chat outbox: queued while offline, sent when signal
// returns, harmless to retry). Nothing outside the chosen chats ever sees it. It can also be shared by SMS or
// WhatsApp, because friends only see a chat message when they open the app (there are no push notifications yet).
// The sheet never claims more than it knows: CaminoPlus does not call anyone and cannot promise a friend will
// see the message in time, and "Sent" only appears once the message has reached the server.
//
// Use (Maps screen):
//   const [helpOpen, setHelpOpen] = useState(false);
//   <HelpBellButton tone={night ? 'night' : 'day'} onPress={() => setHelpOpen(true)} />
//   <HelpSheet visible={helpOpen} onClose={() => setHelpOpen(false)} position={fix ? { lat, lng, accuracyM, at } : null} placeText="about 2.1 km after Zubiri, stage 3" />
// Keep <HelpSheet> mounted (only `visible` changes): the bell that was rung and "I am OK now" live outside the sheet
// and survive closing it and restarting the app (one saved copy per account, wiped when signing out).
//
// Also exported: useHelp() (everything the sheet shows and does; the sheet is a thin view over it),
// isHelpMessage() / buildHelpMessage() / linkify() (the message format and the link splitter, covered by npm run test:social).
// The chat bubbles (components/chat.tsx) use bubble.tsx: help requests look different, and http(s) links are tappable.
export { HelpBellButton } from './HelpBellButton';
export { HelpSheet } from './HelpSheet';
export type { HelpSheetProps } from './HelpSheet';
export { useHelp } from './useHelp';
export { buildHelpMessage, isHelpMessage, linkify } from './logic';
export type { HelpFix, HelpPosition } from './logic';
