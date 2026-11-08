# Photos and videos that go to the cloud

Journey posts, chat photos and the profile picture are uploaded to cloud storage. Before a file leaves the phone it is made ready by `src/lib/media` (`prepareImage`, `prepareVideo`), and every storage call (upload, links, delete) is in one file, `src/lib/mediaStorage.ts`, so a later move to another store (for example Cloudflare R2) changes that file only. The diary keeps its photos and videos on the phone and is not part of this.

## The limits

All numbers are in `src/lib/media/limits.ts`, each with one sentence that says why. Pilgrim Plus has higher resolution photos and video.

| | Free | Pilgrim Plus |
|---|---|---|
| Post photos | up to 1,280 px on the long side, JPEG quality 0.8 | up to 3,840 px on the long side, JPEG quality 0.85 |
| Video | up to 720p, up to 60 seconds | up to 1080p, up to 60 seconds. 4K video is planned. |
| Chat photos | 1,280 px | 1,280 px |
| Profile picture | 512 px | 512 px |
| Thumbnail for grids and lists | 480 px | 480 px |
| Largest photo file | 10 MB | 20 MB |
| Largest video file | 25 MB | 45 MB |

A photo is never made larger than it is. Every file stays under the 50 MB Storage file limit of the project (a 60 s clip of 1080p at about 5 Mbit/s is about 38 MB). The profile picture is at most 5 MB (the limit of the `avatars` bucket).

What it costs: data sent out (egress), not stored bytes, is most of the bill. A full-size Plus photo viewed in a feed costs about ten times a small one, so grids, lists and the highlight circles show the 480 px thumbnail (`post_media.thumb_path`) and only the full-screen viewer loads the photo itself. Signed links are reused for 50 minutes, so the phone's image cache and the CDN can keep a photo instead of downloading it on every screen.

## What happens to a photo

1. The system photo picker opens (no permission question first: it needs none).
2. `prepareImage` shrinks it to the plan's long side and saves it again as JPEG. Saving again removes all EXIF data, including the GPS position, bakes in the orientation, and turns HEIC into JPEG. A post photo also gets a 480 px thumbnail from the same image.
3. `mediaStorage.upload` sends it. For every JPEG it first empties the GPS block of the EXIF data and removes XMP data (`src/lib/media/exif.ts`), so no photo goes up with its position, also on a build that could not save it again.
4. Before sharing, the composer checks the plan's free storage (the same `get_my_storage` answer Settings shows) and says plainly when there is not enough.

## What happens to a video

No video compressor is in the app yet. The best maintained one for React Native was checked for build 1.2.0 and left out: its current major version is a recent rewrite that adds a second native dependency, is tested against an older React Native than this app, and has open reports of build failures, missing 16 KB page support on Android, and broken output on some phones. A failed store build costs more than it gains.

So today:
- On iPhone the picker itself exports the clip at the plan's size (H.264 at 1280x720 on Free, 1920x1080 on Plus).
- On Android the clip goes up as it was recorded, as long as it is within the plan's file limit. A Free pilgrim on Android can therefore upload a 1080p clip if it is under 25 MB.
- A clip over 60 seconds, or over the file limit, is refused with a plain message ("This video is longer than 60 seconds. Trim it in your Photos app, then add it again.").
- The "Preparing your video… 40%" screen with Cancel is there and works; without a compressor it finishes at once. A compressor plugs into `compressor()` in `src/lib/media/index.ts` (shape `VideoCompressorLike` in `core.ts`); the tests already cover progress, cancel and a failing compressor.

## On a build without the new module

The development build of 1.1.0 has no `expo-image-manipulator`. Nothing crashes: the package is required only after `hasNativeModule()` says it is there (`src/lib/optionalNative.ts`), and every function falls back:
- Photos go up as the picker gives them (the picker's own JPEG quality 0.8 or 0.85, full size), if they are within the plan's file limit, with no thumbnail. The GPS block and XMP data are still removed on upload.
- Videos behave as above.

On the web the module works through the browser's canvas; there is no video compressor.

## How to test on a phone (build 1.2.0)

1. Free account. Write a journey post, pick a large photo (12 MP or more, for example straight from the camera). Share it. In the Supabase dashboard, Storage, `user-media`, `<your id>/posts/`: the photo is about 0.2 to 0.6 MB and 1,280 px on its long side; a `-thumb.jpg` next to it is about 30 to 60 KB.
2. Download that photo and look at its details (on a computer: any EXIF viewer). There is no location. The picture is the right way up.
3. Pick a photo taken in portrait and one HEIC photo from an iPhone: both come out as JPEG, the right way up.
4. Pick a video longer than 60 seconds: the message says so and the clip is left out.
5. Pick a clip of about 20 seconds filmed at 3840x2160. On iPhone it arrives at 720p. On Android it is refused if it is over 25 MB.
6. Chat: send a photo. In `user-media`, `<your id>/chat/`: 1,280 px, no location. Unsend it: the file is gone from Storage.
7. Change your profile picture: `avatars/<your id>/avatar.jpg` is 512 px.
8. Me, Journey grid: the tiles load the `-thumb.jpg` (Network panel of a web build, or the size of the download), the full-screen viewer the photo itself.
9. With a Pilgrim Plus account (set in the database for testing; it cannot be bought yet): the same photo is up to 3,840 px, a clip on iPhone arrives at 1080p.

## Still to do

- A server job that deletes files no row uses (orphans), for example after an app was closed in the middle of an upload.
- A poster image for videos (grids show a play mark).
- A video compressor, once one is safe for this React Native version.
