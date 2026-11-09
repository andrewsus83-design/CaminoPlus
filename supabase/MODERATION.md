# Moderation: reports from pilgrims

Pilgrims can report a post, a comment, a profile, a chat message, a stay review, a stay photo or a crowd report
(table `public.content_reports`). The app never shows the reports to anybody. You read and act on them in the
Supabase dashboard, **SQL editor** (it runs as `postgres`, which may read the private schema).

The App Store (guideline 1.2, user-generated content) and Google Play (user-generated content policy) ask for two
things: a way to report and block (the app has both), and **action by you within 24 hours**.

## The routine

- Look at the queue **twice a day** (morning and evening, your time).
- **Act within 24 hours** of a report: hide the thing, ban the person, or dismiss the report. Every report must
  end as `actioned` or `dismissed`.
- Once a day, run the digest (reports older than 12 hours). If it shows a row, deal with it first.
- When in doubt (threats, a child at risk, a crime), hide first, then decide.
- Keep your own short log of what you did and why (the `details` column is the reporter's text, not yours).

## 1. The queue

Open and reviewing reports, oldest first (migration `20261120030000_moderation_queue.sql`):

```sql
select report_id, age_hours, target_type, reason, open_reports_on_target,
       target_owner_username, target_moderation, preview, details, reporter_username, target_id, target_owner_id
from private.moderation_queue;
```

- `preview` is the post text, the comment, the review, the crowd report note, the photo path,
  `@username (name): bio` for a profile, and for a message the text (or photo path) that was saved when the
  report was sent, so you can still read it if the sender later unsent it.
- `open_reports_on_target`: how many people reported the same thing. Several reports usually mean act now.

While you look at a report, mark it so you know it is in hand:

```sql
update public.content_reports set status = 'reviewing' where id = '<report_id>';
```

## 2. Daily digest (reports older than 12 hours)

```sql
select count(*) as waiting, max(age_hours) as oldest_hours,
       string_agg(target_type || ' ' || reason || ': ' || left(preview, 60), E'\n' order by reported_at) as items
from private.moderation_queue
where age_hours >= 12;
```

## 3. Hide something

Hidden content disappears for everybody except its author (the row policies only show `moderation_status = 'ok'`
to others). Use `hidden` for "not shown while I decide" and `removed` for "this broke the rules". Both are
reversible: set `'ok'` again.

```sql
-- a post
update public.posts         set moderation_status = 'removed' where id = '<target_id>';
-- a comment
update public.post_comments set moderation_status = 'removed' where id = '<target_id>';
-- a stay review
update public.stay_reviews  set moderation_status = 'removed' where id = '<target_id>';
-- a stay photo
update public.stay_photos   set moderation_status = 'removed' where id = '<target_id>';
-- a crowd report
update public.crowd_reports set moderation_status = 'removed' where id = '<target_id>';
```

A chat message: messages are only seen by the people in that chat. Unsend it for everybody (the text and photo
link are cleared; the evidence stays in the report). First note the photo path, if there is one:

```sql
select media_path from public.messages where id = '<target_id>';
update public.messages set deleted_at = now(), body = null, media_path = null where id = '<target_id>';
```

Unsending leaves the photo file itself in storage. Delete it in the dashboard: **Storage > user-media**, open the
folder of the path you noted (`<sender id>/chat/<conversation id>/`) and delete that file. (Supabase does not let
SQL delete storage files; the dashboard or the Storage API does.)

## 4. Ban a person

Banning stops sign-in and token refresh (the app is logged out within about an hour, when its token expires).
Also hide what they posted if it breaks the rules.

The easiest way: dashboard, **Authentication > Users**, the user, **Ban user**. In SQL, use a date far in the future,
never the word `infinity` (the sign-in server may then fail to load that user, and the dashboard's user list with it):

```sql
-- ban
update auth.users set banned_until = now() + interval '100 years' where id = '<target_owner_id>';
-- end their sessions now (the token the phone holds still works for up to one hour)
delete from auth.sessions where user_id = '<target_owner_id>';
-- hide everything they posted
update public.posts         set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.post_comments set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.stay_reviews  set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.stay_photos   set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.crowd_reports set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';

-- lift a ban
update auth.users set banned_until = null where id = '<target_owner_id>';
```

To delete an account completely (their data and files), use the `delete-account` flow, not SQL: it also removes
their storage files.

## 5. Close the report

```sql
-- you acted (hid, removed, banned)
update public.content_reports set status = 'actioned', resolved_at = now()
where target_type = '<target_type>' and target_id = '<target_id>' and status in ('open', 'reviewing');

-- nothing wrong
update public.content_reports set status = 'dismissed', resolved_at = now()
where id = '<report_id>';
```

The `where target_type ... target_id` form closes every report about the same thing at once.

## 6. Be told when a report arrives

**Never send the report row itself anywhere.** A report row can hold private data: for a reported chat message,
`evidence` holds the message text, the sender and the conversation; `details` is what the reporter wrote. A
Database Webhook sends the whole row, so a webhook that posts straight to ntfy (or any public topic, chat or email)
would publish private messages. Send only the report id, its type and its reason, and read the rest in the SQL
editor.

### Push to your phone (ntfy), through a small Edge Function

1. Install the ntfy app (iOS or Android) and subscribe to a topic with a long random name (for example 24 random
   letters). On the public ntfy.sh server anybody who knows the topic name can read it: treat the name like a
   password, keep it out of the repository and out of chats.
2. Set three secrets in **Dashboard > Edge Functions > Secrets** (values only there, never in code):
   `NTFY_TOPIC_URL` (`https://ntfy.sh/<your topic>`), `REPORT_WEBHOOK_SECRET` (a long random text you make up),
   and, only if your ntfy topic needs one, `NTFY_TOKEN`.
3. Create an Edge Function named `report-alert` with this code (it is not in this repository; it forwards only
   id, type and reason):

   ```ts
   Deno.serve(async (req) => {
     if (req.headers.get('x-report-secret') !== Deno.env.get('REPORT_WEBHOOK_SECRET')) return new Response('no', { status: 401 });
     const { record } = await req.json().catch(() => ({ record: null }));
     if (!record?.id) return new Response('ok');
     const headers: Record<string, string> = { Title: 'CaminoPlus: new report', Priority: 'high', Tags: 'warning' };
     const token = Deno.env.get('NTFY_TOKEN');
     if (token) headers.Authorization = `Bearer ${token}`;
     // only these three fields leave the database: never body, evidence, details or any user id
     const text = `${String(record.target_type)} reported for ${String(record.reason)}. Report ${String(record.id)}`;
     await fetch(Deno.env.get('NTFY_TOPIC_URL')!, { method: 'POST', headers, body: text });
     return new Response('ok');
   });
   ```

   Turn off "Verify JWT" for this function (the shared secret header protects it instead).
4. Dashboard: **Database > Webhooks > Create a new hook**: name `report-alert`, table `public.content_reports`,
   event `Insert`, type **Supabase Edge Functions**, function `report-alert`, and the HTTP header
   `x-report-secret` with the value of `REPORT_WEBHOOK_SECRET`.
5. Report your own test post from the app and check the phone: it must say only the type, the reason and the id.

### Email

ntfy can forward each notification by email: in the function, add the header `Email` with your address to
`headers` (the public ntfy.sh server sends only a few emails a day). For email through your own sender (for example
Resend), change the `fetch` in the function to that sender's API, with its key in a secret named, for example,
`MODERATION_EMAIL_API_KEY` and your address in `MODERATION_EMAIL_TO`. Send the same short text: type, reason, id.

## Limits that protect you

Migration `20261120010000_rate_limits.sql` caps what one account can do: 20 posts a day, 60 comments an hour,
300 likes and 300 saves an hour, 100 follows a day, 30 reports a day, 30 friend requests a day (and 30 days of
quiet after a request is declined), 30 searches a minute. A spammer hits these quickly; real pilgrims do not.
