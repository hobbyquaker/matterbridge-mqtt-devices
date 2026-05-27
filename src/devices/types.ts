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

  // measurement sensors
  topicTemperature?: string;
  payloadTemperatureJsonPath?: string;
  topicHumidity?: string;
  payloadHumidityJsonPath?: string;
  topicIlluminance?: string;
  payloadIlluminanceJsonPath?: string;
  topicMoisture?: string;
  payloadMoistureJsonPath?: string;

  // availability / online state
  topicAvailability?: string;
  payloadAvailabilityJsonPath?: string;
  payloadOnline?: string;
  payloadOffline?: string;

  // power source
  powerSource?: 'battery' | 'mains';

  // battery (value-based or boolean)
  topicBattery?: string;
  payloadBatteryJsonPath?: string;
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
  topicLocalTemp?: string;
  payloadLocalTempJsonPath?: string;
  topicTargetTemp?: string;
  payloadTargetTempJsonPath?: string;
  topicSetTargetTemp?: string;

  // contact_sensor
  topicContactState?: string;
  payloadContactStateJsonPath?: string;

  // cover
  topicCoverState?: string;
  payloadCoverStateJsonPath?: string;
  topicSetCoverState?: string;

  // generic_switch
  topicAction?: string;
  payloadActionJsonPath?: string;
  topicActionPress?: string;
  topicActionDouble?: string;
  topicActionLong?: string;
  payloadPress?: string;
  payloadDouble?: string;
  payloadLong?: string;

  // door_lock
  topicLockState?: string;
  payloadLockStateJsonPath?: string;
  topicSetLockState?: string;
  payloadLocked?: string;
  payloadUnlocked?: string;
  payloadNotFullyLocked?: string;

  // smoke_alarm
  topicSmokeAlarm?: string;
  payloadSmokeAlarmJsonPath?: string;
  payloadAlarmNormal?: string;
  payloadAlarmWarning?: string;
  payloadAlarmCritical?: string;
  topicCo?: string;
  payloadCoJsonPath?: string;
}

// ── Editable keys for the web editor ──────────────────────────────────────

export type EditableDeviceKey =
  | 'topicTemperature'
  | 'payloadTemperatureJsonPath'
  | 'topicHumidity'
  | 'payloadHumidityJsonPath'
  | 'topicIlluminance'
  | 'payloadIlluminanceJsonPath'
  | 'topicMoisture'
  | 'payloadMoistureJsonPath'
  | 'topicOnOff'
  | 'payloadOnOffJsonPath'
  | 'topicSetOnOff'
  | 'payloadOn'
  | 'payloadOff'
  | 'retain'
  | 'topicAvailability'
  | 'payloadAvailabilityJsonPath'
  | 'payloadOnline'
  | 'payloadOffline'
  | 'powerSource'
  | 'topicBattery'
  | 'payloadBatteryJsonPath'
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
  | 'topicLocalTemp'
  | 'payloadLocalTempJsonPath'
  | 'topicContactState'
  | 'payloadContactStateJsonPath'
  | 'topicCoverState'
  | 'payloadCoverStateJsonPath'
  | 'topicSetCoverState'
  | 'topicAction'
  | 'payloadActionJsonPath'
  | 'topicActionPress'
  | 'topicActionDouble'
  | 'topicActionLong'
  | 'topicLockState'
  | 'payloadLockStateJsonPath'
  | 'topicSetLockState'
  | 'payloadLocked'
  | 'payloadUnlocked'
  | 'payloadNotFullyLocked'
  | 'topicSmokeAlarm'
  | 'payloadSmokeAlarmJsonPath'
  | 'payloadAlarmNormal'
  | 'payloadAlarmWarning'
  | 'payloadAlarmCritical'
  | 'topicCo'
  | 'payloadCoJsonPath';

/** Editable keys grouped by role: publish topics, subscribe topics, and other settings. */
export interface EditableKeyGroups {
  /** Topics the plugin publishes to (command topics). */
  readonly publish: readonly EditableDeviceKey[];
  /** Topics the plugin subscribes to, plus their JSON-path options. */
  readonly subscribe: readonly EditableDeviceKey[];
  /** Payload values, ranges, and other non-topic settings. */
  readonly settings: readonly EditableDeviceKey[];
}

/** Subscribe-side keys common to all device types (availability + battery). */
export const COMMON_SUBSCRIBE_KEYS: readonly EditableDeviceKey[] = ['topicAvailability', 'payloadAvailabilityJsonPath', 'topicBattery', 'payloadBatteryJsonPath'];

/** Non-topic settings common to all device types (availability payloads + battery config + power source). */
export const COMMON_SETTINGS_KEYS: readonly EditableDeviceKey[] = [
  'payloadOnline',
  'payloadOffline',
  'powerSource',
  'batteryValueBased',
  'batteryMin',
  'batteryMax',
  'payloadBatteryFull',
  'payloadBatteryEmpty',
];

/** All possible editable keys (union across all device types), used for safe deserialization. */
export const ALL_EDITABLE_KEYS: readonly EditableDeviceKey[] = [
  'topicTemperature',
  'payloadTemperatureJsonPath',
  'topicHumidity',
  'payloadHumidityJsonPath',
  'topicIlluminance',
  'payloadIlluminanceJsonPath',
  'topicMoisture',
  'payloadMoistureJsonPath',
  'topicOnOff',
  'payloadOnOffJsonPath',
  'topicSetOnOff',
  'payloadOn',
  'payloadOff',
  'retain',
  'topicAvailability',
  'payloadAvailabilityJsonPath',
  'payloadOnline',
  'payloadOffline',
  'powerSource',
  'topicBattery',
  'payloadBatteryJsonPath',
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
  'topicLocalTemp',
  'payloadLocalTempJsonPath',
  'topicContactState',
  'payloadContactStateJsonPath',
  'topicCoverState',
  'payloadCoverStateJsonPath',
  'topicSetCoverState',
  'topicAction',
  'payloadActionJsonPath',
  'topicActionPress',
  'topicActionDouble',
  'topicActionLong',
  'topicLockState',
  'payloadLockStateJsonPath',
  'topicSetLockState',
  'payloadLocked',
  'payloadUnlocked',
  'payloadNotFullyLocked',
  'topicSmokeAlarm',
  'payloadSmokeAlarmJsonPath',
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
  /** Editable keys grouped by role shown in the device editor for this type. */
  readonly editableKeys: EditableKeyGroups;
  /** Returns topic/field defaults to merge into the config for this type. */
  applyDefaults(cfg: MqttDeviceConfig, baseTopic: string): Partial<MqttDeviceConfig>;
  /** Creates the Matter endpoint and wires up all MQTT handlers. */
  create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void>;
}
