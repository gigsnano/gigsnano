export interface IPushPreferences {
  realtime: boolean;
  briefing: boolean;
}

export interface IRegisterDevicePayload {
  token: string;
  platform: "ios" | "android";
  device_name: string;
}

export interface IRegisteredDevice {
  id: string;
  platform: string;
  device_name: string;
}
