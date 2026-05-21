import pyttsx3
import speech_recognition as sr
import os
import json
import time
import sys
import difflib
import math  # needed for sqrt, factorial, etc.
import threading
import re
import datetime
import subprocess
import importlib
import importlib.util
import urllib.parse
import platform
import socket
import secrets
import io
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import winsound
except Exception:
    winsound = None

# ---------------- SETUP ----------------
r = sr.Recognizer()
MEMORY_FILE = "memory.json"
COMMAND_FILE = "commands.json"
PATH_CACHE_FILE = "path_cache.json"
FAVORITES_FILE = "favorites.json"
CONTACTS_FILE = "contacts.json"
PHONE_DEVICES_FILE = "phone_devices.json"
SETUP_REPORT_FILE = "setup_report.txt"
SPEAK_LOCK = threading.Lock()
ACTIVE_TIMERS = {}
TIMER_COUNTER = 0
ACTIVE_REMINDERS = {}
REMINDER_COUNTER = 0
LAST_FILE_MATCHES = []
PENDING_CONFIRMATION = None
ACTION_HISTORY = []
PENDING_EMAIL = None
FALLBACK_VOICE_RATE = 0
FALLBACK_VOICE_VOLUME = 100
ASTRO_MESSAGES = []
PHONE_ONLY_MODE = False
PHONE_SERVER = None
PHONE_ACCESS_TOKEN = None
SETUP_ATTENTION_CACHE = []
SETUP_CACHE_UPDATED_AT = None
EXIT_WORDS = ["exit", "stop", "goodbye", "good bye"]
DIRECT_SEARCH_BLOCKERS = [
    "open", "remember", "forget", "calculate", "search", "google",
    "set timer", "timer", "when i say", "exit", "stop", "goodbye", "good bye",
    "close", "read", "pin app", "pin file", "open favorite",
    "remind me", "set voice rate", "set volume", "switch voice", "summarize",
    "email", "mail", "list all commands", "help commands",
    "save contact", "remove contact", "delete contact", "list contacts",
    "translate", "check system", "run setup", "export setup report",
    "app mode", "open dashboard", "show dashboard", "phone mode", "mobile mode",
    "list paired phones", "revoke phone access", "allow all phones", "disconnect phone mode"
]

def ensure_portable_data_env():
    local_root = os.path.join(os.getcwd(), ".astro_local")
    existing_data_dir = os.path.join(os.getcwd(), ".xdg_data")
    existing_config_dir = os.path.join(os.getcwd(), ".xdg_config")
    existing_cache_dir = os.path.join(os.getcwd(), ".local", "cache")
    data_dir = existing_data_dir if os.path.isdir(existing_data_dir) else os.path.join(local_root, "data")
    config_dir = existing_config_dir if os.path.isdir(existing_config_dir) else os.path.join(local_root, "config")
    cache_dir = existing_cache_dir if os.path.isdir(existing_cache_dir) else os.path.join(local_root, "cache")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(config_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    os.environ["XDG_DATA_HOME"] = data_dir
    os.environ["XDG_CONFIG_HOME"] = config_dir
    os.environ["XDG_CACHE_HOME"] = cache_dir
    os.environ["ARGOS_TRANSLATE_DATA_DIR"] = data_dir
    return local_root

def load_contacts():
    data = load_json_or_default(CONTACTS_FILE, {"contacts": {}})
    if "contacts" not in data:
        data["contacts"] = {}
    return data

def save_contacts(data):
    save_json(CONTACTS_FILE, data)

def load_phone_devices():
    data = load_json_or_default(PHONE_DEVICES_FILE, {"devices": {}})
    if "devices" not in data:
        data["devices"] = {}
    return data

def save_phone_devices(data):
    save_json(PHONE_DEVICES_FILE, data)

def remember_phone_device(ip_address, user_agent):
    data = load_phone_devices()
    now = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    device = data["devices"].get(ip_address, {})
    device.setdefault("first_seen", now)
    device["last_seen"] = now
    device["user_agent"] = user_agent or "Unknown"
    device.setdefault("allowed", True)
    data["devices"][ip_address] = device
    save_phone_devices(data)

def is_phone_device_allowed(ip_address):
    data = load_phone_devices()
    device = data["devices"].get(ip_address)
    return not device or device.get("allowed", True)

def revoke_phone_access(ip_address=None):
    data = load_phone_devices()
    if ip_address:
        device = data["devices"].get(ip_address)
        if not device:
            return 0
        device["allowed"] = False
        device["revoked_at"] = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
        save_phone_devices(data)
        return 1
    count = 0
    for device in data["devices"].values():
        if device.get("allowed", True):
            count += 1
        device["allowed"] = False
        device["revoked_at"] = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    save_phone_devices(data)
    return count

def allow_all_phone_devices():
    data = load_phone_devices()
    changed = 0
    for device in data["devices"].values():
        if not device.get("allowed", True):
            device["allowed"] = True
            changed += 1
    if changed:
        save_phone_devices(data)
    return changed

def reset_phone_pairing():
    global PHONE_ACCESS_TOKEN
    PHONE_ACCESS_TOKEN = secrets.token_urlsafe(12)
    return PHONE_ACCESS_TOKEN

def save_contact(name, email):
    data = load_contacts()
    data["contacts"][name.lower()] = email
    save_contacts(data)

def remove_contact(name):
    data = load_contacts()
    key = name.lower()
    if key in data["contacts"]:
        del data["contacts"][key]
        save_contacts(data)
        return True
    return False

def resolve_contact(target):
    data = load_contacts()
    key = target.lower().strip()
    return data["contacts"].get(key)

def get_common_roots():
    user_home = os.path.expanduser("~")
    roots = [
        os.getcwd(),
        os.path.join(user_home, "Desktop"),
        os.path.join(user_home, "Documents"),
        os.path.join(user_home, "Downloads"),
        os.path.join(user_home, "Pictures"),
        os.path.join(user_home, "Music"),
        os.path.join(user_home, "Videos"),
    ]
    return [path for path in roots if os.path.isdir(path)]

def load_json_or_default(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return default

def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

# ---------------- VOICE ENGINE ----------------
def init_voice_engine():
    try:
        try:
            import comtypes.client
            import comtypes.gen
            gen_dir = os.path.join(ensure_portable_data_env(), "comtypes_gen")
            os.makedirs(gen_dir, exist_ok=True)
            comtypes.client.gen_dir = gen_dir
            if gen_dir not in comtypes.gen.__path__:
                comtypes.gen.__path__.insert(0, gen_dir)
        except Exception as exc:
            print(f"Astro could not configure comtypes cache: {exc}")
        tts_engine = pyttsx3.init("sapi5")
        available_voices = tts_engine.getProperty("voices")
        if available_voices:
            tts_engine.setProperty("voice", available_voices[0].id)
        tts_engine.setProperty("rate", 170)
        tts_engine.setProperty("volume", 1.0)
        return tts_engine, available_voices
    except Exception as exc:
        print(f"Astro voice engine unavailable: {exc}")
        return None, []

engine, voices = init_voice_engine()

def speak_with_powershell(text):
    env = os.environ.copy()
    env["ASTRO_SPEAK_TEXT"] = str(text)
    env["ASTRO_SPEAK_RATE"] = str(FALLBACK_VOICE_RATE)
    env["ASTRO_SPEAK_VOLUME"] = str(FALLBACK_VOICE_VOLUME)
    command = (
        "$v = New-Object -ComObject SAPI.SpVoice; "
        "$v.Rate = [int]$env:ASTRO_SPEAK_RATE; "
        "$v.Volume = [int]$env:ASTRO_SPEAK_VOLUME; "
        "[void]$v.Speak($env:ASTRO_SPEAK_TEXT)"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            env=env,
            capture_output=True,
            text=True,
            timeout=60
        )
        return completed.returncode == 0
    except Exception:
        return False

def get_sapi_voice_count():
    command = "$v = New-Object -ComObject SAPI.SpVoice; $v.GetVoices().Count"
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            timeout=10
        )
        if completed.returncode != 0:
            return 0
        return int(completed.stdout.strip() or "0")
    except Exception:
        return 0

def speak(text):
    global engine
    if not text:
        return
    with SPEAK_LOCK:
        print("Astro:", text)
        ASTRO_MESSAGES.append({
            "time": datetime.datetime.now().strftime("%I:%M:%S %p"),
            "text": str(text)
        })
        if len(ASTRO_MESSAGES) > 100:
            del ASTRO_MESSAGES[:-100]
        # In phone-only mode, use fast PowerShell TTS fallback to avoid
        # pyttsx3 stalls while still speaking responses.
        if PHONE_ONLY_MODE:
            speak_with_powershell(text)
            return
        if engine is None:
            speak_with_powershell(text)
            return
        try:
            engine.say(text)
            engine.runAndWait()
        except Exception:
            # Re-initialize TTS engine if it gets stuck/busy.
            engine, _ = init_voice_engine()
            if engine is not None:
                engine.say(text)
                engine.runAndWait()
            else:
                speak_with_powershell(text)

def explain_failure(action, reason, suggestion=None):
    message = f"I could not {action} because {reason}."
    if suggestion:
        message += f" {suggestion}"
    speak(message)

def show_notification(title, message):
    if winsound:
        try:
            winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
        except Exception:
            pass
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x40)
    except Exception:
        pass

def parse_timer_seconds(command):
    unit_seconds = {
        "hour": 3600, "hours": 3600, "hr": 3600, "hrs": 3600,
        "minute": 60, "minutes": 60, "min": 60, "mins": 60,
        "second": 1, "seconds": 1, "sec": 1, "secs": 1
    }
    matches = re.findall(r"(\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)", command)
    total = 0
    for value, unit in matches:
        total += int(value) * unit_seconds[unit]
    return total

