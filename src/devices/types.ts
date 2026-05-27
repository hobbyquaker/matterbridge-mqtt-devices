/**
 * Shared types, constants, and interfaces for matterbridge-mqtt device descriptors.
 */

import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';

// ── Device kinds ───────────────────────────────────────────────────────────

export type DeviceKind =
  | 'on-off-outlet'
  | 'on-off-switch'
  | 'dimmable-light'
  | 'color-temperature-light'
  | 'contact-sensor'
  | 'temperature-sensor'
  | 'humidity-sensor'
  | 'occupancy-sensor'
  | 'cover'
  | 'fan'
  | 'thermostat'
  | 'on-off-light'
  | 'dimmable-outlet'
  | 'generic-switch'
  | 'door-lock'
  | 'light-sensor'
  | 'rain-sensor'
  | 'water-leak-detector'
  | 'smoke-co-alarm'
  | 'soil-sensor';

// ── Cluster IDs ────────────────────────────────────────────────────────────

export const CID = {
  OnOff: 0x0006,
  LevelControl: 0x0008,
  ColorControl: 0x0300,
  BooleanState: 0x0045,
  TemperatureMeasurement: 0x0402,
  RelativeHumidityMeasurement: 0x0405,
  OccupancySensing: 0x0406,
  WindowCovering: 0x0102,
  FanControl: 0x0202,
  Thermostat: 0x0201,
  DoorLock: 0x0101,
  IlluminanceMeasurement: 0x0400,
  SmokeCoAlarm: 0x005c,
} as const;

// ── Device config ──────────────────────────────────────────────────────────

export interface MqttDeviceConfig {
  id?: string;
  name: string;
  type?: DeviceKind;
  configUrl?: string;

  topicOnOff?: string;
  payloadOnOffJsonPath?: string;
  topicSetOnOff?: string;
  payloadOn?: string;
  payloadOff?: string;
  retain?: boolean;

  // availability / online state
  topicAvailability?: string;
  payloadpayloadAvailabilityJsonPath?: string;
  payloadOnline?: string;
  payloadOffline?: string;

  // power source
  powerSource?: 'battery' | 'mains';

  // battery (value-based or boolean)
  topicBattery?: string;
  payloadpayloadBatteryJsonPath?: string;
  batteryValueBased?: boolean;
  batteryMin?: number;
  batteryMax?: number;
  payloadBatteryFull?: string;
  payloadBatteryEmpty?: string;

  // brightness (dimmable + colorlight)
  topicCurrentLevel?: string;
  payloadCurrentLevelJsonPath?: string;
  topicMoveToLevel?: string;
  topicMoveToLevelWithOnOff?: string;
  brightnessMin?: number;
  brightnessMax?: number;

  // color (colorlight)
  topicColor?: string;
  payloadColorJsonPath?: string;
  topicSetColor?: string;

  // cover
  payloadOpen?: string;
  payloadClosed?: string;
  topicPosition?: string;
  payloadPositionJsonPath?: string;
  topicSetPosition?: string;
  positionMin?: number;
  positionMax?: number;
  payloadStop?: string;

  // fan
  topicSpeed?: string;
  payloadSpeedJsonPath?: string;
  topicSetSpeed?: string;
  topicSetSpeedStep?: string;
  speedMin?: number;
  speedMax?: number;

  // thermostat
  topicTargetTemp?: string;
  payloadTargetTempJsonPath?: string;
  topicSetTargetTemp?: string;

  // generic_switch
  payloadPress?: string;
  payloadDouble?: string;
  payloadLong?: string;

  // door_lock
  payloadLocked?: string;
  payloadUnlocked?: string;

  // smoke_alarm
  payloadAlarmNormal?: string;
  payloadAlarmWarning?: string;
  payloadAlarmCritical?: string;
  topicCo?: string;
  payloadCoJsonPath?: string;
}

// ── Editable keys for the web editor ──────────────────────────────────────

export type EditableDeviceKey =
  | 'topicOnOff'
  | 'payloadOnOffJsonPath'
  | 'topicSetOnOff'
  | 'payloadOn'
  | 'payloadOff'
  | 'retain'
  | 'topicAvailability'
  | 'payloadpayloadAvailabilityJsonPath'
  | 'payloadOnline'
  | 'payloadOffline'
  | 'powerSource'
  | 'topicBattery'
  | 'payloadpayloadBatteryJsonPath'
  | 'batteryValueBased'
  | 'batteryMin'
  | 'batteryMax'
  | 'payloadBatteryFull'
  | 'payloadBatteryEmpty'
  | 'topicCurrentLevel'
  | 'payloadCurrentLevelJsonPath'
  | 'topicMoveToLevel'
  | 'topicMoveToLevelWithOnOff'
  | 'brightnessMin'
  | 'brightnessMax'
  | 'topicColor'
  | 'payloadColorJsonPath'
  | 'topicSetColor'
  | 'payloadOpen'
  | 'payloadClosed'
  | 'payloadStop'
  | 'topicPosition'
  | 'payloadPositionJsonPath'
  | 'topicSetPosition'
  | 'positionMin'
  | 'positionMax'
  | 'topicSpeed'
  | 'payloadSpeedJsonPath'
  | 'topicSetSpeed'
  | 'topicSetSpeedStep'
  | 'speedMin'
  | 'speedMax'
  | 'topicTargetTemp'
  | 'payloadTargetTempJsonPath'
  | 'topicSetTargetTemp'
  | 'payloadPress'
  | 'payloadDouble'
  | 'payloadLong'
  | 'payloadLocked'
  | 'payloadUnlocked'
  | 'payloadAlarmNormal'
  | 'payloadAlarmWarning'
  | 'payloadAlarmCritical'
  | 'topicCo'
  | 'payloadCoJsonPath';

