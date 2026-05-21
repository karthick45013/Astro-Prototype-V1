import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";

const PAIR_URL_KEY = "astro_pair_url";

function parseAstroUrl(value) {
  try {
    const parsed = new URL(value.trim());
    return {
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      token: parsed.searchParams.get("token") || "",
    };
  } catch (_error) {
    return { baseUrl: "", token: "" };
  }
}

export default function App() {
  const [pairUrl, setPairUrl] = useState("");
  const [command, setCommand] = useState("");
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("Paste the Phone Mode URL from Astro Desktop.");
  const [screenTick, setScreenTick] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const connection = useMemo(() => parseAstroUrl(pairUrl), [pairUrl]);
  const isPaired = Boolean(connection.baseUrl && connection.token);
  const screenUrl = isPaired
    ? `${connection.baseUrl}/api/screen?token=${encodeURIComponent(connection.token)}&t=${screenTick}`
    : "";

  useEffect(() => {
    AsyncStorage.getItem(PAIR_URL_KEY).then((savedUrl) => {
      if (savedUrl) {
        setPairUrl(savedUrl);
        setMessage("Saved desktop pairing loaded.");
      }
    });
  }, []);

  useEffect(() => {
    if (!isPaired) return undefined;
    const timer = setInterval(() => setScreenTick(Date.now()), 2500);
    return () => clearInterval(timer);
  }, [isPaired]);

  async function astroFetch(path, options) {
    const separator = path.includes("?") ? "&" : "?";
    return fetch(`${connection.baseUrl}${path}${separator}token=${encodeURIComponent(connection.token)}`, options);
  }

  async function refreshStatus() {
    if (!isPaired) {
      setMessage("Enter the full Phone Mode URL first.");
      return;
    }
    try {
      const res = await astroFetch("/api/status");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setMessage(errorData.reason || `Could not connect: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setStatus(data);
      setScreenTick(Date.now());
      await AsyncStorage.setItem(PAIR_URL_KEY, pairUrl.trim());
      setMessage("Connected to Astro Desktop.");
    } catch (error) {
      setMessage(`Could not connect: ${error.message}`);
    }
  }

  async function sendCommand() {
    const trimmed = command.trim();
    if (!trimmed) return;
    if (!isPaired) {
      setMessage("Enter the full Phone Mode URL first.");
      return;
    }
    setCommand("");
    try {
      const res = await astroFetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setMessage(errorData.reason || errorData.error || `Command failed: HTTP ${res.status}`);
        return;
      }
      setMessage(`Sent: ${trimmed}`);
      setTimeout(refreshStatus, 600);
    } catch (error) {
      setMessage(`Command failed: ${error.message}`);
    }
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMessage("Camera permission is needed to scan the desktop QR code.");
        return;
      }
    }
    setScannerOpen(true);
  }

  function handleQrScanned(result) {
    const value = result?.data || "";
    const parsed = parseAstroUrl(value);
    if (!parsed.baseUrl || !parsed.token) {
      setMessage("That QR code is not an Astro pairing link.");
      return;
    }
    setPairUrl(value);
    setScannerOpen(false);
    setMessage("QR pairing loaded. Tap Connect.");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      {scannerOpen ? (
        <View style={styles.scannerPage}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleQrScanned}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={() => setScannerOpen(false)}>
            <Text style={styles.buttonText}>Cancel Scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>Astro</Text>
        <Text style={styles.subtitle}>Mobile companion</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Phone Mode URL</Text>
          <TextInput
            value={pairUrl}
            onChangeText={setPairUrl}
            placeholder="http://192.168.x.x:8765/?token=..."
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TouchableOpacity style={styles.button} onPress={refreshStatus}>
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={openScanner}>
            <Text style={styles.secondaryButtonText}>Scan Desktop QR</Text>
          </TouchableOpacity>
          <Text style={styles.note}>{message}</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>Command</Text>
          <TextInput
            value={command}
            onChangeText={setCommand}
            placeholder="list all commands"
            multiline
            style={[styles.input, styles.commandInput]}
          />
          <TouchableOpacity style={styles.button} onPress={sendCommand}>
            <Text style={styles.buttonText}>Run Command</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>PC Screen Preview</Text>
          {isPaired ? (
            <Image
              source={{ uri: screenUrl }}
              resizeMode="contain"
              style={styles.screenPreview}
              onError={() => setMessage("Could not load PC screen preview. Check pairing and Phone Mode.")}
            />
          ) : (
            <Text style={styles.empty}>Connect to Astro Desktop first.</Text>
          )}
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreenTick(Date.now())}>
            <Text style={styles.secondaryButtonText}>Refresh Screen</Text>
          </TouchableOpacity>
          <Text style={styles.note}>This refreshes protected screenshots from Astro Desktop. Revoke phone access from Astro Desktop if needed.</Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>Astro Replies</Text>
          {(status?.messages || []).slice().reverse().map((item, index) => (
            <View key={`${item.time}-${index}`} style={styles.message}>
              <Text style={styles.time}>{item.time}</Text>
              <Text style={styles.body}>{item.text}</Text>
            </View>
          ))}
          {!status?.messages?.length && <Text style={styles.empty}>No replies yet.</Text>}
        </View>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f7f2" },
  page: { padding: 18, paddingBottom: 36 },
  title: { fontSize: 38, fontWeight: "700", color: "#17201a" },
  subtitle: { fontSize: 17, color: "#5c665f", marginBottom: 16 },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d9ded7",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  label: { fontSize: 16, fontWeight: "700", color: "#17201a", marginBottom: 8 },
  input: {
    minHeight: 46,
    borderColor: "#d9ded7",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#17201a",
    backgroundColor: "#fbfcf9",
  },
  commandInput: { minHeight: 92, textAlignVertical: "top" },
  screenPreview: {
    width: "100%",
    height: 220,
    borderColor: "#d9ded7",
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: "#101510",
  },
  button: {
    backgroundColor: "#176f5d",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    borderColor: "#176f5d",
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryButtonText: { color: "#176f5d", fontSize: 16, fontWeight: "700" },
  note: { color: "#5c665f", marginTop: 10, fontSize: 14 },
  scannerPage: { flex: 1, backgroundColor: "#101510" },
  camera: { flex: 1 },
  cancelButton: {
    backgroundColor: "#176f5d",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    margin: 18,
  },
  message: { borderTopColor: "#d9ded7", borderTopWidth: 1, paddingVertical: 9 },
  time: { color: "#5c665f", fontSize: 12 },
  body: { color: "#17201a", fontSize: 15, lineHeight: 22, marginTop: 3 },
  empty: { color: "#5c665f", fontSize: 15 },
});