def format_duration(total_seconds):
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    parts = []
    if hours:
        parts.append(f"{hours} hour" + ("s" if hours != 1 else ""))
    if minutes:
        parts.append(f"{minutes} minute" + ("s" if minutes != 1 else ""))
    if seconds or not parts:
        parts.append(f"{seconds} second" + ("s" if seconds != 1 else ""))
    return ", ".join(parts)

def parse_clock_time(time_text):
    cleaned = time_text.strip().lower().replace(".", "")
    formats = ["%I:%M %p", "%I %p", "%H:%M", "%H"]
    for fmt in formats:
        try:
            return datetime.datetime.strptime(cleaned, fmt).time()
        except ValueError:
            continue
    return None

def reminder_finished(reminder_id, message):
    ACTIVE_REMINDERS.pop(reminder_id, None)
    text = f"Reminder {reminder_id}. {message}"
    speak(text)
    show_notification("Astro Reminder", text)

def set_reminder_for_datetime(when_dt, message):
    global REMINDER_COUNTER
    delay = (when_dt - datetime.datetime.now()).total_seconds()
    if delay <= 0:
        return None
    REMINDER_COUNTER += 1
    reminder_id = REMINDER_COUNTER
    t = threading.Timer(delay, reminder_finished, args=(reminder_id, message))
    t.daemon = True
    ACTIVE_REMINDERS[reminder_id] = t
    t.start()
    return reminder_id

def set_voice_rate(rate_value):
    global FALLBACK_VOICE_RATE
    value = max(100, min(250, int(rate_value)))
    if engine is not None:
        engine.setProperty("rate", value)
    FALLBACK_VOICE_RATE = max(-10, min(10, int((value - 170) / 8)))
    return value

def set_voice_volume(percent_value):
    global FALLBACK_VOICE_VOLUME
    percent = max(0, min(100, int(percent_value)))
    if engine is not None:
        engine.setProperty("volume", percent / 100.0)
    FALLBACK_VOICE_VOLUME = percent
    return percent

def switch_voice():
    global voices
    if not voices or len(voices) < 2:
        return None
    current_id = engine.getProperty("voice")
    next_index = 0
    for i, v in enumerate(voices):
        if v.id == current_id:
            next_index = (i + 1) % len(voices)
            break
    engine.setProperty("voice", voices[next_index].id)
    return voices[next_index].name

def build_email_draft_from_prompt(target, topic):
    subject = f"Regarding {topic.title()}"
    body = (
        f"Hi {target},\n\n"
        f"I wanted to share an update about {topic}.\n"
        "Please let me know a good time if you want to discuss this in detail.\n\n"
        "Best regards,\n"
    )
    return subject, body

def open_gmail_compose(to_email, subject, body):
    to_q = urllib.parse.quote(to_email)
    su_q = urllib.parse.quote(subject)
    body_q = urllib.parse.quote(body)
    url = f"https://mail.google.com/mail/?view=cm&fs=1&to={to_q}&su={su_q}&body={body_q}"
    import webbrowser
    webbrowser.open(url)

def get_language_code(language_name):
    mapping = {
        "english": "en",
        "tamil": "ta",
        "hindi": "hi",
        "telugu": "te",
        "malayalam": "ml",
        "kannada": "kn",
        "french": "fr",
        "spanish": "es",
        "german": "de",
        "japanese": "ja",
    }
    return mapping.get(language_name.strip().lower())

TAMIL_PHRASE_TRANSLATIONS = {
    "hello": "வணக்கம்",
    "hi": "வணக்கம்",
    "good morning": "காலை வணக்கம்",
    "good afternoon": "மதிய வணக்கம்",
    "good evening": "மாலை வணக்கம்",
    "good night": "இரவு வணக்கம்",
    "thank you": "நன்றி",
    "thanks": "நன்றி",
    "sorry": "மன்னிக்கவும்",
    "please": "தயவு செய்து",
    "yes": "ஆம்",
    "no": "இல்லை",
    "how are you": "நீங்கள் எப்படி இருக்கிறீர்கள்",
    "i am fine": "நான் நலமாக இருக்கிறேன்",
    "what is your name": "உங்கள் பெயர் என்ன",
    "my name is": "என் பெயர்",
    "nice to meet you": "உங்களை சந்தித்ததில் மகிழ்ச்சி",
    "see you later": "பிறகு சந்திப்போம்",
    "goodbye": "பிரியாவிடை",
    "open the file": "கோப்பைத் திற",
    "close the app": "செயலியை மூடு",
    "send email": "மின்னஞ்சல் அனுப்பு",
    "call me": "என்னை அழைக்கவும்",
    "i need help": "எனக்கு உதவி வேண்டும்",
    "where are you": "நீங்கள் எங்கே இருக்கிறீர்கள்",
    "come here": "இங்கே வாருங்கள்",
    "go there": "அங்கே செல்லுங்கள்",
    "wait": "காத்திருங்கள்",
    "start": "தொடங்கு",
    "stop": "நிறுத்து",
}

TAMIL_WORD_TRANSLATIONS = {
    "i": "நான்",
    "me": "என்னை",
    "my": "என்",
    "you": "நீங்கள்",
    "your": "உங்கள்",
    "we": "நாம்",
    "our": "எங்கள்",
    "they": "அவர்கள்",
    "he": "அவர்",
    "she": "அவர்",
    "it": "அது",
    "this": "இது",
    "that": "அது",
    "is": "ஆகும்",
    "are": "ஆகும்",
    "am": "ஆகும்",
    "was": "இருந்தது",
    "were": "இருந்தன",
    "be": "இரு",
    "have": "உள்ளது",
    "has": "உள்ளது",
    "do": "செய்",
    "does": "செய்கிறது",
    "did": "செய்தது",
    "can": "முடியும்",
    "will": "செய்வேன்",
    "want": "வேண்டும்",
    "need": "வேண்டும்",
    "like": "விரும்புகிறேன்",
    "go": "செல்",
    "come": "வா",
    "open": "திற",
    "close": "மூடு",
    "send": "அனுப்பு",
    "read": "படி",
    "write": "எழுது",
    "show": "காட்டு",
    "find": "கண்டுபிடி",
    "search": "தேடு",
    "file": "கோப்பு",
    "folder": "கோப்புறை",
    "app": "செயலி",
    "phone": "தொலைபேசி",
    "computer": "கணினி",
    "laptop": "மடிக்கணினி",
    "screen": "திரை",
    "email": "மின்னஞ்சல்",
    "message": "செய்தி",
    "friend": "நண்பர்",
    "mother": "அம்மா",
    "father": "அப்பா",
    "brother": "அண்ணன்",
    "sister": "சகோதரி",
    "home": "வீடு",
    "school": "பள்ளி",
    "work": "வேலை",
    "today": "இன்று",
    "tomorrow": "நாளை",
    "yesterday": "நேற்று",
    "now": "இப்போது",
    "later": "பிறகு",
    "morning": "காலை",
    "evening": "மாலை",
    "night": "இரவு",
    "time": "நேரம்",
    "water": "தண்ணீர்",
    "food": "உணவு",
    "help": "உதவி",
    "problem": "பிரச்சனை",
    "good": "நல்ல",
    "bad": "கெட்ட",
    "big": "பெரிய",
    "small": "சிறிய",
    "new": "புதிய",
    "old": "பழைய",
    "happy": "மகிழ்ச்சி",
    "sad": "சோகம்",
    "fast": "வேகமாக",
    "slow": "மெதுவாக",
}

def translate_to_tamil_locally(text):
    cleaned = re.sub(r"\s+", " ", str(text).strip().lower())
    if not cleaned:
        return None
    if cleaned in TAMIL_PHRASE_TRANSLATIONS:
        return TAMIL_PHRASE_TRANSLATIONS[cleaned]

    # Replace known multi-word phrases first, then translate remaining words.
    translated_text = cleaned
    used_phrase = False
    for phrase, tamil in sorted(TAMIL_PHRASE_TRANSLATIONS.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = r"\b" + re.escape(phrase) + r"\b"
        if re.search(pattern, translated_text):
            translated_text = re.sub(pattern, tamil, translated_text)
            used_phrase = True

    def replace_english_word(match):
        word = match.group(0)
        return TAMIL_WORD_TRANSLATIONS.get(word.lower(), word)

    result = re.sub(r"\b[A-Za-z']+\b", replace_english_word, translated_text)
    result = re.sub(r"\s+([,.!?;:])", r"\1", result)
    return result if used_phrase or result != cleaned else None

def translate_text(text, target_language):
    lang_code = get_language_code(target_language)
    if not lang_code:
        return None, "unsupported_language"
    if lang_code == "ta":
        local_tamil = translate_to_tamil_locally(text)
        if local_tamil:
            return local_tamil, None
        return None, "local_tamil_limited"
    try:
        ensure_portable_data_env()
        configure_argos_for_offline_mode()
        argos_translate = importlib.import_module("argostranslate.translate")
        translated = argos_translate.translate(text, "en", lang_code)
        return translated, None
    except Exception:
        return None, "offline_translator_unavailable"

def configure_argos_for_offline_mode():
    try:
        sbd = importlib.import_module("argostranslate.sbd")
        if getattr(sbd.StanzaSentencizer, "_astro_offline_patch", False):
            return

        def split_without_stanza(_self, text):
            pieces = [part.strip() for part in re.split(r"(?<=[.!?])\s+", str(text)) if part.strip()]
            return pieces or [str(text)]

        sbd.StanzaSentencizer.split_sentences = split_without_stanza
        sbd.StanzaSentencizer._astro_offline_patch = True
    except Exception:
        pass

def package_available(module_name):
    try:
        return importlib.util.find_spec(module_name) is not None
    except Exception:
        return False

def check_internet(timeout=2):
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=timeout).close()
        return True
    except OSError:
        return False

def check_argos_language_pair(from_code, to_code):
    try:
        ensure_portable_data_env()
        configure_argos_for_offline_mode()
        argos_translate = importlib.import_module("argostranslate.translate")
        languages = argos_translate.get_installed_languages()
        source = next((lang for lang in languages if lang.code == from_code), None)
        target = next((lang for lang in languages if lang.code == to_code), None)
        return bool(source and target and source.get_translation(target))
    except Exception:
        return False