/** Keys common to all device types (availability + battery + power source). */
export const COMMON_KEYS: readonly EditableDeviceKey[] = [
  'topicAvailability',
  'payloadpayloadAvailabilityJsonPath',
  'payloadOnline',
  'payloadOffline',
  'powerSource',
  'topicBattery',
  'payloadpayloadBatteryJsonPath',
  'batteryValueBased',
  'batteryMin',
  'batteryMax',
  'payloadBatteryFull',
  'payloadBatteryEmpty',
];

/** All possible editable keys (union across all device types), used for safe deserialization. */
export const ALL_EDITABLE_KEYS: readonly EditableDeviceKey[] = [
  'topicOnOff',
  'payloadOnOffJsonPath',
  'topicSetOnOff',
  'payloadOn',
  'payloadOff',
  'retain',
  'topicAvailability',
  'payloadpayloadAvailabilityJsonPath',
  'payloadOnline',
  'payloadOffline',
  'powerSource',
  'topicBattery',
  'payloadpayloadBatteryJsonPath',
  'batteryValueBased',
  'batteryMin',
  'batteryMax',
  'payloadBatteryFull',
  'payloadBatteryEmpty',
  'topicCurrentLevel',
  'payloadCurrentLevelJsonPath',
  'topicMoveToLevel',
  'topicMoveToLevelWithOnOff',
  'brightnessMin',
  'brightnessMax',
  'topicColor',
  'payloadColorJsonPath',
  'topicSetColor',
  'payloadOpen',
  'payloadClosed',
  'payloadStop',
  'topicPosition',
  'payloadPositionJsonPath',
  'topicSetPosition',
  'positionMin',
  'positionMax',
  'topicSpeed',
  'payloadSpeedJsonPath',
  'topicSetSpeed',
  'topicSetSpeedStep',
  'speedMin',
  'speedMax',
  'topicTargetTemp',
  'payloadTargetTempJsonPath',
  'topicSetTargetTemp',
  'payloadPress',
  'payloadDouble',
  'payloadLong',
  'payloadLocked',
  'payloadUnlocked',
  'payloadAlarmNormal',
  'payloadAlarmWarning',
  'payloadAlarmCritical',
  'topicCo',
  'payloadCoJsonPath',
];

/** Keys whose values are stored as numbers, not strings. */
export const NUMBER_KEYS: readonly EditableDeviceKey[] = ['brightnessMin', 'brightnessMax', 'positionMin', 'positionMax', 'speedMin', 'speedMax', 'batteryMin', 'batteryMax'];

// ── Command handler types ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyHandler = (data: any) => void | Promise<void>;
export interface LevelRequest {
  request: { level: number };
}
export interface HueSatRequest {
  request: { hue: number; saturation: number };
}
export interface ColorTempRequest {
  request: { colorTemperatureMireds: number };
}

// ── DeviceContext — platform helpers exposed to device descriptor files ────

export interface DeviceContext {
  readonly log: AnsiLogger;
  subscribe(topic: string, handler: (payload: string) => void): void;
  publish(topic: string, payload: string, retain?: boolean): void;
  getAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string): unknown;
  setAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string, value: unknown): void;
  onCmd(ep: MatterbridgeEndpoint, cmd: string, fn: AnyHandler): void;
  initEp(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig, productId: number): void;
  applyConfigUrl(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void;
  registerDevice(ep: MatterbridgeEndpoint): Promise<void>;
  subscribeToAvailabilityAndBattery(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void;
  readonly endpointMap: Map<string, MatterbridgeEndpoint>;
  parseOnOff(payload: string, on: string, off: string, jsonPath?: string): boolean | null;
  parseFloatPayload(payload: string, keys: string[], jsonPath?: string): number | null;
  extractPayloadValue(payload: string, jsonPath?: string): unknown;
  toPayloadString(value: unknown): string;
  getBrightnessRange(cfg: MqttDeviceConfig): { min: number; max: number };
  matterLevelToMqttBrightness(level254: number, min: number, max: number): number;
  mqttBrightnessToMatterLevel(rawBrightness: number, min: number, max: number): number;
  getCoverPositionRange(cfg: MqttDeviceConfig): { min: number; max: number };
  coverMatterPctToMqttPosition(matterPct: number, min: number, max: number): number;
  coverMqttPositionToMatterPct(mqttPosition: number, min: number, max: number): number;
}

// ── DeviceDescriptor — per-type static config + factory ───────────────────

export interface DeviceDescriptor {
  readonly type: DeviceKind;
  /** Full list of editable keys shown in the device editor for this type. */
  readonly editableKeys: readonly EditableDeviceKey[];
  /** Returns topic/field defaults to merge into the config for this type. */
  applyDefaults(cfg: MqttDeviceConfig, baseTopic: string): Partial<MqttDeviceConfig>;
  /** Creates the Matter endpoint and wires up all MQTT handlers. */
  create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void>;
}
