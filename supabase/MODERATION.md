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
link are cleared; the evidence stays in the report):

```sql
update public.messages set deleted_at = now(), body = null, media_path = null where id = '<target_id>';
```

## 4. Ban a person

Banning stops sign-in and token refresh (the app is logged out within about an hour, when its token expires).
Also hide what they posted if it breaks the rules.

```sql
-- ban (dashboard alternative: Authentication > Users > the user > Ban user)
update auth.users set banned_until = 'infinity' where id = '<target_owner_id>';
-- end their sessions now
delete from auth.sessions where user_id = '<target_owner_id>';
-- hide everything they posted
update public.posts         set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.post_comments set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';
update public.stay_reviews  set moderation_status = 'removed' where user_id = '<target_owner_id>' and moderation_status = 'ok';

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

### Push to your phone (ntfy)

1. Install the ntfy app (iOS or Android) and subscribe to a topic with a long random name (for example 24 random
   letters). On the public ntfy.sh server **anybody who knows the topic name can read it**, so treat the name like
   a password: keep it out of the repository and out of chats.
2. Dashboard: **Database > Webhooks > Create a new hook**.
   - Name: `report-alert`
   - Table: `public.content_reports`, Events: `Insert`
   - Type: HTTP Request, Method: `POST`, URL: `https://ntfy.sh/<your topic>`
   - HTTP headers: `Title: CaminoPlus: new report`, `Priority: high`, `Tags: warning`
3. Send a test report from the app (report your own test post) and check the phone.

The webhook sends the whole new row as JSON (report id, type, reason, the reporter's id and their details text).
That is personal data on a third-party server: if you prefer, run your own ntfy server, or use an ntfy access
token (set it as the `Authorization: Bearer ...` header of the webhook; store the token only in the dashboard,
never in this repository). Name it `NTFY_TOKEN` in your own notes.

### Email

The ntfy.sh server can forward a notification as an email: add the header `Email: <your address>` to the same
webhook (the public server limits how many emails it sends a day). For email through your own sender (for
example Resend), a small Edge Function is needed that formats the email; it is not in this repository yet. It would
read the sender key from a Supabase secret named, for example, `MODERATION_EMAIL_API_KEY` and the address from
`MODERATION_EMAIL_TO`; set those in Dashboard > Edge Functions > Secrets, never in code.

## Limits that protect you

Migration `20261120010000_rate_limits.sql` caps what one account can do: 20 posts a day, 60 comments an hour,
300 likes and 300 saves an hour, 100 follows a day, 30 reports a day, 30 friend requests a day (and 30 days of
quiet after a request is declined), 30 searches a minute. A spammer hits these quickly; real pilgrims do not.