def argos_pair_available_to_download(from_code, to_code):
    try:
        ensure_portable_data_env()
        argos_package = importlib.import_module("argostranslate.package")
        packages = argos_package.get_available_packages()
        return any(pkg.from_code == from_code and pkg.to_code == to_code for pkg in packages)
    except Exception:
        return False

def build_setup_report():
    checks = []

    def add(name, ok, detail):
        checks.append({
            "name": name,
            "status": "OK" if ok else "Needs attention",
            "detail": detail
        })

    py_ok = sys.version_info >= (3, 10)
    add("Python", py_ok, f"{platform.python_version()} detected. Recommended: 3.10 or newer.")
    add("Operating system", platform.system() == "Windows", f"{platform.system()} {platform.release()} detected. Astro is tuned for Windows.")
    sapi_voice_count = get_sapi_voice_count()
    voice_ok = bool(voices) or sapi_voice_count > 0
    voice_detail = (
        f"{len(voices)} pyttsx3 voice(s) found."
        if voices else
        f"pyttsx3 is unavailable, but {sapi_voice_count} Windows SAPI fallback voice(s) are available."
        if sapi_voice_count else
        "No pyttsx3 or Windows SAPI voices found."
    )
    add("Voice engine", voice_ok, voice_detail)

    try:
        mic_names = sr.Microphone.list_microphone_names()
        add("Microphone", bool(mic_names), f"{len(mic_names)} microphone device(s) found.")
    except Exception as exc:
        add("Microphone", False, f"Could not check microphone: {exc}")

    required = {
        "pyttsx3": "voice replies",
        "speech_recognition": "speech recognition",
        "pyaudio": "microphone input",
    }
    for module_name, purpose in required.items():
        add(f"Package: {module_name}", package_available(module_name), f"Needed for {purpose}.")

    optional = {
        "PyPDF2": "reading PDF files",
        "docx": "reading DOCX files",
        "argostranslate": "offline translation",
        "transformers": "future local model translation fallback",
    }
    for module_name, purpose in optional.items():
        add(f"Optional package: {module_name}", package_available(module_name), f"Used for {purpose}.")

    common_roots = get_common_roots()
    add("Common folders", bool(common_roots), f"{len(common_roots)} searchable folder(s) found.")
    add("Internet", check_internet(), "Used by Google speech recognition, web search, Gmail compose, and downloads.")
    hindi_ready = check_argos_language_pair("en", "hi")
    tamil_ready = check_argos_language_pair("en", "ta")
    add("Offline Hindi translation", hindi_ready, "Argos en->hi model is installed." if hindi_ready else "Argos en->hi model is missing.")
    tamil_available = argos_pair_available_to_download("en", "ta")
    local_tamil_ready = bool(translate_to_tamil_locally("hello friend"))
    tamil_detail = (
        "Argos en->ta model is installed."
        if tamil_ready else
        "Basic local Tamil phrase/word translation is available. Argos does not currently list a full en->ta model."
        if local_tamil_ready else
        "Argos does not currently list an en->ta model in its package index."
        if not tamil_available else
        "Argos en->ta model is available but not installed."
    )
    add("Offline Tamil translation", tamil_ready or local_tamil_ready, tamil_detail)

    local_root = ensure_portable_data_env()
    add("Portable data folder", os.path.isdir(local_root), f"Using {local_root}")
    return checks

def format_setup_report(checks):
    lines = [
        "Astro Setup Report",
        f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %I:%M %p')}",
        ""
    ]
    for item in checks:
        lines.append(f"[{item['status']}] {item['name']}: {item['detail']}")
    return "\n".join(lines)

def speak_setup_summary(checks):
    total = len(checks)
    attention = [item for item in checks if item["status"] != "OK"]
    if attention:
        speak(f"Setup check complete. {total - len(attention)} checks passed and {len(attention)} need attention.")
        for item in attention[:5]:
            speak(f"{item['name']}: {item['detail']}")
        if len(attention) > 5:
            speak("There are more details on screen.")
    else:
        speak("Setup check complete. Everything important looks ready.")

def print_setup_report(checks):
    report = format_setup_report(checks)
    print(report)
    return report

def export_setup_report():
    checks = build_setup_report()
    report = format_setup_report(checks)
    with open(SETUP_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report)
    return os.path.abspath(SETUP_REPORT_FILE), checks

def get_supported_commands_text():
    return [
        "Wake and general: say Astro, undo last action, what did I do last",
        "Setup and portability: check system, run setup, export setup report",
        "App mode: app mode, open dashboard, show dashboard",
        "Open and file search: open chrome, open documents, open resume dot pdf, open number 2, resume",
        "Close: close chrome, close favorite browser",
        "Memory: remember something, what do you remember, forget last memory, clear memory",
        "Timers and reminders: set timer 2 minutes, remind me at 6 30 PM to call mom",
        "Math and web: calculate 25 plus 17, search for weather today",
        "Read and summarize: read resume, read file number 2, summarize report, summarize file number 2",
        "Favorites: pin app chrome as browser, pin file resume dot pdf as my resume, open favorite browser",
        "Voice settings: set voice rate to 190, set volume to 80 percent, switch voice",
        "Email draft: email person at mail dot com about project update, then say yes or no",
        "Phone security: phone mode, list paired phones, revoke phone access, allow all phones, disconnect phone mode",
        "Daily briefing and exit: good morning, briefing, goodbye"
    ]

def timer_finished(timer_id, duration_seconds):
    timer_obj = ACTIVE_TIMERS.pop(timer_id, None)
    if timer_obj and hasattr(timer_obj, "astro_record"):
        timer_obj.astro_record["active"] = False
    duration_text = format_duration(duration_seconds)
    message = f"Timer {timer_id} is finished. Duration was {duration_text}."
    speak(message)
    show_notification("Astro Timer", message)

def set_timer(duration_seconds):
    global TIMER_COUNTER
    TIMER_COUNTER += 1
    timer_id = TIMER_COUNTER
    timer = threading.Timer(duration_seconds, timer_finished, args=(timer_id, duration_seconds))
    timer.daemon = True
    timer.astro_record = {"id": timer_id, "seconds": duration_seconds, "active": True}
    ACTIVE_TIMERS[timer_id] = timer
    timer.start()
    return timer_id

def add_history(action_type, detail, undoable=False, undo_data=None):
    ACTION_HISTORY.append({
        "action_type": action_type,
        "detail": detail,
        "undoable": undoable,
        "undo_data": undo_data or {}
    })

def describe_last_action():
    if not ACTION_HISTORY:
        return "You have not done any actions yet."
    last = ACTION_HISTORY[-1]
    return f"Your last action was {last['detail']}."

def undo_last_action():
    if not ACTION_HISTORY:
        return "There is nothing to undo."

    last = ACTION_HISTORY.pop()
    if not last.get("undoable"):
        return f"I cannot undo: {last['detail']}."

    action_type = last.get("action_type")
    undo_data = last.get("undo_data", {})

    if action_type == "remember":
        data = load_memory()
        memories = data.get("memories", [])
        if memories and memories[-1] == undo_data.get("value"):
            memories.pop()
            save_memory(data)
            return "Undid the last remember action."
        return "I could not safely undo that remember action."

    if action_type == "forget_last_memory":
        value = undo_data.get("value")
        if value is None:
            return "I could not undo that forget action."
        data = load_memory()
        data["memories"].append(value)
        save_memory(data)
        return "Restored the forgotten memory."

    if action_type == "set_timer":
        timer_id = undo_data.get("timer_id")
        timer = ACTIVE_TIMERS.pop(timer_id, None)
        if timer:
            timer.cancel()
            if hasattr(timer, "astro_record"):
                timer.astro_record["active"] = False
            return f"Cancelled timer {timer_id}."
        return "That timer is already finished or unavailable."

    return f"I cannot undo: {last['detail']}."

# ---------------- MEMORY ----------------
def load_memory():
    data = load_json_or_default(MEMORY_FILE, {"memories": []})
    if "memories" not in data:
        data["memories"] = []
    return data

def save_memory(data):
    save_json(MEMORY_FILE, data)

def remember(text):
    data = load_memory()
    data["memories"].append(text)
    save_memory(data)

def recall_all():
    return load_memory()["memories"]

def forget_all():
    save_memory({"memories": []})

def forget_last():
    data = load_memory()
    if data["memories"]:
        data["memories"].pop()
        save_memory(data)
        return True
    return False


def load_paths():
    return load_json_or_default(PATH_CACHE_FILE, {})

def save_path(app_name, path):
    data = load_paths()
    data[app_name] = path
    save_json(PATH_CACHE_FILE, data)

def load_favorites():
    data = load_json_or_default(FAVORITES_FILE, {"apps": {}, "files": {}})
    if "apps" not in data:
        data["apps"] = {}
    if "files" not in data:
        data["files"] = {}
    return data

def save_favorites(data):
    save_json(FAVORITES_FILE, data)

def pin_favorite_app(alias, app_target):
    data = load_favorites()
    data["apps"][alias.lower()] = app_target.lower()
    save_favorites(data)

def pin_favorite_file(alias, file_path):
    data = load_favorites()
    data["files"][alias.lower()] = file_path
    save_favorites(data)

def open_favorite(alias):
    data = load_favorites()
    key = alias.lower()
    if key in data["files"]:
        path = data["files"][key]
        if os.path.exists(path):
            os.startfile(path)
            return True
    if key in data["apps"]:
        app_target = data["apps"][key]
        if open_any_folder(app_target):
            return True
        if open_any_file(app_target):
            return True
        if open_any_app(app_target):
            return True
    return False

def open_any_file(file_name):
    # 1. Direct absolute/relative path support
    if os.path.isfile(file_name):
        os.startfile(file_name)
        return True

    # 2. Fast scan in common locations
    for base in get_common_roots():
        for root, _, files in os.walk(base):
            for f in files:
                if f.lower() == file_name.lower():
                    os.startfile(os.path.join(root, f))
                    return True
    return False

