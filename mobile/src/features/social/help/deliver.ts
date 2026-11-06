// Puts the help message into the chat outbox of every chosen chat. The outbox does the rest: the message
// shows up at once, is sent as soon as there is signal, and a retry is harmless (the client id is the message id).
import { isOfflineError, withTimeout } from '@/lib/net';
import { socialApi } from '../api';
import { friendlyError, newId } from '../logic';
import { enqueue } from '../outbox';
import { recipientKey, type HelpSend, type Recipient, type SendKind } from './logic';

const START_TIMEOUT_MS = 8_000;

const startError = (e: unknown) =>
  isOfflineError(e) || (e instanceof Error && e.message === 'timeout')
    ? 'This chat can only be started with a connection. Try again with signal, or send an SMS.'
    : friendlyError(e, 'This chat could not be started.');

/** A friend's direct chat is started once (start_direct_chat) when it does not exist yet; groups and known chats go straight to the outbox.
 *  Never throws: a chat that cannot be started comes back as a send with an `error` and no message id. */
export async function deliver(o: { uid: string; recipients: readonly Recipient[]; body: string; kind: SendKind; now: number }): Promise<{ sends: HelpSend[]; chats: Record<string, string> }> {
  const chats: Record<string, string> = {}; // friend id -> direct chat id learned now
  const sends = await Promise.all(o.recipients.map(async (r): Promise<HelpSend> => {
    const base = { id: newId(), kind: o.kind, recipientKey: recipientKey(r), body: o.body, at: o.now, sentAt: null };
    let chatId = r.chatId;
    if (!chatId) {
      try {
        chatId = await withTimeout(socialApi.startDirectChat(r.id), START_TIMEOUT_MS, 'timeout');
        chats[r.id] = chatId;
      } catch (e) {
        return { ...base, chatId: null, messageId: null, error: startError(e) };
      }
    }
    const messageId = newId();
    enqueue({
      id: messageId, user_id: o.uid, conversation_id: chatId, kind: 'text', body: o.body, reply_to: null,
      client_created_at: new Date(o.now).toISOString(), local_uri: null, mime: null, media_path: null,
    });
    return { ...base, chatId, messageId, error: null };
  }));
  return { sends, chats };
}
