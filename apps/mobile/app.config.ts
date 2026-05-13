import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "SIGE Mobile",
  slug: "sige-mobile",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  scheme: "sige",
  android: {
    package: "com.intellilaw.sige.mobile",
    versionCode: 1
  },
  extra: {
    eas: {
      projectId: "e7d2e8bd-325d-4dee-a605-6b1420f49957"
    }
  }
};

export default config;