def find_files_by_keyword(keyword, limit=None):
    results = []
    key = keyword.lower().strip()
    if not key:
        return results

    for base in get_common_roots():
        for root, _, files in os.walk(base):
            for f in files:
                if key in f.lower():
                    results.append(os.path.join(root, f))
                    if limit is not None and len(results) >= limit:
                        return results
    return results

def show_file_matches(keyword, matches):
    global LAST_FILE_MATCHES
    LAST_FILE_MATCHES = matches
    speak(f"I found {len(matches)} files matching {keyword}. Showing them on screen. Say open number and the file number to open one.")
    print(f"Matches for '{keyword}':")
    for i, p in enumerate(matches, start=1):
        print(f"{i}. {p}")
    show_file_picker(matches)

def show_file_picker(matches):
    def _launch():
        try:
            import tkinter as tk
            from tkinter import ttk
            window = tk.Tk()
            window.title("Astro File Matches")
            window.geometry("900x450")
            label = ttk.Label(window, text="Double-click a file to open it")
            label.pack(pady=8)
            listbox = tk.Listbox(window, width=140, height=20)
            listbox.pack(fill="both", expand=True, padx=8, pady=8)
            for i, p in enumerate(matches, start=1):
                listbox.insert(tk.END, f"{i}. {p}")

            def open_selected(_event=None):
                selection = listbox.curselection()
                if not selection:
                    return
                idx = selection[0]
                if 0 <= idx < len(matches):
                    os.startfile(matches[idx])
                    speak(f"Opening file number {idx + 1}.")

            listbox.bind("<Double-Button-1>", open_selected)
            open_button = ttk.Button(window, text="Open Selected", command=open_selected)
            open_button.pack(pady=6)
            window.mainloop()
        except Exception:
            pass

    threading.Thread(target=_launch, daemon=True).start()

def show_dashboard():
    def _launch():
        try:
            import tkinter as tk
            from tkinter import ttk, messagebox

            window = tk.Tk()
            window.title("Astro App Mode")
            window.geometry("980x620")
            window.minsize(820, 520)

            style = ttk.Style(window)
            try:
                style.theme_use("clam")
            except Exception:
                pass

            notebook = ttk.Notebook(window)
            notebook.pack(fill="both", expand=True, padx=10, pady=10)

            status_tab = ttk.Frame(notebook)
            command_tab = ttk.Frame(notebook)
            activity_tab = ttk.Frame(notebook)
            contacts_tab = ttk.Frame(notebook)
            setup_tab = ttk.Frame(notebook)
            pairing_tab = ttk.Frame(notebook)

            notebook.add(status_tab, text="Status")
            notebook.add(command_tab, text="Command")
            notebook.add(activity_tab, text="Activity")
            notebook.add(contacts_tab, text="Contacts")
            notebook.add(pairing_tab, text="Pair Phone")
            notebook.add(setup_tab, text="Setup")

            def fill_text(widget, text):
                widget.configure(state="normal")
                widget.delete("1.0", tk.END)
                widget.insert(tk.END, text)
                widget.configure(state="disabled")

            status_text = tk.Text(status_tab, wrap="word", height=20)
            status_text.pack(fill="both", expand=True, padx=8, pady=8)

            def refresh_status():
                checks = build_setup_report()
                lines = [
                    "Astro is running.",
                    f"Active timers: {len(ACTIVE_TIMERS)}",
                    f"Active reminders: {len(ACTIVE_REMINDERS)}",
                    f"Recent actions: {len(ACTION_HISTORY)}",
                    "",
                    format_setup_report(checks),
                ]
                fill_text(status_text, "\n".join(lines))

            ttk.Button(status_tab, text="Refresh Status", command=refresh_status).pack(anchor="e", padx=8, pady=(0, 8))
            refresh_status()

            command_frame = ttk.Frame(command_tab)
            command_frame.pack(fill="x", padx=8, pady=8)
            command_var = tk.StringVar()
            command_entry = ttk.Entry(command_frame, textvariable=command_var)
            command_entry.pack(side="left", fill="x", expand=True)
            command_output = tk.Text(command_tab, wrap="word", height=20)
            command_output.pack(fill="both", expand=True, padx=8, pady=8)

            def run_typed_command(_event=None):
                cmd = command_var.get().strip().lower()
                if not cmd:
                    return
                command_var.set("")
                command_output.insert(tk.END, f"You typed: {cmd}\n")
                threading.Thread(target=process_command, args=(cmd,), daemon=True).start()

            ttk.Button(command_frame, text="Run", command=run_typed_command).pack(side="left", padx=(8, 0))
            command_entry.bind("<Return>", run_typed_command)

            help_text = tk.Text(command_tab, wrap="word", height=8)
            help_text.pack(fill="x", padx=8, pady=(0, 8))
            help_text.insert(tk.END, "\n".join(get_supported_commands_text()))
            help_text.configure(state="disabled")

            activity_text = tk.Text(activity_tab, wrap="word")
            activity_text.pack(fill="both", expand=True, padx=8, pady=8)

            def refresh_activity():
                lines = ["Timers:"]
                if ACTIVE_TIMERS:
                    for timer_id in ACTIVE_TIMERS:
                        lines.append(f"- Timer {timer_id}")
                else:
                    lines.append("- None")
                lines.append("")
                lines.append("Reminders:")
                if ACTIVE_REMINDERS:
                    for reminder_id in ACTIVE_REMINDERS:
                        lines.append(f"- Reminder {reminder_id}")
                else:
                    lines.append("- None")
                lines.append("")
                lines.append("Recent actions:")
                for action in ACTION_HISTORY[-20:]:
                    lines.append(f"- {action.get('detail', action.get('action_type', 'action'))}")
                fill_text(activity_text, "\n".join(lines))

            ttk.Button(activity_tab, text="Refresh Activity", command=refresh_activity).pack(anchor="e", padx=8, pady=(8, 0))
            refresh_activity()

            contacts_text = tk.Text(contacts_tab, wrap="word")
            contacts_text.pack(fill="both", expand=True, padx=8, pady=8)

            def refresh_contacts():
                contacts = load_contacts()["contacts"]
                if not contacts:
                    fill_text(contacts_text, "No saved contacts yet.")
                    return
                lines = [f"{name} -> {email}" for name, email in sorted(contacts.items())]
                fill_text(contacts_text, "\n".join(lines))

            contact_controls = ttk.Frame(contacts_tab)
            contact_controls.pack(fill="x", padx=8, pady=(0, 8))
            name_var = tk.StringVar()
            email_var = tk.StringVar()
            ttk.Entry(contact_controls, textvariable=name_var, width=24).pack(side="left")
            ttk.Entry(contact_controls, textvariable=email_var, width=36).pack(side="left", padx=8)

            def save_contact_from_ui():
                name = name_var.get().strip()
                email = email_var.get().strip()
                if not name or "@" not in email:
                    messagebox.showinfo("Astro", "Enter a contact name and valid email.")
                    return
                save_contact(name, email)
                name_var.set("")
                email_var.set("")
                refresh_contacts()

            ttk.Button(contact_controls, text="Save Contact", command=save_contact_from_ui).pack(side="left")
            ttk.Button(contact_controls, text="Refresh", command=refresh_contacts).pack(side="left", padx=8)
            refresh_contacts()

            pairing_url_var = tk.StringVar(value="")
            qr_label = ttk.Label(pairing_tab)
            qr_label.pack(pady=(22, 10))
            pairing_entry = ttk.Entry(pairing_tab, textvariable=pairing_url_var, font=("Segoe UI", 11))
            pairing_entry.pack(fill="x", padx=18, pady=8)
            pairing_status = ttk.Label(pairing_tab, text="Start Phone Mode to pair Astro Mobile.")
            pairing_status.pack(padx=18, pady=8)
            devices_text = tk.Text(pairing_tab, wrap="word", height=8)
            devices_text.pack(fill="both", expand=True, padx=18, pady=8)

            def refresh_phone_devices():
                data = load_phone_devices()["devices"]
                if not data:
                    fill_text(devices_text, "No phones have connected yet.")
                    return
                lines = []
                for ip_address, device in sorted(data.items()):
                    status = "Allowed" if device.get("allowed", True) else "Blocked"
                    lines.append(
                        f"{ip_address} - {status}\n"
                        f"  First seen: {device.get('first_seen', 'Unknown')}\n"
                        f"  Last seen: {device.get('last_seen', 'Unknown')}\n"
                        f"  Device: {device.get('user_agent', 'Unknown')}"
                    )
                fill_text(devices_text, "\n\n".join(lines))

            def start_pairing_from_ui():
                url = start_phone_server()
                pairing_url_var.set(url)
                qr_image = make_pairing_qr_image(url)
                if qr_image:
                    qr_label.configure(image=qr_image, text="")
                    qr_label.image = qr_image
                    pairing_status.configure(text="Scan this QR code in Astro Mobile, or paste the URL.")
                else:
                    qr_label.configure(image="", text="QR package unavailable. Use the URL below.")
                    qr_label.image = None
                    pairing_status.configure(text="QR generation failed. Use the URL below.")
                refresh_phone_devices()

            def revoke_all_from_ui():
                count = revoke_phone_access()
                reset_phone_pairing()
                pairing_url_var.set("")
                qr_label.configure(image="", text="")
                qr_label.image = None
                pairing_status.configure(text=f"Revoked {count} phone connection(s). Start pairing again to create a new QR.")
                refresh_phone_devices()

            pairing_controls = ttk.Frame(pairing_tab)
            pairing_controls.pack(fill="x", padx=18, pady=8)
            ttk.Button(pairing_controls, text="Start Phone Pairing", command=start_pairing_from_ui).pack(side="left")
            ttk.Button(pairing_controls, text="Refresh Phones", command=refresh_phone_devices).pack(side="left", padx=8)
            ttk.Button(pairing_controls, text="Revoke All Phones", command=revoke_all_from_ui).pack(side="left")
            refresh_phone_devices()

            setup_text = tk.Text(setup_tab, wrap="word")
            setup_text.pack(fill="both", expand=True, padx=8, pady=8)

            def refresh_setup():
                fill_text(setup_text, format_setup_report(build_setup_report()))

            def export_setup_from_ui():
                path, _checks = export_setup_report()
                refresh_setup()
                messagebox.showinfo("Astro", f"Setup report exported to:\n{path}")

            setup_controls = ttk.Frame(setup_tab)
            setup_controls.pack(fill="x", padx=8, pady=(0, 8))
            ttk.Button(setup_controls, text="Refresh Setup", command=refresh_setup).pack(side="left")
            ttk.Button(setup_controls, text="Export Report", command=export_setup_from_ui).pack(side="left", padx=8)
            refresh_setup()

            window.mainloop()
        except Exception as exc:
            speak(f"I could not open App Mode. {exc}")

    threading.Thread(target=_launch, daemon=True).start()

