// Public surface of the social module (friends, chat, notifications).
// Other screens import only from '@/features/social'. The Me tab uses useUnreadTotals() for the
// bell badge; the screens in app/inbox.tsx, app/chat/** and app/friends.tsx use the hooks below.
export type {
  ChatMessage, Conversation, Friend, FriendRequest, FriendStatus, Member, NotificationItem, OutboxItem, PilgrimResult, ReportReason, UnreadTotals,
} from './types';
export { NO_UNREAD } from './logic';
export { socialApi, SocialError } from './api';
export { useUnreadTotals, refreshUnreadTotals } from './hooks/unread';
export { useConversations } from './hooks/conversations';
export { useNotifications } from './hooks/notifications';
export { useFriendsData, useFriendList, useHasFriends, usePilgrimSearch } from './hooks/friends';
export { useChat } from './hooks/chat';
export { useChatInfo, reportMessage } from './hooks/chatInfo';
export { useMeId, useNow, useOnlineStatus } from './hooks/base';
export { useRealtimeStatus } from './realtime';
export { flush as flushChatOutbox } from './outbox';
