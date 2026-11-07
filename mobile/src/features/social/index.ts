// Public surface of the social module (friends, chat, notifications).
// Other screens import only from '@/features/social'. The Me tab uses useUnreadTotals() for the
// bell badge; the screens in app/inbox.tsx, app/chat/** and app/friends.tsx use the hooks below.
export type {
  BlockedPilgrim, ChatMessage, Conversation, Friend, FriendRequest, FriendStatus, Member, NotificationItem, OutboxItem, PilgrimResult, ReportReason, ReportTarget, UnreadTotals,
} from './types';
export { NO_UNREAD } from './logic';
export { socialApi, SocialError } from './api';
export { useUnreadTotals, refreshUnreadTotals } from './hooks/unread';
export { useConversations } from './hooks/conversations';
export { useNotifications } from './hooks/notifications';
export { useFriendsData, useFriendList, useHasFriends, usePilgrimSearch } from './hooks/friends';
export { useChat } from './hooks/chat';
export { useChatInfo, reportMessage } from './hooks/chatInfo';
// Report and block anything or anybody with the same sheets (the friends list uses it; the future feed and the
// journey viewer call useSafety().report({ type: 'post' | 'comment', ... }) or reportContent()).
export { useSafety, reportContent } from './hooks/safety';
export type { Who } from './hooks/safety';
export { useBlockedPilgrims } from './hooks/blocked';
export { useMeId, useNow, useOnlineStatus } from './hooks/base';
export { useRealtimeStatus } from './realtime';
export { flush as flushChatOutbox } from './outbox';
export { HelpBellButton, HelpSheet, useHelp, isHelpMessage } from './help';