def get_lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

def get_phone_status():
    return {
        "active_timers": len(ACTIVE_TIMERS),
        "active_reminders": len(ACTIVE_REMINDERS),
        "recent_actions": [item.get("detail", item.get("action_type", "action")) for item in ACTION_HISTORY[-10:]],
        "messages": ASTRO_MESSAGES[-30:],
        "setup_attention": SETUP_ATTENTION_CACHE[:8],
        "paired_devices": load_phone_devices()["devices"],
        "screen_share": True,
    }

def capture_screen_jpeg(max_width=960, quality=55):
    errors = []
    try:
        image_grab = importlib.import_module("PIL.ImageGrab")
        screenshot = image_grab.grab()
    except Exception as exc:
        errors.append(f"Pillow ImageGrab failed: {exc}")
        try:
            mss_module = importlib.import_module("mss")
            image_module = importlib.import_module("PIL.Image")
            capture_class = getattr(mss_module, "MSS", None) or getattr(mss_module, "mss")
            with capture_class() as screen_capture:
                monitor = screen_capture.monitors[1]
                raw = screen_capture.grab(monitor)
                screenshot = image_module.frombytes("RGB", raw.size, raw.rgb)
        except Exception as mss_exc:
            errors.append(f"mss failed: {mss_exc}")
            return None, " ".join(errors)
    try:
        width, height = screenshot.size
        if width > max_width:
            new_height = int(height * (max_width / width))
            screenshot = screenshot.resize((max_width, new_height))
        output = io.BytesIO()
        screenshot.convert("RGB").save(output, format="JPEG", quality=quality, optimize=True)
        return output.getvalue(), None
    except Exception as exc:
        return None, f"screen encoding failed: {exc}"

def make_screen_error_jpeg(message, width=960, height=540):
    try:
        image_module = importlib.import_module("PIL.Image")
        draw_module = importlib.import_module("PIL.ImageDraw")
        image = image_module.new("RGB", (width, height), "#101510")
        draw = draw_module.Draw(image)
        lines = [
            "Screen preview is unavailable.",
            "",
            str(message)[:220],
            "",
            "Try launching Astro as the normal desktop app,",
            "then connect from your phone again."
        ]
        y = 90
        for line in lines:
            draw.text((50, y), line, fill="#f6f7f2")
            y += 34
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85)
        return output.getvalue()
    except Exception:
        return b""

def refresh_setup_attention_cache():
    global SETUP_ATTENTION_CACHE, SETUP_CACHE_UPDATED_AT
    try:
        SETUP_ATTENTION_CACHE = [item for item in build_setup_report() if item["status"] != "OK"]
        SETUP_CACHE_UPDATED_AT = datetime.datetime.now()
    except Exception:
        SETUP_ATTENTION_CACHE = []

