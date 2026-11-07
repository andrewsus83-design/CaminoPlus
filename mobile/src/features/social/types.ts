// Shapes of the rows the social screens read. They mirror the database contract
// (friends, conversations, messages, notifications) and are typed by hand.
// No React Native imports here so the pure logic and its tests can use them.

export type UnreadTotals = {
  notifications: number;  // unread notifications
  chats: number;          // unread messages in direct chats
  groups: number;         // unread messages in group chats
  friendRequests: number; // incoming friend requests waiting for an answer
  total: number;          // notifications + chats + groups (what the bell badge shows)
};

export type ConversationKind = 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';

/** One row of list_conversations(). For a direct chat `title` is the peer's name. */
export type Conversation = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  avatar_url: string | null;
  peer_id: string | null;
  peer_username: string | null;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  member_count: number;
  last_message_id: string | null;
  last_message_preview: string | null;
  last_message_sender: string | null;
  last_message_sender_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  muted_until: string | null;
  my_role: MemberRole | null;
};

/** One row of list_conversation_members(). last_read_at is the read cursor (read receipts). */
export type Member = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: MemberRole;
  joined_at: string | null;
  last_read_at: string | null;
};

export type MessageKind = 'text' | 'image' | 'system';

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  reply_to: string | null;
  client_created_at: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at: string | null; // set = unsent
};

/** queued = waiting for a connection, sending = request in flight, failed = the server said no. */
export type OutboxStatus = 'queued' | 'sending' | 'failed';

/** A message that is not on the server yet. Persisted so it survives an app restart. */
export type OutboxItem = {
  id: string; // client generated uuid, also the message id on the server (idempotent)
  user_id: string;
  conversation_id: string;
  kind: 'text' | 'image';
  body: string | null;
  reply_to: string | null;
  client_created_at: string;
  local_uri: string | null;  // image still on this phone
  mime: string | null;
  media_path: string | null; // set once the upload finished (so a retry does not upload twice)
  status: OutboxStatus;
  attempts: number;
  error: string | null;
};

/** A message as the chat list shows it: a server row, or an outbox item dressed as one. */
export type TimelineMessage = ChatMessage & {
  local?: OutboxStatus;
  local_uri?: string | null;
  local_error?: string | null; // why it failed (failed items only)
};

export type Delivery = 'sending' | 'sent' | 'seen' | 'failed';

export type DateEntry = { kind: 'date'; key: string; label: string };
export type UnreadEntry = { kind: 'unread'; key: string };
export type SystemEntry = { kind: 'system'; key: string; message: TimelineMessage };
export type MessageEntry = {
  kind: 'message';
  key: string;
  message: TimelineMessage;
  mine: boolean;
  first: boolean;      // first bubble of a cluster (same sender, close in time)
  last: boolean;       // last bubble of a cluster
  showSender: boolean; // groups: name + avatar on the first bubble of someone else's cluster
  delivery: Delivery | null;
  seenBy: number;
  seenLabel: string | null; // "Seen" / "Seen by 3" under my newest message
};
export type TimelineEntry = DateEntry | UnreadEntry | SystemEntry | MessageEntry;

export type NotificationKind = 'friend_request' | 'friend_accepted' | 'group_added' | 'post_like' | 'post_comment' | 'achievement' | 'system';

export type NotificationActor = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };

export type NotificationItem = {
  id: string;
  kind: NotificationKind | string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  actor: NotificationActor | null;
};

export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends';

export type Friend = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  km_walked: number | null;
  since: string | null;
};

export type FriendRequest = {
  direction: 'incoming' | 'outgoing';
  id: string; // the OTHER person's profile id
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
};

export type PilgrimResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_private: boolean;
  friend_status: FriendStatus;
};

/** What get_my_storage() returns (only the fields chat needs). */
export type StorageInfo = {
  has_plus: boolean;
  quota_bytes: number;
  used_bytes: number;
  remaining_bytes: number;
};

export type ReportReason = 'spam' | 'nudity' | 'harassment' | 'violence' | 'hate' | 'misinformation' | 'privacy' | 'other';

/** What a report can be about (content_reports.target_type): a chat message, a person, a post or a comment. */
export type ReportTarget = 'message' | 'profile' | 'post' | 'comment';

/** One row of list_blocked_pilgrims(): somebody I blocked. Name and picture are null for a deleted account. */
export type BlockedPilgrim = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
};
