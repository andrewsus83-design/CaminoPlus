"""What the store build says about itself: the facts of mobile/app.json and mobile/eas.json that the App Store and Google Play look at.

Each one was checked by running `npx expo prebuild --no-install --clean` on a scratch copy and reading what came out (mobile/DEPLOY.md, "Release 1.2.0: the
store build", says how to repeat it). A change here is a decision, not a cleanup: change the test in the same commit and say why.

  iOS      iPhone only; every purpose string says what CaminoPlus really does; no microphone, motion or background-location key.
  Android  Auto Backup off; the permissions nothing uses are blocked, so they cannot come back through a library; no background or foreground-service location;
           the launch screen and the icon layers point at files that exist.
  EAS      the production profile builds an app bundle (.aab), which is what Google Play takes.

The last class ties the permissions to the code: a permission that app.json removes must not be asked for by a screen.

Run from the repository root:  python3 -m unittest discover -s tools/tests -v
"""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


APP = json.loads(read("mobile/app.json"))["expo"]
EAS = json.loads(read("mobile/eas.json"))
TOKENS = json.loads(read("design/tokens.json"))

# The words the phone shows when it asks. They are part of the product: short, plain, and true.
LOCATION_WHEN_IN_USE = (
    "CaminoPlus uses your location while the app is open to show where you are on the Camino, how far you have walked and what is near you. "
    "It also uses it when you choose to send your position to friends with the help bell."
)
LOCATION_ALWAYS = "CaminoPlus only uses your location while the app is open. It never tracks you in the background."
PHOTOS = "CaminoPlus uses your photos so you can choose a profile picture and add pictures to your journey posts."
# iOS keeps this key (see CameraText below); the text says what is true.
CAMERA = "CaminoPlus does not use your camera."

BLOCKED = {
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.VIBRATE",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.CAMERA",
}


def plugin(name: str) -> dict:
    """The options of a plugin of app.json ({} for a plugin listed without options)."""
    for entry in APP["plugins"]:
        if entry == name:
            return {}
        if isinstance(entry, list) and entry[0] == name:
            return entry[1] if len(entry) > 1 else {}
    raise AssertionError(f"app.json has no plugin {name}")


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


def background_role(scheme: str) -> str:
    """The colour of role.bg in tokens.json, the way mobile/src/theme/index.ts picks it: a literal of the dark section first, else the palette entry."""
    role = TOKENS["role"]["bg"]
    if scheme == "dark":
        literal = TOKENS["dark"]["role"].get("bg")
        if literal:
            return literal
        return TOKENS["dark"]["color"].get(role, TOKENS["color"][role])
    return TOKENS["color"][role]


def code_without_comments(path: pathlib.Path) -> str:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*", "", text)


def app_sources():
    """Every screen and module of the app (not its tests)."""
    for base in ("mobile/app", "mobile/src"):
        for path in sorted((ROOT / base).rglob("*")):
            if path.suffix in (".ts", ".tsx") and "__tests__" not in path.parts:
                yield path


def calls(names: tuple[str, ...]) -> dict[str, list[str]]:
    """The files of the app that call one of these functions or hooks, and which."""
    pattern = re.compile(r"\b(" + "|".join(names) + r")\s*\(")
    found: dict[str, list[str]] = {}
    for path in app_sources():
        hits = sorted(set(pattern.findall(code_without_comments(path))))
        if hits:
            found[path.relative_to(ROOT).as_posix()] = hits
    return found