def phone_app_html():
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Astro Phone Mode</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f2; --ink:#17201a; --muted:#5c665f; --line:#d9ded7; --accent:#176f5d; --panel:#ffffff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: var(--bg); color: var(--ink); }
    main { max-width: 760px; margin: 0 auto; padding: 18px; }
    header { padding: 18px 0 10px; }
    h1 { margin: 0; font-size: 34px; letter-spacing: 0; }
    p { color: var(--muted); margin: 8px 0 0; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 14px 0; }
    label { display: block; font-weight: 700; margin-bottom: 8px; }
    textarea { width: 100%; min-height: 92px; resize: vertical; border: 1px solid var(--line); border-radius: 6px; padding: 12px; font: 18px/1.35 system-ui, sans-serif; }
    button { width: 100%; border: 0; border-radius: 6px; background: var(--accent); color: white; padding: 13px 14px; margin-top: 10px; font: 700 17px system-ui, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .pill { border: 1px solid var(--line); border-radius: 6px; padding: 10px; background: #fbfcf9; }
    .screen { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: #101510; min-height: 160px; object-fit: contain; }
    .list { font: 14px/1.45 system-ui, sans-serif; white-space: pre-wrap; overflow-wrap: anywhere; }
    .msg { border-top: 1px solid var(--line); padding: 8px 0; }
    .time { color: var(--muted); font-size: 12px; }
    @media (max-width: 520px) { h1 { font-size: 28px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Astro</h1>
      <p>Phone Mode remote control</p>
    </header>
    <section>
      <label for="command">Command</label>
      <textarea id="command" placeholder="type: list all commands"></textarea>
      <button onclick="sendCommand()">Run Command</button>
    </section>
    <section>
      <div class="grid">
        <div class="pill"><strong id="timers">0</strong><br>Timers</div>
        <div class="pill"><strong id="reminders">0</strong><br>Reminders</div>
        <div class="pill"><strong id="issues">0</strong><br>Setup Notes</div>
      </div>
    </section>
    <section>
      <label>PC Screen Preview</label>
      <img id="screen" class="screen" alt="PC screen preview">
      <button onclick="refreshScreen()">Refresh Screen</button>
      <p>Refreshes protected screenshots using the same phone pairing token. Use revoke phone access if you no longer trust a phone.</p>
    </section>
    <section>
      <label>Astro Replies</label>
      <div id="messages" class="list"></div>
    </section>
    <section>
      <label>Recent Actions</label>
      <div id="actions" class="list"></div>
    </section>
    <section>
      <label>Setup Notes</label>
      <div id="setup" class="list"></div>
    </section>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || '';
    async function api(path, options = {}) {
      const sep = path.includes('?') ? '&' : '?';
      return fetch(path + sep + 'token=' + encodeURIComponent(token), options);
    }
    async function sendCommand() {
      const input = document.getElementById('command');
      const command = input.value.trim();
      if (!command) return;
      input.value = '';
      await api('/api/command', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({command})
      });
      setTimeout(loadStatus, 500);
    }
    async function loadStatus() {
      const res = await api('/api/status');
      if (!res.ok) return;
      const data = await res.json();
      document.getElementById('timers').textContent = data.active_timers;
      document.getElementById('reminders').textContent = data.active_reminders;
      document.getElementById('issues').textContent = data.setup_attention.length;
      document.getElementById('actions').textContent = data.recent_actions.join('\\n') || 'No actions yet.';
      document.getElementById('setup').textContent = data.setup_attention.map(x => x.name + ': ' + x.detail).join('\\n') || 'No setup notes.';
      document.getElementById('messages').innerHTML = data.messages.slice().reverse().map(m => '<div class="msg"><div class="time">' + m.time + '</div>' + escapeHtml(m.text) + '</div>').join('');
    }
    function refreshScreen() {
      const img = document.getElementById('screen');
      img.src = '/api/screen?token=' + encodeURIComponent(token) + '&t=' + Date.now();
    }
    function escapeHtml(text) {
      return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }
    loadStatus();
    refreshScreen();
    setInterval(loadStatus, 3000);
    setInterval(refreshScreen, 2000);
  </script>
</body>
</html>"""

class PhoneRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        return forwarded or self.client_address[0]

    def authorize_reason(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if params.get("token", [""])[0] != PHONE_ACCESS_TOKEN:
            return False, "The pairing token is invalid. Restart Phone Mode and use the new URL."
        ip_address = self.client_ip()
        if not is_phone_device_allowed(ip_address):
            return False, f"This phone ({ip_address}) was revoked. Say allow all phones or remove it from phone_devices.json."
        remember_phone_device(ip_address, self.headers.get("User-Agent", ""))
        return True, ""

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            body = phone_app_html().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        authorized, reason = self.authorize_reason()
        if not authorized:
            self.send_json({
                "error": "unauthorized",
                "reason": reason
            }, 403)
            return
        if parsed.path == "/api/status":
            self.send_json(get_phone_status())
            return
        if parsed.path == "/api/screen":
            image_bytes, error = capture_screen_jpeg()
            if not image_bytes:
                image_bytes = make_screen_error_jpeg(f"I could not capture the PC screen because {error}.")
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-store")
            if error:
                self.send_header("X-Astro-Screen-Error", urllib.parse.quote(error[:180]))
            self.send_header("Content-Length", str(len(image_bytes)))
            self.end_headers()
            self.wfile.write(image_bytes)
            return
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        authorized, reason = self.authorize_reason()
        if not authorized:
            self.send_json({
                "error": "unauthorized",
                "reason": reason
            }, 403)
            return
        if parsed.path == "/api/command":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                self.send_json({"error": "invalid json"}, 400)
                return
            command = str(payload.get("command", "")).strip().lower()
            if not command:
                self.send_json({"error": "empty command"}, 400)
                return
            threading.Thread(target=process_command, args=(command,), daemon=True).start()
            self.send_json({"ok": True})
            return
        self.send_json({"error": "not found"}, 404)

def start_phone_server(port=8765):
    global PHONE_SERVER, PHONE_ACCESS_TOKEN
    if PHONE_SERVER:
        return get_phone_url(port)
    # Starting a new Phone Mode session should not keep stale "blocked" state.
    allow_all_phone_devices()
    PHONE_ACCESS_TOKEN = secrets.token_urlsafe(12)
    PHONE_SERVER = ThreadingHTTPServer(("0.0.0.0", port), PhoneRequestHandler)
    threading.Thread(target=PHONE_SERVER.serve_forever, daemon=True).start()
    threading.Thread(target=refresh_setup_attention_cache, daemon=True).start()
    return get_phone_url(port)

def stop_phone_server():
    global PHONE_SERVER, PHONE_ACCESS_TOKEN
    if not PHONE_SERVER:
        return False
    server = PHONE_SERVER
    PHONE_SERVER = None
    PHONE_ACCESS_TOKEN = None
    threading.Thread(target=server.shutdown, daemon=True).start()
    server.server_close()
    return True

def get_phone_url(port=8765):
    host = get_lan_ip()
    return f"http://{host}:{port}/?token={PHONE_ACCESS_TOKEN}"

def make_pairing_qr_image(url, size=260):
    try:
        qrcode_module = importlib.import_module("qrcode")
        image_tk = importlib.import_module("PIL.ImageTk")
        qr = qrcode_module.QRCode(border=2, box_size=8)
        qr.add_data(url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        image = image.resize((size, size))
        return image_tk.PhotoImage(image)
    except Exception:
        return None

def read_file_aloud(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext in [".txt", ".md", ".csv", ".log", ".json", ".py"]:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read(2000)
        if ext == ".pdf":
            try:
                pypdf2 = importlib.import_module("PyPDF2")
                PdfReader = getattr(pypdf2, "PdfReader")
                reader = PdfReader(file_path)
                text = ""
                for page in reader.pages[:3]:
                    text += (page.extract_text() or "") + "\n"
                return text[:2000]
            except ImportError:
                return "PDF reading needs the PyPDF2 package. Install it or run setup on this laptop."
            except Exception:
                return None
        if ext == ".docx":
            try:
                docx_module = importlib.import_module("docx")
                doc = docx_module.Document(file_path)
                text = "\n".join(p.text for p in doc.paragraphs)
                return text[:2000]
            except ImportError:
                return "DOCX reading needs the python-docx package. Install it or run setup on this laptop."
            except Exception:
                return None
    except Exception:
        return None
    return None

def summarize_text(text, max_sentences=3):
    if not text:
        return None
    cleaned = " ".join(text.split())
    if not cleaned:
        return None
    sentences = re.split(r'(?<=[.!?])\s+', cleaned)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return cleaned[:300]
    # Keep short, meaningful sentences first.
    picked = []
    for s in sentences:
        if len(s.split()) >= 4:
            picked.append(s)
        if len(picked) >= max_sentences:
            break
    if not picked:
        picked = sentences[:max_sentences]
    summary = " ".join(picked)
    return summary[:500]

def close_target(target):
    known = {
        "chrome": "chrome.exe",
        "notepad": "notepad.exe",
        "calculator": "CalculatorApp.exe",
        "paint": "mspaint.exe",
        "cmd": "cmd.exe",
        "explorer": "explorer.exe",
    }
    process_name = known.get(target.lower(), target.lower())
    if not process_name.endswith(".exe"):
        process_name = process_name + ".exe"
    try:
        result = subprocess.run(
            ["taskkill", "/IM", process_name, "/F"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except Exception:
        return False

# ---------------- SMART MATCH ----------------
def closest_match(word, choices, cutoff=0.6):
    matches = difflib.get_close_matches(word, choices, n=1, cutoff=cutoff)
    return matches[0] if matches else None

# ---------------- COMMAND LEARNING ----------------
def load_commands():
    return load_json_or_default(COMMAND_FILE, {})

def save_commands(data):
    save_json(COMMAND_FILE, data)

def learn_command(trigger, actions):
    data = load_commands()
    data[trigger] = actions
    save_commands(data)

def run_learned_command(command):
    data = load_commands()
    if command in data:
        for act in data[command]:
            if act.startswith("open"):
                target = act.replace("open", "").strip()
                if not open_any_folder(target):
                    open_any_app(target)
        return True
    return False

# ---------------- OPEN ANY APP ----------------
def open_any_app(app_name):
    cache = load_paths()
    
    # 1. Check if we already found this app before
    if app_name in cache:
        try:
            os.startfile(cache[app_name])
            return True
        except:
            pass # Path might have changed, continue to search

    # 2. Try the easy names (your existing list)
    known_apps = ["chrome", "calculator", "notepad", "paint", "cmd"]
    corrected = closest_match(app_name, known_apps)
    if corrected:
        os.startfile(corrected)
        return True

    # 3. The "Slow Search" (only runs if cache fails)
    common_paths = [os.environ.get("ProgramFiles", ""), r"C:\Windows\System32"]
    for base in common_paths:
        for root, _, files in os.walk(base):
            for file in files:
                if file.lower() == (app_name + ".exe"):
                    full_path = os.path.join(root, file)
                    save_path(app_name, full_path) # SAVE TO CACHE
                    os.startfile(full_path)
                    return True
    return False

# ---------------- OPEN ANY FOLDER ----------------
def open_any_folder(folder_name):
    user_home = os.path.expanduser("~")

    common_folders = {
        "desktop": os.path.join(user_home, "Desktop"),
        "documents": os.path.join(user_home, "Documents"),
        "downloads": os.path.join(user_home, "Downloads"),
        "pictures": os.path.join(user_home, "Pictures"),
        "music": os.path.join(user_home, "Music"),
        "videos": os.path.join(user_home, "Videos")
    }

    corrected = closest_match(folder_name, common_folders.keys())
    if corrected:
        os.startfile(common_folders[corrected])
        return True

    for root, dirs, _ in os.walk(user_home):
        for d in dirs:
            if d.lower() == folder_name:
                os.startfile(os.path.join(root, d))
                return True
    return False

# ---------------- COMMAND PROCESSOR ----------------
def process_command(command):
    global PENDING_CONFIRMATION, PENDING_EMAIL
    command = command.strip()
    if not command:
        speak("Yes? I am listening.")
        return

    if PENDING_CONFIRMATION:
        if any(x in command for x in ["yes", "confirm", "do it", "okay", "ok"]):
            action = PENDING_CONFIRMATION
            PENDING_CONFIRMATION = None
            if action == "send_email":
                if not PENDING_EMAIL:
                    explain_failure("open the Gmail draft", "there is no pending email draft", "Create a draft first, like email Arun about project update.")
                    return
                open_gmail_compose(PENDING_EMAIL["to"], PENDING_EMAIL["subject"], PENDING_EMAIL["body"])
                add_history("email_compose", f"opening gmail compose for {PENDING_EMAIL['to']}", undoable=False)
                speak("Opening Gmail draft now. Please review and click send only if it looks correct.")
                PENDING_EMAIL = None
                return
            if action == "exit":
                add_history("exit", "asking Astro to exit", undoable=False)
                speak("Goodbye. Going offline now.")
                time.sleep(1)
                sys.exit()
            if action == "clear_memory":
                forget_all()
                add_history("clear_memory", "clearing all memories", undoable=False)
                speak("All memories cleared.")
                return
            speak("Done.")
            return
        if any(x in command for x in ["no", "cancel", "stop"]):
            PENDING_CONFIRMATION = None
            speak("Cancelled.")
            return
        speak("Please say yes to confirm or no to cancel.")
        return

    # Open a previously listed file by index: "open 2" or "open number 2"
    index_match = re.match(r"^open(?:\s+number)?\s+(\d+)$", command)
    if index_match:
        idx = int(index_match.group(1))
        if not LAST_FILE_MATCHES:
            speak("I don't have a recent file list yet. Say a file name first, like resume.")
            return
        if idx < 1 or idx > len(LAST_FILE_MATCHES):
            speak(f"Please choose a number between 1 and {len(LAST_FILE_MATCHES)}.")
            return
        selected = LAST_FILE_MATCHES[idx - 1]
        os.startfile(selected)
        add_history("open_file_index", f"opening file number {idx}", undoable=False)
        speak(f"Opening file number {idx}.")
        return

    if command in ["what did i do last", "last action", "what was my last action"]:
        speak(describe_last_action())
        return

    if command in ["undo last action", "undo", "revert last action"]:
        speak(undo_last_action())
        return

    if command in ["list all commands", "help commands", "what can you do"]:
        add_history("list_commands", "asking for supported commands", undoable=False)
        commands = get_supported_commands_text()
        speak("Here are my supported command categories. I am also showing the full list on screen.")
        for line in commands:
            speak(line)
        print("=== Astro Supported Commands ===")
        for idx, line in enumerate(commands, start=1):
            print(f"{idx}. {line}")
        return

    if command in ["app mode", "open dashboard", "show dashboard"]:
        add_history("open_dashboard", "opening Astro App Mode", undoable=False)
        show_dashboard()
        speak("Opening Astro App Mode.")
        return

    if command in ["phone mode", "mobile mode", "open phone mode"]:
        url = start_phone_server()
        add_history("phone_mode", "starting Astro Phone Mode", undoable=False)
        speak(f"Phone Mode is ready. Open this address on your phone: {url}")
        print(f"Astro Phone Mode: {url}")
        return

    if command in ["list paired phones", "show paired phones", "list phones"]:
        devices = load_phone_devices()["devices"]
        if not devices:
            speak("No phones have connected to Astro yet.")
            return
        allowed_count = sum(1 for device in devices.values() if device.get("allowed", True))
        speak(f"I found {len(devices)} phone connection record(s). {allowed_count} are currently allowed. Showing them on screen.")
        print("=== Astro Paired Phones ===")
        for ip_address, device in sorted(devices.items()):
            status = "allowed" if device.get("allowed", True) else "blocked"
            print(f"{ip_address} - {status} - last seen {device.get('last_seen', 'unknown')}")
        return

    if command in ["revoke phone access", "remove phone access", "block phones", "revoke all phones"]:
        count = revoke_phone_access()
        reset_phone_pairing()
        add_history("revoke_phone_access", "revoking phone access", undoable=False)
        speak(f"Revoked phone access for {count} allowed device(s). Start Phone Mode again to show a new pairing token.")
        return

    if command in ["allow all phones", "unblock phones", "restore phone access"]:
        count = allow_all_phone_devices()
        add_history("allow_all_phones", "allowing all known phones", undoable=False)
        speak(f"Allowed {count} previously blocked phone device(s).")
        return

    revoke_one_match = re.match(r"^(?:revoke|block) phone (.+)$", command)
    if revoke_one_match:
        ip_address = revoke_one_match.group(1).strip()
        count = revoke_phone_access(ip_address)
        if count:
            add_history("revoke_phone", f"revoking phone {ip_address}", undoable=False)
            speak(f"Blocked phone {ip_address}.")
        else:
            explain_failure(f"block phone {ip_address}", "I do not have that phone IP in the paired phone list", "Say list paired phones to see connected phones.")
        return

    if command in ["disconnect phone mode", "stop phone mode", "close phone mode"]:
        revoke_phone_access()
        if stop_phone_server():
            add_history("stop_phone_mode", "stopping Astro Phone Mode", undoable=False)
            speak("Phone Mode is stopped and phone access has been revoked.")
        else:
            speak("Phone Mode is already stopped.")
        return

    if command in ["check system", "run setup", "setup check"]:
        checks = build_setup_report()
        add_history("setup_check", "checking system compatibility", undoable=False)
        speak_setup_summary(checks)
        print_setup_report(checks)
        return

    if command == "export setup report":
        report_path, checks = export_setup_report()
        add_history("export_setup_report", "exporting setup report", undoable=False)
        speak_setup_summary(checks)
        speak(f"Setup report exported to {report_path}.")
        print_setup_report(checks)
        return

    save_contact_match = re.match(r"^save contact (.+?) (.+@.+\..+)$", command)
    if save_contact_match:
        name = save_contact_match.group(1).strip()
        email = save_contact_match.group(2).strip()
        save_contact(name, email)
        add_history("save_contact", f"saving contact {name}", undoable=False)
        speak(f"Saved contact {name}.")
        return

    if command in ["list contacts", "show contacts"]:
        contacts = load_contacts()["contacts"]
        if not contacts:
            speak("You do not have any saved contacts yet.")
            return
        speak(f"You have {len(contacts)} saved contacts. Showing them on screen.")
        print("=== Saved Contacts ===")
        for i, (name, email) in enumerate(sorted(contacts.items()), start=1):
            print(f"{i}. {name} -> {email}")
        return

    remove_contact_match = re.match(r"^(?:remove|delete) contact (.+)$", command)
    if remove_contact_match:
        name = remove_contact_match.group(1).strip()
        if remove_contact(name):
            add_history("remove_contact", f"removing contact {name}", undoable=False)
            speak(f"Removed contact {name}.")
        else:
            explain_failure(f"remove contact {name}", "that name is not saved in contacts", "Say list contacts to see saved names.")
        return

    translate_match = re.match(r"^translate (.+?) to (.+)$", command)
    if translate_match:
        text_to_translate = translate_match.group(1).strip()
        target_language = translate_match.group(2).strip()
        translated, error_code = translate_text(text_to_translate, target_language)
        if translated:
            add_history("translate", f"translating text to {target_language}", undoable=False)
            speak(f"In {target_language}, it is: {translated}")
            print(f"Translated ({target_language}): {translated}")
            return
        if error_code == "unsupported_language":
            speak("That language is not supported yet. Try english, tamil, or hindi.")
            return
        if error_code == "local_tamil_limited":
            explain_failure(
                "translate that fully to tamil",
                "my offline Tamil translator only knows common words and phrases right now",
                "Try a simpler sentence like translate hello friend to tamil."
            )
            return
        explain_failure(
            f"translate to {target_language}",
            "the offline translation engine or language model is not installed",
            "Run check system to see which translation models are missing."
        )
        return

    email_match = re.match(r"^(?:email|mail)\s+(.+?)\s+about\s+(.+)$", command)
    if email_match:
        target = email_match.group(1).strip()
        topic = email_match.group(2).strip()
        subject, body = build_email_draft_from_prompt(target, topic)
        # Resolve by contact name if available, otherwise use raw target.
        to_email = resolve_contact(target) or target
        PENDING_EMAIL = {"to": to_email, "subject": subject, "body": body}
        PENDING_CONFIRMATION = "send_email"
        speak(
            f"I drafted an email to {target} about {topic}. "
            "Do you want me to open Gmail compose now? Say yes to confirm or no to cancel."
        )
        return

    reminder_match = re.match(r"^remind me at (.+?) to (.+)$", command)
    if reminder_match:
        time_part = reminder_match.group(1).strip()
        message_part = reminder_match.group(2).strip()
        clock = parse_clock_time(time_part)
        if not clock:
            speak("Please say a valid time, like 6:30 PM.")
            return
        now = datetime.datetime.now()
        when_dt = datetime.datetime.combine(now.date(), clock)
        if when_dt <= now:
            when_dt = when_dt + datetime.timedelta(days=1)
        reminder_id = set_reminder_for_datetime(when_dt, message_part)
        if reminder_id is None:
            explain_failure("set that reminder", "the reminder time was not in the future", "Try a later time, like 6:30 PM.")
            return
        add_history("set_reminder", f"setting reminder {reminder_id} for {message_part}", undoable=False)
        speak(f"Reminder {reminder_id} set for {when_dt.strftime('%I:%M %p')}.")
        return

    rate_match = re.match(r"^set voice rate(?: to)? (\d+)$", command)
    if rate_match:
        rate = set_voice_rate(rate_match.group(1))
        add_history("set_voice_rate", f"setting voice rate to {rate}", undoable=False)
        speak(f"Voice rate set to {rate}.")
        return

    volume_match = re.match(r"^set volume(?: to)? (\d+)(?: ?percent)?$", command)
    if volume_match:
        percent = set_voice_volume(volume_match.group(1))
        add_history("set_volume", f"setting volume to {percent} percent", undoable=False)
        speak(f"Volume set to {percent} percent.")
        return

    if command in ["switch voice", "change voice", "next voice"]:
        new_voice = switch_voice()
        if new_voice:
            add_history("switch_voice", "switching assistant voice", undoable=False)
            speak(f"Voice switched to {new_voice}.")
        else:
            speak("I found only one voice on this system.")
        return

    if command.startswith("summarize file number "):
        num_text = command.replace("summarize file number", "", 1).strip()
        if num_text.isdigit():
            idx = int(num_text)
            if 1 <= idx <= len(LAST_FILE_MATCHES):
                raw_text = read_file_aloud(LAST_FILE_MATCHES[idx - 1])
                summary = summarize_text(raw_text)
                if summary:
                    add_history("summarize_file_number", f"summarizing file number {idx}", undoable=False)
                    speak("Here is the summary.")
                    speak(summary)
                else:
                    explain_failure("summarize that file", "I could not read enough text from it", "Try a text, markdown, PDF, or DOCX file.")
                return
        speak("Please give a valid file number from the latest list.")
        return

    if command.startswith("summarize "):
        target = command.replace("summarize", "", 1).strip()
        if not target:
            speak("Tell me what file to summarize.")
            return
        file_path = None
        if os.path.isfile(target):
            file_path = target
        else:
            matches = find_files_by_keyword(target, limit=1)
            if matches:
                file_path = matches[0]
        if not file_path:
            explain_failure("summarize that file", "I could not find a matching file", "Try saying the exact filename or search the name first.")
            return
        raw_text = read_file_aloud(file_path)
        summary = summarize_text(raw_text)
        if summary:
            add_history("summarize_file", f"summarizing file {os.path.basename(file_path)}", undoable=False)
            speak("Here is the summary.")
            speak(summary)
        else:
            explain_failure("summarize that file", "the file type is unsupported or has no readable text", "Try a text, markdown, PDF, or DOCX file.")
        return

    # If user says only a plain word/phrase (without command verbs),
    # treat it as a filename keyword search.
    if not any(command.startswith(x) for x in DIRECT_SEARCH_BLOCKERS):
        matches = find_files_by_keyword(command)
        if matches:
            show_file_matches(command, matches)
            return

    if command.startswith("open favorite "):
        alias = command.replace("open favorite", "", 1).strip()
        if not alias:
            speak("Tell me the favorite name to open.")
            return
        if open_favorite(alias):
            add_history("open_favorite", f"opening favorite {alias}", undoable=False)
            speak(f"Opening favorite {alias}.")
        else:
            explain_failure(f"open favorite {alias}", "that favorite name is not saved or its target no longer exists", "Pin it again or say list all commands for examples.")
        return

    if command.startswith("pin app "):
        raw = command.replace("pin app", "", 1).strip()
        if " as " in raw:
            app_target, alias = [x.strip() for x in raw.split(" as ", 1)]
            if app_target and alias:
                pin_favorite_app(alias, app_target)
                add_history("pin_app", f"pinning app {app_target} as favorite {alias}", undoable=False)
                speak(f"Pinned app {app_target} as favorite {alias}.")
                return
        speak("Say it like pin app chrome as browser.")
        return

    if command.startswith("pin file "):
        raw = command.replace("pin file", "", 1).strip()
        if " as " in raw:
            file_target, alias = [x.strip() for x in raw.split(" as ", 1)]
            if file_target and alias:
                resolved_path = None
                if os.path.isfile(file_target):
                    resolved_path = os.path.abspath(file_target)
                else:
                    matches = find_files_by_keyword(file_target, limit=1)
                    if matches:
                        resolved_path = matches[0]
                if resolved_path:
                    pin_favorite_file(alias, resolved_path)
                    add_history("pin_file", f"pinning a file as favorite {alias}", undoable=False)
                    speak(f"Pinned file as favorite {alias}.")
                    return
        speak("Say it like pin file resume.pdf as my resume.")
        return

    # ---------------- RUN LEARNED COMMAND ----------------
    if run_learned_command(command):
        add_history("learned_command", f"running learned command {command}", undoable=False)
        speak("Done.")
        return

    # ---------------- LEARN NEW COMMAND ----------------
    elif command.startswith("when i say"):
        parts = command.replace("when i say", "").split(",")
        trigger = parts[0].strip()
        actions = [p.strip() for p in parts[1:]]
        if trigger and actions:
            learn_command(trigger, actions)
            add_history("learn_command", f"learning command trigger {trigger}", undoable=False)
            speak("I have learned a new command.")
        else:
            speak("Tell me what to learn.")
        return

    # ---------------- EXIT ----------------
    if any(x in command for x in EXIT_WORDS):
        PENDING_CONFIRMATION = "exit"
        speak("Do you want me to exit? Say yes to confirm or no to cancel.")
        return

    # ---------------- TIMER ----------------
    elif "set timer" in command or command.startswith("timer"):
        seconds = parse_timer_seconds(command)
        if seconds <= 0:
            speak("Tell me a valid duration, like 10 seconds or 2 minutes.")
            return
        timer_id = set_timer(seconds)
        add_history(
            "set_timer",
            f"setting timer {timer_id} for {format_duration(seconds)}",
            undoable=True,
            undo_data={"timer_id": timer_id}
        )
        speak(f"Timer {timer_id} set for {format_duration(seconds)}.")
        return

    # ---------------- OPEN ----------------
    if command.startswith("open"):
        target = command.replace("open", "").strip()
        if not target:
            speak("Tell me what to open.")
            return

        # Handle phrases like "open file resume.pdf"
        if target.startswith("file "):
            target = target.replace("file ", "", 1).strip()

        # For plain names like "chrome", try app launch first to avoid
        # accidentally opening file-search results.
        is_plain_target = "." not in os.path.basename(target) and "\\" not in target and "/" not in target
        if is_plain_target and open_any_app(target):
            add_history("open_app", f"opening {target}", undoable=False)
            speak(f"Opening {target}.")
            return

        # If plain name still wasn't an app, offer matching files.
        if is_plain_target:
            matches = find_files_by_keyword(target)
            if matches:
                show_file_matches(target, matches)
                return

        if open_any_folder(target):
            add_history("open_folder", f"opening {target}", undoable=False)
            speak(f"Opening {target}.")
            return

        if open_any_file(target):
            add_history("open_file", f"opening {target}", undoable=False)
            speak(f"Opening {target}.")
            return

        if open_any_app(target):
            add_history("open_app", f"opening {target}", undoable=False)
            speak(f"Opening {target}.")
            return

        explain_failure(
            f"open {target}",
            "I did not find a matching folder, file, app, or cached path",
            "Try the exact filename with extension, or say just the file keyword to search."
        )

    # ---------------- CLOSE ----------------
    elif command.startswith("close "):
        target = command.replace("close", "", 1).strip()
        if not target:
            speak("Tell me what to close.")
            return
        if target.startswith("favorite "):
            alias = target.replace("favorite", "", 1).strip()
            data = load_favorites()
            app_target = data["apps"].get(alias.lower())
            if app_target and close_target(app_target):
                add_history("close_favorite", f"closing favorite {alias}", undoable=False)
                speak(f"Closing favorite {alias}.")
                return
            explain_failure(f"close favorite {alias}", "that favorite is not saved as an app or the process is not running")
            return
        if close_target(target):
            add_history("close_target", f"closing {target}", undoable=False)
            speak(f"Closing {target}.")
        else:
            explain_failure(f"close {target}", "Windows did not find a running process with that name", "Try the app name, like chrome or notepad.")

    # ---------------- READ FILE ----------------
    elif command.startswith("read file number "):
        num_text = command.replace("read file number", "", 1).strip()
        if num_text.isdigit():
            idx = int(num_text)
            if 1 <= idx <= len(LAST_FILE_MATCHES):
                text = read_file_aloud(LAST_FILE_MATCHES[idx - 1])
                if text:
                    add_history("read_file_number", f"reading file number {idx}", undoable=False)
                    speak("Reading now.")
                    speak(text)
                else:
                    explain_failure("read that file", "the file type is unsupported or it has no readable text", "Try a text, markdown, PDF, DOCX, CSV, JSON, or Python file.")
                return
        speak("Please give a valid file number from the latest list.")

    elif command.startswith("read "):
        target = command.replace("read", "", 1).strip()
        if not target:
            speak("Tell me what file to read.")
            return
        file_path = None
        if os.path.isfile(target):
            file_path = target
        else:
            matches = find_files_by_keyword(target, limit=1)
            if matches:
                file_path = matches[0]
        if not file_path:
            explain_failure("read that file", "I could not find a matching file", "Try the exact filename or search the file name first.")
            return
        text = read_file_aloud(file_path)
        if text:
            add_history("read_file", f"reading file {os.path.basename(file_path)}", undoable=False)
            speak("Reading now.")
            speak(text)
        else:
            explain_failure("read that file", "the file type is unsupported or it has no readable text", "Try a text, markdown, PDF, DOCX, CSV, JSON, or Python file.")

    # ---------------- RECALL MEMORY ----------------
    elif "what" in command and "remember" in command:
        memories = recall_all()
        if memories:
            speak("Here is what I remember.")
            for m in memories:
                speak(m)
        else:
            speak("I don't remember anything yet.")

    # ---------------- SAVE MEMORY ----------------
    elif "remember" in command:
        fact = command.replace("remember", "").strip()
        if fact:
            remember(fact)
            add_history("remember", f"remembering {fact}", undoable=True, undo_data={"value": fact})
            speak("Got it. I will remember that.")
        else:
            speak("What should I remember?")

    # ---------------- FORGET ----------------
    elif "forget everything" in command or "clear memory" in command:
        PENDING_CONFIRMATION = "clear_memory"
        speak("Do you want to clear all memories? Say yes to confirm or no to cancel.")

    elif "forget last memory" in command:
        current_memories = recall_all()
        last_memory = current_memories[-1] if current_memories else None
        if forget_last():
            add_history(
                "forget_last_memory",
                "forgetting the last memory",
                undoable=True,
                undo_data={"value": last_memory}
            )
            speak("I forgot the last memory.")
        else:
            speak("I don't have anything to forget.")

    # ---------------- CALCULATOR / ADVANCED MATH ----------------
    elif "calculate" in command:
        expr = command.replace("calculate", "").strip()
        
        # Word-to-Symbol mappings
        replacements = {
            "plus": "+", "minus": "-", "times": "*", "x": "*",
            "divided by": "/", "over": "/", "to the power of": "**",
            "power": "**", "square root of": "math.sqrt", 
            "factorial of": "math.factorial"
        }
        
        for word, symbol in replacements.items():
            expr = expr.replace(word, symbol)

        try:
            # We only allow 'math' functions and basic numbers
            allowed_names = {"math": math, "sqrt": math.sqrt, "factorial": math.factorial}
            result = eval(expr, {"__builtins__": None}, allowed_names)
            add_history("calculate", f"calculating {expr}", undoable=False)
            speak(f"The answer is {result}")
        except Exception as exc:
            explain_failure("calculate that", f"the expression was not valid: {exc}", "Try saying calculate 25 plus 17.")

    # ---------------- WEB SEARCH ----------------
    elif "search for" in command or "google" in command:
        query = command.replace("search for", "").replace("google", "").strip()
        if query:
            import webbrowser
            add_history("search_web", f"searching for {query}", undoable=False)
            speak(f"Searching for {query} on Google.")
            webbrowser.open(f"https://www.google.com/search?q={query}")
        else:
            speak("What should I search for?")

    # ---------------- DAILY BRIEFING ----------------
    elif command in ["good morning", "daily briefing", "briefing"]:
        now = datetime.datetime.now()
        memory_count = len(recall_all())
        active_count = len(ACTIVE_TIMERS)
        add_history("daily_briefing", "asking for daily briefing", undoable=False)
        speak(
            f"Good morning. Today is {now.strftime('%A, %B %d, %Y')}. "
            f"The time is {now.strftime('%I:%M %p')}. "
            f"You have {memory_count} saved memories and {active_count} active timers."
        )

    else:
        speak("I heard you.")

def callback(recognizer, audio):
    try:
        # Use Google for the actual processing
        speech = recognizer.recognize_google(audio).lower()
        print(f"Detected: {speech}")

        if "astro" in speech:
            # Strip the wake word and process the rest
            command = speech.replace("astro", "").strip()
            if command:
                process_command(command)
            else:
                speak("Yes? I am listening.")
    except sr.UnknownValueError:
        pass # Ignore background noise it can't understand
    except sr.RequestError:
        speak("I am having a network issue right now. Please try again.")

def main():
    global PHONE_ONLY_MODE
    phone_only = "--phone-only" in sys.argv
    PHONE_ONLY_MODE = phone_only
    if "--app" in sys.argv or "--dashboard" in sys.argv:
        show_dashboard()
    if "--phone" in sys.argv or "--mobile" in sys.argv or phone_only:
        url = start_phone_server()
        print(f"Astro Phone Mode: {url}")
    if phone_only:
        print("Astro Phone Mode is running without microphone listener.")
        while True:
            time.sleep(0.1)
    speak("Hello. I am Astro. Ready to learn, calculate, and assist!")
    if "--phone" in sys.argv or "--mobile" in sys.argv:
        speak(f"Phone Mode is ready. Open this address on your phone: {url}")

    # phrase_time_limit ensures it doesn't wait forever for you to stop talking.
    stop_listening = r.listen_in_background(sr.Microphone(), callback, phrase_time_limit=5)

    print("Astro is now running in the background. Say 'Astro' to wake me up!")
    speak("Astro is now running in the background. Say Astro to wake me up.")

    try:
        while True:
            time.sleep(0.1)
    finally:
        stop_listening(wait_for_stop=False)

if __name__ == "__main__":
    main()
