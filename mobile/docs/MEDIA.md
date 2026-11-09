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

1. The composer first gets the plan (the saved answer, or it asks the server). If it cannot tell, it uses the Free sizes and says so under the slides: "Sizes for the Free plan. Your plan could not be checked."
2. The system photo picker opens (no permission question first: it needs none).
3. `prepareImage` shrinks the photo to the plan's long side and saves it again as JPEG. Saving again removes all EXIF data, including the GPS position, bakes in the orientation, and turns HEIC into JPEG. A post photo also gets a 480 px thumbnail from the same image. Cancel stops it: nothing from that pick is added, and the files made so far are deleted.
4. If the photo cannot be saved again (no module, or a file the module cannot read), the original goes up only when it is a JPEG. Anything else, HEIC above all, would keep its position and is refused: "We could not remove the place where this photo was taken, so it cannot be shared. Try another photo."
5. `mediaStorage.upload` sends it, through `src/lib/media/clean.ts`: the type is read from the file's first bytes (not from its name), and every JPEG loses its location (`exif.ts`): the GPS block of every EXIF block in the file is emptied (also one that only IFD1 points to, one no pointer leads to, and the one of a second image inside the file), and XMP and Photoshop/IPTC blocks become empty comments. The length of the file does not change, so the picture still decodes. Any image that is not a JPEG by its bytes is refused.
6. Before sharing, the composer checks the plan's free storage (the same `get_my_storage` answer Settings shows) and says plainly when there is not enough.

What is not covered, honestly:
- Location text inside an XMP or IPTC block whose segment header is broken (no phone camera writes that).
- Data after a JPEG's end marker, such as the video inside a "motion photo". It only goes up when the photo could not be saved again (the saved copy has none).
- On that same fallback path, the HDR gain map's XMP of an Ultra HDR photo is blanked with the other XMP, so the photo loses its HDR effect (it stays a normal photo).

## What happens to a video

No video compressor is in the app yet. The best maintained one for React Native was checked for the 1.2.0 build and left out: its current major version is a recent rewrite that adds a second native dependency, is tested against an older React Native than this app, and has open reports of build failures, missing 16 KB page support on Android, and broken output on some phones. A failed store build costs more than it gains.

So today:
- On iPhone the picker itself exports the clip at the plan's size (H.264 at 1280x720 on Free, 1920x1080 on Plus).
- On Android the clip goes up as it was recorded, as long as it is within the plan's file limit. A Free pilgrim on Android can therefore upload a 1080p clip if it is under 25 MB.
- A clip over 60 seconds, or over the file limit, is refused with a plain message ("This video is longer than 60 seconds. Trim it in your Photos app, then add it again.").
- Only MP4 and MOV clips are taken. Others (3GP, WebM) are refused when picked: "This file type is not supported. Use a photo or an MP4 or MOV video."
- The place where a clip was recorded is removed on upload (`src/lib/media/videoLocation.ts`): the `©xyz` box in `moov/udta` (also inside a track), the 3GPP `loci` box and an XMP box (`udta/XMP_`) become empty `free` boxes of the same size; the `com.apple.quicktime.location.ISO6709` item of `moov/meta` (and an iTunes-style `©xyz` item) gets spaces instead of its value; a top-level XMP `uuid` box is blanked. Only the box headers are read (the picture data is jumped over), nothing moves, and the clip plays as before. Checked with ffmpeg and ffprobe on clips ffmpeg made (an Android-style MP4, an iPhone-style MOV, a fast-start and a fragmented MP4, a 37 MB clip): no location tag is left, and every clip decodes. Not yet checked on clips from real phones (see the test list below).
- A clip whose boxes do not add up (cut short, a size that lies, a box longer than the one it is in, nesting deeper than eight levels) is refused when it is picked: "We could not remove the place where this video was recorded, so it cannot be shared. Try another video." After cleaning, every box that holds text (titles, tags, XMP; not the sample tables) is searched once more for a position in the form phones write (+42.8800-008.5450) or an XMP GPS property; if any is left, the clip is refused too. A Samsung "SEF" trailer after the last box is accepted, untouched, when no position is written in it.
- A HEIC or AVIF photo that says it is a video (its brands are those of a photo) is refused.
- Not covered: a timed GPS track inside the clip (`gpmd`, as action cameras write, or a `mebx` metadata track). iPhones write `mebx` tracks for other data; we have not seen a position in them, but this was not checked on real clips.
- The "Preparing your video… 40%" screen with Cancel is there and works; without a compressor it finishes at once. A compressor plugs into `compressor()` in `src/lib/media/index.ts` (shape `VideoCompressorLike` in `core.ts`); the tests already cover progress, cancel and a failing compressor.

## On a build without the new module

The development build of 1.1.0 has no `expo-image-manipulator`. Nothing crashes: the package is required only after `hasNativeModule()` says it is there (`src/lib/optionalNative.ts`), and every function falls back:
- Photos go up as the picker gives them (the picker's own JPEG quality 0.8 or 0.85, full size), if they are JPEGs within the plan's file limit, with no thumbnail. Their location is still removed on upload; a photo that is not a JPEG is refused.
- Videos behave as above.

On the web the module works through the browser's canvas; there is no video compressor. Checked in a web build: a 4,000 x 3,000 px JPEG of 2 MB with a GPS position went up on a Free account as a 1,280 x 960 px JPEG of 266 KB with no EXIF data, and a 480 x 360 px thumbnail of 51 KB.

## How to test on a phone (the 1.2.0 build)

1. Free account. Write a journey post, pick a large photo (12 MP or more, for example straight from the camera). Share it. In the Supabase dashboard, Storage, `user-media`, `<your id>/posts/`: the photo is about 0.2 to 0.6 MB and 1,280 px on its long side; a `-thumb.jpg` next to it is about 30 to 60 KB.
2. Download that photo and look at its details (on a computer: any EXIF viewer). There is no location. The picture is the right way up.
3. Pick a photo taken in portrait and one HEIC photo from an iPhone: both come out as JPEG, the right way up.
4. Record a clip with location on (iPhone and Android), add it to a post, then download it from Storage and look at its details (on a computer: any tool that shows the metadata of a video, for example the file's information window). There is no location, and it plays.
5. Pick a video longer than 60 seconds: the message says so and the clip is left out.
6. Pick a clip of about 20 seconds filmed at 3840x2160. On iPhone it arrives at 720p. On Android it is refused if it is over 25 MB.
7. Chat: send a photo. In `user-media`, `<your id>/chat/`: 1,280 px, no location. Unsend it: the file is gone from Storage.
8. Change your profile picture: `avatars/<your id>/avatar.jpg` is 512 px. An older `avatar.png` is deleted only after the profile points at the new picture.
9. Me, Journey grid: the tiles load the `-thumb.jpg` (Network panel of a web build, or the size of the download), the full-screen viewer the photo itself.
10. Pick three large photos and press Cancel while they are prepared: no slide is added.
11. With a Pilgrim Plus account (set in the database for testing; it cannot be bought yet): the same photo is up to 3,840 px, a clip on iPhone arrives at 1080p.

## Still to do

- A server job that deletes files no row uses (orphans). The app deletes a file only when it is sure nothing uses it: after the database clearly refused the row, or after asking whether the row is there. When it cannot tell (no signal), it leaves the file, and only such a job can remove it.
- At pick time a clip is read whole to check that its place can be removed, and read whole again on upload (a 45 MB clip twice). Reading only the box headers at pick time would save that.
- A poster image for videos (grids show a play mark).
- A video compressor, once one is safe for this React Native version.
