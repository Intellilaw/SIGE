import type { ExpoConfig } from "expo/config";
import { APP_VERSION } from "@sige/contracts";

const config: ExpoConfig = {
  name: "SIGE Mobile",
  slug: "sige-mobile",
  version: APP_VERSION,
  orientation: "portrait",
  icon: "./assets/app-icon.png",
  userInterfaceStyle: "light",
  scheme: "sige",
  splash: {
    image: "./assets/app-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  android: {
    package: "com.intellilaw.sige.mobile",
    versionCode: 4,
    adaptiveIcon: {
      foregroundImage: "./assets/app-icon.png",
      backgroundColor: "#ffffff"
    }
  },
  extra: {
    eas: {
      projectId: "e7d2e8bd-325d-4dee-a605-6b1420f49957"
    }
  }
};

export default config;
