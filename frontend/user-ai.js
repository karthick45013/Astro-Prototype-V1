(() => {
  const createUserAI = () => {
    const voiceIcon = document.getElementById("voice-icon");
    const featureLogout = document.getElementById("feature-logout");

    let recognition = null;
    let isListening = false;
    let shouldKeepListening = false;

    const setupVoiceAssistant = () => {
      if (!voiceIcon) return;
      if (voiceIcon.dataset.aiBound === "true") return;
      voiceIcon.dataset.aiBound = "true";

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const supportsSpeech = Boolean(SpeechRecognition);

      const runVoiceCommand = (text) => {
        const msg = text.toLowerCase();
        if (msg.includes("open profile") || msg === "profile") {
          window.location.href = "profile.html";
          return "Opening profile page.";
        }
        if (msg.includes("open settings") || msg.includes("settings")) {
          window.location.href = "settings.html";
          return "Opening settings page.";
        }
        if (msg.includes("sign out") || msg.includes("logout")) {
          featureLogout?.click();
          return "Signing you out.";
        }
        if (msg.includes("go home") || msg.includes("back home")) {
          window.location.href = "index.html";
          return "Going to home page.";
        }
        return "Command not recognized. Try: open profile, open settings, sign out.";
      };

      if (supportsSpeech) {
        recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onstart = () => {
          isListening = true;
        };
        recognition.onend = () => {
          isListening = false;
          if (!shouldKeepListening) return;
          setTimeout(() => {
            if (!shouldKeepListening || !recognition) return;
            try {
              recognition.start();
            } catch (_) {
              // ignore repeated start calls
            }
          }, 120);
        };
        recognition.onerror = () => {};
        recognition.onresult = (event) => {
          const text = event.results?.[0]?.[0]?.transcript || "";
          if (!text) return;
          runVoiceCommand(text);
        };
      }

      voiceIcon.addEventListener("click", () => {
        if (!supportsSpeech || !recognition) return;
        if (shouldKeepListening) {
          shouldKeepListening = false;
          if (!isListening) return;
          recognition.stop();
          return;
        }
        shouldKeepListening = true;
        try {
          recognition.start();
        } catch (_) {
          // ignore repeated start calls
        }
      });
    };

    setupVoiceAssistant();
  };

  window.initUserAI = createUserAI;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      createUserAI();
    });
  } else {
    createUserAI();
  }
})();