class Ios(unittest.TestCase):
    def test_iphone_only_for_the_first_version(self):
        # The layouts are phone layouts, stretched on an iPad. iPad owners can still install the app (iPhone size). To offer an iPad version, set this
        # to true after the screens have been looked at on an iPad.
        self.assertIs(APP["ios"]["supportsTablet"], False)

    def test_export_compliance_stays_declared(self):
        self.assertIs(APP["ios"]["infoPlist"]["ITSAppUsesNonExemptEncryption"], False)
        self.assertEqual(APP["ios"]["bundleIdentifier"], "plus.camino.app")

    def test_no_background_mode(self):
        self.assertNotIn("UIBackgroundModes", APP["ios"]["infoPlist"])
        self.assertIs(plugin("expo-location")["isIosBackgroundLocationEnabled"], False)

    def test_the_photo_text(self):
        self.assertEqual(plugin("expo-image-picker")["photosPermission"], PHOTOS)

    def test_the_microphone_key_is_gone(self):
        # The photo picker never records. (Android: the plugin blocks RECORD_AUDIO with it.)
        self.assertIs(plugin("expo-image-picker")["microphonePermission"], False)

    def test_the_camera_key_stays_with_a_text_that_is_true(self):
        # expo-image-picker links `AVCaptureDevice.requestAccess(for: .video)` (its camera permission helper), which the app never calls. App Store Connect
        # reads the binary, not the code that runs: Apple says a library that mentions a protected API needs its purpose string even when nothing uses it
        # (error ITMS-90683, "Missing Purpose String", at upload). So the key is not removed (`cameraPermission: false`) but says what is true, and the
        # camera permission of Android is blocked on its own (the plugin only does that for `false`; BLOCKED above has it). The microphone has no such API
        # in the library, and expo-location's motion code is compiled out (`motionUsagePermission: false`), so those two keys really go.
        text = plugin("expo-image-picker")["cameraPermission"]
        self.assertEqual(text, CAMERA)
        self.assertNotIn("$(PRODUCT_NAME)", text)

    def test_the_location_texts_say_what_the_app_does(self):
        loc = plugin("expo-location")
        self.assertEqual(loc["locationWhenInUsePermission"], LOCATION_WHEN_IN_USE)
        # expo-location links requestAlwaysAuthorization, so these two keys must exist (ITMS-90683 again); they say the truth: never in the background.
        self.assertEqual(loc["locationAlwaysAndWhenInUsePermission"], LOCATION_ALWAYS)
        self.assertEqual(loc["locationAlwaysPermission"], LOCATION_ALWAYS)

    def test_motion_and_temporary_full_accuracy_are_off(self):
        loc = plugin("expo-location")
        self.assertIs(loc["motionUsagePermission"], False, "false compiles the motion code out and drops NSMotionUsageDescription")
        self.assertIs(loc["locationFullAccuracyPermission"], False, "false drops NSLocationTemporaryUsageDescriptionDictionary; expo-location then never asks for it")

    def test_no_generic_template_text_is_left(self):
        for text in strings(APP["plugins"]):
            self.assertNotIn("$(PRODUCT_NAME)", text)
        for text in strings(APP["ios"]):
            self.assertNotIn("$(PRODUCT_NAME)", text)


class Android(unittest.TestCase):
    def test_auto_backup_is_off(self):
        # Auto Backup would copy the on-phone diary to the cloud and put it back on another phone, where the keys of expo-secure-store do not exist.
        self.assertIs(APP["android"]["allowBackup"], False)

    def test_unused_permissions_are_blocked(self):
        self.assertEqual(set(APP["android"]["blockedPermissions"]), BLOCKED)
        self.assertEqual(len(APP["android"]["blockedPermissions"]), len(BLOCKED), "a permission is listed twice")

    def test_the_package_is_the_one_on_google_play(self):
        self.assertEqual(APP["android"]["package"], "plus.camino.app")

    def test_location_has_no_background_and_no_foreground_service(self):
        loc = plugin("expo-location")
        self.assertIs(loc["isAndroidBackgroundLocationEnabled"], False)
        self.assertIs(loc["isAndroidForegroundServiceEnabled"], False)

    def test_the_local_plugin_is_listed_and_does_what_the_header_says(self):
        self.assertEqual(plugin("./plugins/withStoreManifest"), {})
        text = read("mobile/plugins/withStoreManifest.js")
        for needle in (
            "android.hardware.location.gps",
            "'android:required': 'false'",
            "expo.modules.location.services.LocationTaskService",
            "expo.modules.location.next.locationForegroundService.LocationForegroundService",
            "'tools:node': 'remove'",
        ):
            self.assertIn(needle, text)

    def test_the_icon_layers_are_wired(self):
        icon = APP["android"]["adaptiveIcon"]
        for key, name in (("foregroundImage", "android-icon-foreground"), ("backgroundImage", "android-icon-background"), ("monochromeImage", "android-icon-monochrome")):
            self.assertEqual(icon[key], f"./assets/{name}.png")
            self.assertTrue((ROOT / "mobile" / icon[key]).is_file(), icon[key])
        self.assertEqual(icon["backgroundColor"].lower(), TOKENS["color"]["blue"].lower(), "the colour under the layers is the brand blue")
        self.assertEqual(APP["icon"], "./assets/icon.png")
        self.assertTrue((ROOT / "mobile" / APP["icon"]).is_file())


