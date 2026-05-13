import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";

const DEFAULT_SIGE_MOBILE_URL = "https://pruebasb.online/mobile";
const SIGE_MOBILE_URL = process.env.EXPO_PUBLIC_SIGE_MOBILE_URL?.trim() || DEFAULT_SIGE_MOBILE_URL;
function withCacheBuster(url: string, nonce: number) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}expo=${nonce}`;
}

function isWebAppRoute(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/app" || parsed.pathname.startsWith("/app/");
  } catch {
    return false;
  }
}

const WEBVIEW_DEBUG_SCRIPT = `
  (function () {
    function send(type, value) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, value: String(value || "") }));
    }
    window.addEventListener("error", function (event) {
      send("error", event.message + " @ " + (event.filename || "") + ":" + (event.lineno || ""));
    });
    window.addEventListener("unhandledrejection", function (event) {
      send("rejection", event.reason && (event.reason.stack || event.reason.message || event.reason));
    });
    document.addEventListener("DOMContentLoaded", function () {
      send("dom", document.body ? document.body.innerText.slice(0, 240) : "sin body");
    });
    setTimeout(function () {
      var root = document.getElementById("root");
      var rootText = root ? root.innerText.slice(0, 240) : "sin root";
      send("snapshot", rootText || "root vacio");
    }, 1500);
    setTimeout(function () {
      var root = document.getElementById("root");
      var rootText = root ? root.innerText.slice(0, 240) : "sin root";
      send("snapshot", rootText || "root vacio despues de 4s");
    }, 4000);
  })();
  true;
`;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(() => Date.now());
  const [debugMessage, setDebugMessage] = useState(`Abriendo ${SIGE_MOBILE_URL}`);
  const webViewUrl = withCacheBuster(SIGE_MOBILE_URL, reloadNonce);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) {
        return false;
      }

      webViewRef.current?.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  function handleNavigationStateChange(event: WebViewNavigation) {
    if (isWebAppRoute(event.url)) {
      setDebugMessage(`Redirigiendo a SIGE Mobile`);
      setReloadNonce(Date.now());
      return;
    }

    setCanGoBack(event.canGoBack);
    setDebugMessage(`${event.loading ? "Cargando" : "Listo"} ${event.url}`);
  }

  function reload() {
    setDebugMessage(`Recargando ${SIGE_MOBILE_URL}`);
    setReloadNonce(Date.now());
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SIGE</Text>
          <Text style={styles.title}>Mobile</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={reload}>
          <Text style={styles.headerButtonText}>Recargar</Text>
        </Pressable>
      </View>

      <WebView
        key={reloadNonce}
        ref={webViewRef}
        source={{ uri: webViewUrl }}
        style={styles.webview}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="always"
        injectedJavaScriptBeforeContentLoaded={WEBVIEW_DEBUG_SCRIPT}
        injectedJavaScript={WEBVIEW_DEBUG_SCRIPT}
        onLoadStart={(event) => setDebugMessage(`Cargando ${event.nativeEvent.url}`)}
        onLoadEnd={(event) => setDebugMessage(`Carga terminada ${event.nativeEvent.url}`)}
        onHttpError={(event) => {
          setDebugMessage(`HTTP ${event.nativeEvent.statusCode} ${event.nativeEvent.url}`);
        }}
        onError={(event) => {
          setDebugMessage(`Error WebView: ${event.nativeEvent.description}`);
        }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data) as { type?: string; value?: string };
            if (payload.value) {
              setDebugMessage(`${payload.type ?? "web"}: ${payload.value}`);
            }
          } catch {
            setDebugMessage(event.nativeEvent.data);
          }
        }}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#155e75" size="large" />
            <Text style={styles.loadingText}>Cargando SIGE Mobile...</Text>
          </View>
        )}
        renderError={(_, __, description) => (
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>No se pudo cargar SIGE Mobile</Text>
            <Text style={styles.errorDescription}>{description}</Text>
            <Text style={styles.errorUrl}>{SIGE_MOBILE_URL}</Text>
            <Pressable style={styles.errorButton} onPress={reload}>
              <Text style={styles.errorButtonText}>Intentar otra vez</Text>
            </Pressable>
          </View>
        )}
      />
      <View style={styles.debugBar}>
        <Text style={styles.debugText} numberOfLines={3}>{debugMessage}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  header: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderBottomColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  eyebrow: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1
  },
  title: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800"
  },
  headerButton: {
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  headerButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  },
  webview: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  debugBar: {
    backgroundColor: "#0f172a",
    borderTopColor: "rgba(255,255,255,0.12)",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  debugText: {
    color: "#cbd5e1",
    fontSize: 10,
    lineHeight: 13
  },
  loading: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    bottom: 0,
    gap: 12,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  loadingText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "600"
  },
  errorState: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  errorTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center"
  },
  errorDescription: {
    color: "#475569",
    fontSize: 14,
    textAlign: "center"
  },
  errorUrl: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center"
  },
  errorButton: {
    backgroundColor: "#155e75",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  errorButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  }
});