class LaunchScreen(unittest.TestCase):
    def test_the_splash_plugin_draws_the_mark_200_wide_on_the_page_colour(self):
        splash = plugin("expo-splash-screen")
        self.assertEqual(splash["image"], "./assets/splash-icon.png")
        self.assertTrue((ROOT / "mobile" / splash["image"]).is_file())
        self.assertEqual(splash["imageWidth"], 200)
        self.assertEqual(splash["backgroundColor"].lower(), background_role("light").lower(), "the launch screen is the colour of role.bg")

    def test_the_dark_launch_screen_is_the_dark_page_colour(self):
        splash = plugin("expo-splash-screen")
        self.assertEqual(splash["android"]["dark"]["backgroundColor"].lower(), background_role("dark").lower())

    def test_iphone_has_no_dark_launch_screen_while_the_app_is_pinned_to_light(self):
        # userInterfaceStyle 'light' makes the iPhone ignore its dark mode, so a dark launch screen there would never show, and Expo prints a warning
        # at every build. Android has no expo-system-ui, so the phone's dark mode does reach it.
        self.assertEqual(APP["userInterfaceStyle"], "light")
        splash = plugin("expo-splash-screen")
        self.assertNotIn("dark", splash)
        self.assertNotIn("dark", splash.get("ios", {}))

    def test_the_page_colour_of_the_app_is_still_the_light_role(self):
        self.assertEqual(APP["backgroundColor"].lower(), background_role("light").lower())


class Eas(unittest.TestCase):
    def test_production_builds_an_app_bundle(self):
        # Google Play takes .aab files; EAS's default is the same, written down so nobody changes it by accident. The testers' preview build stays an APK.
        self.assertEqual(EAS["build"]["production"]["android"]["buildType"], "app-bundle")
        self.assertEqual(EAS["build"]["preview"]["android"]["buildType"], "apk")

    def test_the_build_number_goes_up_by_itself_in_production(self):
        self.assertIs(EAS["build"]["production"]["autoIncrement"], True)
        self.assertEqual(EAS["cli"]["appVersionSource"], "remote")

    def test_the_simulator_profile_needs_no_apple_account(self):
        # `eas build --platform ios --profile development-simulator`: an unsigned build for the iOS Simulator (mobile/DEPLOY.md).
        self.assertEqual(EAS["build"]["development-simulator"]["extends"], "development")
        self.assertIs(EAS["build"]["development-simulator"]["ios"]["simulator"], True)


class CodeMatchesPermissions(unittest.TestCase):
    # The three places on main that ask the system for the media-library permission before they open the photo picker. The picker itself needs no
    # permission (it is the system's photo picker), and the media change of release 1.2.0 deletes these questions. With READ_EXTERNAL_STORAGE and
    # WRITE_EXTERNAL_STORAGE blocked, the question has nothing to ask for on Android 12 and older: it is answered "no" and the picker would never open
    # there. Until that change has landed they stay here; once it has, empty this set, and nobody can bring the question back.
    PENDING = {"mobile/app/write.tsx", "mobile/src/features/social/pick.ts", "mobile/src/lib/avatar.ts"}

    def test_nothing_asks_for_a_media_library_permission_that_app_json_removed(self):
        found = calls(("requestMediaLibraryPermissionsAsync", "getMediaLibraryPermissionsAsync", "useMediaLibraryPermissions"))
        unexpected = {path: names for path, names in found.items() if path not in self.PENDING}
        self.assertEqual(unexpected, {}, "READ/WRITE_EXTERNAL_STORAGE are blocked in app.json: a screen that asks for them is answered 'no' on Android 12 and older")

    def test_nothing_uses_the_camera(self):
        self.assertEqual(
            calls(("launchCameraAsync", "requestCameraPermissionsAsync", "getCameraPermissionsAsync", "useCameraPermissions")),
            {},
            "CAMERA is blocked on Android and the iOS camera text says CaminoPlus does not use it: a feature that uses the camera changes both first",
        )

    def test_nothing_vibrates_or_buzzes(self):
        for path in app_sources():
            code = code_without_comments(path)
            self.assertNotRegex(code, r"\bVibration\b|expo-haptics|\bHaptics\.", f"{path.relative_to(ROOT)}: VIBRATE is blocked in app.json")

    def test_nothing_tracks_in_the_background(self):
        found = calls(
            (
                "startLocationUpdatesAsync",
                "requestBackgroundPermissionsAsync",
                "getBackgroundPermissionsAsync",
                "startGeofencingAsync",
                "defineTask",
            )
        )
        self.assertEqual(found, {}, "the location permission texts, the manifest and the Privacy page all say the app never tracks in the background")

    def test_nothing_reads_the_shared_storage_of_android(self):
        for path in app_sources():
            code = code_without_comments(path)
            self.assertNotRegex(code, r"StorageAccessFramework|requestDirectoryPermissionsAsync|expo-media-library", f"{path.relative_to(ROOT)}: READ/WRITE_EXTERNAL_STORAGE are blocked")


if __name__ == "__main__":
    unittest.main()
