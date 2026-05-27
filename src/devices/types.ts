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
  | 'window-covering'
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
  | 'soil-sensor'
  | 'pressure-sensor'
  | 'flow-sensor'
  | 'water-freeze-detector'
  | 'water-valve'
  | 'extended-color-light'
  | 'air-quality-sensor'
  | 'composed'
  | 'on-off-mounted-switch'
  | 'dimmable-switch'
  | 'dimmable-mounted-switch'
  | 'color-temperature-switch'
  | 'air-conditioner'
  | 'air-purifier'
  | 'electrical-sensor'
  | 'closure'
  | 'irrigation-system'
  | 'pump'
  | 'robotic-vacuum-cleaner'
  | 'battery-storage'
  | 'device-energy-management'
  | 'evse'
  | 'heat-pump'
  | 'solar-power'
  | 'water-heater'
  | 'cooktop'
  | 'dishwasher'
  | 'extractor-hood'
  | 'laundry-washer'
  | 'laundry-dryer'
  | 'microwave-oven'
  | 'oven'
  | 'refrigerator'
  | 'basic-video-player'
  | 'casting-video-player'
  | 'speaker';

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
  PressureMeasurement: 0x0403,
  FlowMeasurement: 0x0404,
  ValveConfigurationAndControl: 0x0081,
  AirQuality: 0x005b,
  TvocMeasurement: 0x042e,
  CarbonDioxideConcentrationMeasurement: 0x040d,
  Pm25ConcentrationMeasurement: 0x042a,
  ElectricalPowerMeasurement: 0x0090,
  ElectricalEnergyMeasurement: 0x0091,
  PumpConfigurationAndControl: 0x0200,
  DeviceEnergyManagement: 0x0098,
  OperationalState: 0x0060,
  SoilMeasurement: 0x0430,
  MediaPlayback: 0x0506,
  ClosureControl: 0x0104,
  ClosureDimension: 0x0105,
  OvenCavityOperationalState: 0x0048,
  OvenMode: 0x0049,
  LaundryDryerControls: 0x004a,
  LaundryWasherMode: 0x0051,
  LaundryWasherControls: 0x0053,
  TemperatureControl: 0x0056,
  DishwasherMode: 0x0059,
  DishwasherAlarm: 0x005d,
  MicrowaveOvenMode: 0x005e,
  MicrowaveOvenControl: 0x005f,
} as const;

// ── Device config ──────────────────────────────────────────────────────────

export interface MqttDeviceConfig {
  id?: string;
  name: string;
  type?: DeviceKind;
  configUrl?: string;
  enabled?: boolean;
  /** Computed sequential serial — not persisted to config. */
  serial?: string;

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

  // window-covering (lift)
  payloadOpen?: string;
  payloadClosed?: string;
  topicPosition?: string;
  payloadPositionJsonPath?: string;
  topicSetPosition?: string;
  positionMin?: number;
  positionMax?: number;
  payloadStop?: string;

  // window-covering (tilt)
  topicTiltState?: string;
  payloadTiltStateJsonPath?: string;
  topicSetTiltState?: string;
  topicTilt?: string;
  payloadTiltJsonPath?: string;
  topicSetTilt?: string;
  tiltMin?: number;
  tiltMax?: number;

  // window-covering (safety)
  topicSafetyStatus?: string;
  payloadSafetyStatusJsonPath?: string;
  topicSetSafetyStatus?: string;

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
  // thermostat/AC/heat-pump — system mode (off/auto/cool/heat/emergency_heat/fan_only/dry)
  topicSystemMode?: string;
  payloadSystemModeJsonPath?: string;
  topicSetSystemMode?: string;
  // thermostat/heat-pump — running state (numeric bitmap; 0 = idle)
  topicRunningState?: string;
  payloadRunningStateJsonPath?: string;
  // thermostat — occupancy (bit 0 = occupied)
  topicOccupancy?: string;
  payloadOccupancyJsonPath?: string;
  // fan control — fan mode (off/low/medium/high/on/auto/smart)
  topicFanMode?: string;
  payloadFanModeJsonPath?: string;
  topicSetFanMode?: string;

  // contact_sensor
  topicContactState?: string;
  payloadContactStateJsonPath?: string;

  // cover
  topicCoverState?: string;
  payloadCoverStateJsonPath?: string;
  topicSetCoverState?: string;
  // cover — per-state subscribe topics (payload-agnostic; any message sets that state)
  topicCoverStateOpen?: string;
  topicCoverStateClose?: string;
  topicCoverStateStop?: string;
  // cover — per-state publish topics (publishes the configured payload for that state)
  topicSetCoverStateOpen?: string;
  topicSetCoverStateClose?: string;
  topicSetCoverStateStop?: string;

  // closure
  topicClosureState?: string;
  payloadClosureStateJsonPath?: string;
  topicSetClosureState?: string;
  // closure — per-state subscribe topics (payload-agnostic; any message sets that state)
  topicClosureStateOpen?: string;
  topicClosureStateClose?: string;
  topicClosureStateStop?: string;
  // closure — per-state publish topics (a '1' is published when that state is entered)
  topicSetClosureStateOpen?: string;
  topicSetClosureStateClose?: string;
  topicSetClosureStateStop?: string;
  topicLatch?: string;
  payloadLatchJsonPath?: string;
  topicSetLatch?: string;
  topicMainState?: string;
  payloadMainStateJsonPath?: string;

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
  // door lock — physical door state
  topicDoorState?: string;
  payloadDoorStateJsonPath?: string;
  payloadDoorOpen?: string;
  payloadDoorClosed?: string;

  // smoke_alarm
  topicSmokeAlarm?: string;
  payloadSmokeAlarmJsonPath?: string;
  payloadAlarmNormal?: string;
  payloadAlarmWarning?: string;
  payloadAlarmCritical?: string;
  topicCo?: string;
  payloadCoJsonPath?: string;
  topicBatteryAlert?: string;
  payloadBatteryAlertJsonPath?: string;
  topicHardwareFault?: string;
  payloadHardwareFaultJsonPath?: string;
  topicTestInProgress?: string;
  payloadTestInProgressJsonPath?: string;

  // pressure sensor
  topicPressure?: string;
  payloadPressureJsonPath?: string;

  // flow sensor
  topicFlow?: string;
  payloadFlowJsonPath?: string;

  // valve open level
  topicOpenLevel?: string;
  payloadOpenLevelJsonPath?: string;

  // air quality sensor
  topicAirQuality?: string;
  payloadAirQualityJsonPath?: string;
  topicTvoc?: string;
  payloadTvocJsonPath?: string;
  topicCo2?: string;
  payloadCo2JsonPath?: string;
  topicPm25?: string;
  payloadPm25JsonPath?: string;

  // composed sensor — active component ids
  components?: string[];

  // electrical measurement
  topicPower?: string;
  payloadPowerJsonPath?: string;
  topicVoltage?: string;
  payloadVoltageJsonPath?: string;
  topicCurrent?: string;
  payloadCurrentJsonPath?: string;
  topicEnergy?: string;
  payloadEnergyJsonPath?: string;
  topicFrequency?: string;
  payloadFrequencyJsonPath?: string;

  // evse
  topicEvseState?: string;
  payloadEvseStateJsonPath?: string;

  // operational state (appliances, robotic-vacuum-cleaner)
  topicOperationalState?: string;
  payloadOperationalStateJsonPath?: string;
  payloadRunning?: string;
  payloadStopped?: string;
  payloadPaused?: string;
  topicCountdownTime?: string;
  payloadCountdownTimeJsonPath?: string;
  topicCurrentPhase?: string;
  payloadCurrentPhaseJsonPath?: string;
  topicOperationalError?: string;
  payloadOperationalErrorJsonPath?: string;
  topicSetOperationalState?: string;

  // laundry washer mode
  topicWasherMode?: string;
  payloadWasherModeJsonPath?: string;
  topicSetWasherMode?: string;

  // laundry washer controls
  topicSpinSpeed?: string;
  payloadSpinSpeedJsonPath?: string;
  topicNumberOfRinses?: string;
  payloadNumberOfRinsesJsonPath?: string;

  // temperature control
  topicTemperatureLevel?: string;
  payloadTemperatureLevelJsonPath?: string;
  topicSetTemperatureLevel?: string;

  // oven mode
  topicOvenMode?: string;
  payloadOvenModeJsonPath?: string;
  topicSetOvenMode?: string;

  // microwave oven
  topicMicrowaveMode?: string;
  payloadMicrowaveModeJsonPath?: string;
  topicCookTime?: string;
  payloadCookTimeJsonPath?: string;
  topicSelectedWattIndex?: string;
  payloadSelectedWattIndexJsonPath?: string;

  // laundry dryer controls
  topicDrynessLevel?: string;
  payloadDrynessLevelJsonPath?: string;

  // dishwasher
  topicDishwasherMode?: string;
  payloadDishwasherModeJsonPath?: string;
  topicSetDishwasherMode?: string;
  topicDishwasherAlarm?: string;
  payloadDishwasherAlarmJsonPath?: string;

  // air conditioner / heat pump cooling setpoint
  topicCoolingSetpoint?: string;
  payloadCoolingSetpointJsonPath?: string;
  topicSetCoolingSetpoint?: string;

  // media playback (video players)
  topicPlaybackState?: string;
  payloadPlaybackJsonPath?: string;
  topicSetPlaybackState?: string;
  topicSetPlaybackCmd?: string;
  topicSetMediaSeek?: string;

  // speaker volume
  topicVolume?: string;
  payloadVolumeJsonPath?: string;
  topicSetVolume?: string;
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
  | 'topicTiltState'
  | 'payloadTiltStateJsonPath'
  | 'topicSetTiltState'
  | 'topicTilt'
  | 'payloadTiltJsonPath'
  | 'topicSetTilt'
  | 'tiltMin'
  | 'tiltMax'
  | 'topicSafetyStatus'
  | 'payloadSafetyStatusJsonPath'
  | 'topicSetSafetyStatus'
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
  | 'topicSystemMode'
  | 'payloadSystemModeJsonPath'
  | 'topicSetSystemMode'
  | 'topicRunningState'
  | 'payloadRunningStateJsonPath'
  | 'topicOccupancy'
  | 'payloadOccupancyJsonPath'
  | 'topicFanMode'
  | 'payloadFanModeJsonPath'
  | 'topicSetFanMode'
  | 'topicContactState'
  | 'payloadContactStateJsonPath'
  | 'topicCoverState'
  | 'payloadCoverStateJsonPath'
  | 'topicSetCoverState'
  | 'topicCoverStateOpen'
  | 'topicCoverStateClose'
  | 'topicCoverStateStop'
  | 'topicSetCoverStateOpen'
  | 'topicSetCoverStateClose'
  | 'topicSetCoverStateStop'
  | 'topicClosureState'
  | 'payloadClosureStateJsonPath'
  | 'topicSetClosureState'
  | 'topicClosureStateOpen'
  | 'topicClosureStateClose'
  | 'topicClosureStateStop'
  | 'topicSetClosureStateOpen'
  | 'topicSetClosureStateClose'
  | 'topicSetClosureStateStop'
  | 'topicLatch'
  | 'payloadLatchJsonPath'
  | 'topicSetLatch'
  | 'topicMainState'
  | 'payloadMainStateJsonPath'
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
  | 'topicDoorState'
  | 'payloadDoorStateJsonPath'
  | 'payloadDoorOpen'
  | 'payloadDoorClosed'
  | 'topicSmokeAlarm'
  | 'payloadSmokeAlarmJsonPath'
  | 'payloadAlarmNormal'
  | 'payloadAlarmWarning'
  | 'payloadAlarmCritical'
  | 'topicCo'
  | 'payloadCoJsonPath'
  | 'topicBatteryAlert'
  | 'payloadBatteryAlertJsonPath'
  | 'topicHardwareFault'
  | 'payloadHardwareFaultJsonPath'
  | 'topicTestInProgress'
  | 'payloadTestInProgressJsonPath'
  | 'topicPressure'
  | 'payloadPressureJsonPath'
  | 'topicFlow'
  | 'payloadFlowJsonPath'
  | 'topicOpenLevel'
  | 'payloadOpenLevelJsonPath'
  | 'topicAirQuality'
  | 'payloadAirQualityJsonPath'
  | 'topicTvoc'
  | 'payloadTvocJsonPath'
  | 'topicCo2'
  | 'payloadCo2JsonPath'
  | 'topicPm25'
  | 'payloadPm25JsonPath'
  | 'components'
  | 'topicPower'
  | 'payloadPowerJsonPath'
  | 'topicVoltage'
  | 'payloadVoltageJsonPath'
  | 'topicCurrent'
  | 'payloadCurrentJsonPath'
  | 'topicEnergy'
  | 'payloadEnergyJsonPath'
  | 'topicFrequency'
  | 'payloadFrequencyJsonPath'
  | 'topicEvseState'
  | 'payloadEvseStateJsonPath'
  | 'topicOperationalState'
  | 'payloadOperationalStateJsonPath'
  | 'payloadRunning'
  | 'payloadStopped'
  | 'payloadPaused'
  | 'topicCountdownTime'
  | 'payloadCountdownTimeJsonPath'
  | 'topicCurrentPhase'
  | 'payloadCurrentPhaseJsonPath'
  | 'topicOperationalError'
  | 'payloadOperationalErrorJsonPath'
  | 'topicSetOperationalState'
  | 'topicWasherMode'
  | 'payloadWasherModeJsonPath'
  | 'topicSetWasherMode'
  | 'topicSpinSpeed'
  | 'payloadSpinSpeedJsonPath'
  | 'topicNumberOfRinses'
  | 'payloadNumberOfRinsesJsonPath'
  | 'topicTemperatureLevel'
  | 'payloadTemperatureLevelJsonPath'
  | 'topicSetTemperatureLevel'
  | 'topicCoolingSetpoint'
  | 'payloadCoolingSetpointJsonPath'
  | 'topicSetCoolingSetpoint'
  | 'topicPlaybackState'
  | 'payloadPlaybackJsonPath'
  | 'topicSetPlaybackState'
  | 'topicSetPlaybackCmd'
  | 'topicSetMediaSeek'
  | 'topicVolume'
  | 'payloadVolumeJsonPath'
  | 'topicSetVolume'
  | 'topicOvenMode'
  | 'payloadOvenModeJsonPath'
  | 'topicSetOvenMode'
  | 'topicMicrowaveMode'
  | 'payloadMicrowaveModeJsonPath'
  | 'topicCookTime'
  | 'payloadCookTimeJsonPath'
  | 'topicSelectedWattIndex'
  | 'payloadSelectedWattIndexJsonPath'
  | 'topicDrynessLevel'
  | 'payloadDrynessLevelJsonPath'
  | 'topicDishwasherMode'
  | 'payloadDishwasherModeJsonPath'
  | 'topicSetDishwasherMode'
  | 'topicDishwasherAlarm'
  | 'payloadDishwasherAlarmJsonPath';

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
  'topicTiltState',
  'payloadTiltStateJsonPath',
  'topicSetTiltState',
  'topicTilt',
  'payloadTiltJsonPath',
  'topicSetTilt',
  'tiltMin',
  'tiltMax',
  'topicSafetyStatus',
  'payloadSafetyStatusJsonPath',
  'topicSetSafetyStatus',
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
  'topicSystemMode',
  'payloadSystemModeJsonPath',
  'topicSetSystemMode',
  'topicRunningState',
  'payloadRunningStateJsonPath',
  'topicOccupancy',
  'payloadOccupancyJsonPath',
  'topicFanMode',
  'payloadFanModeJsonPath',
  'topicSetFanMode',
  'topicContactState',
  'payloadContactStateJsonPath',
  'topicCoverState',
  'payloadCoverStateJsonPath',
  'topicSetCoverState',
  'topicCoverStateOpen',
  'topicCoverStateClose',
  'topicCoverStateStop',
  'topicSetCoverStateOpen',
  'topicSetCoverStateClose',
  'topicSetCoverStateStop',
  'topicClosureState',
  'payloadClosureStateJsonPath',
  'topicSetClosureState',
  'topicClosureStateOpen',
  'topicClosureStateClose',
  'topicClosureStateStop',
  'topicSetClosureStateOpen',
  'topicSetClosureStateClose',
  'topicSetClosureStateStop',
  'topicLatch',
  'payloadLatchJsonPath',
  'topicSetLatch',
  'topicMainState',
  'payloadMainStateJsonPath',
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
  'topicDoorState',
  'payloadDoorStateJsonPath',
  'payloadDoorOpen',
  'payloadDoorClosed',
  'topicSmokeAlarm',
  'payloadSmokeAlarmJsonPath',
  'payloadAlarmNormal',
  'payloadAlarmWarning',
  'payloadAlarmCritical',
  'topicCo',
  'payloadCoJsonPath',
  'topicBatteryAlert',
  'payloadBatteryAlertJsonPath',
  'topicHardwareFault',
  'payloadHardwareFaultJsonPath',
  'topicTestInProgress',
  'payloadTestInProgressJsonPath',
  'topicPressure',
  'payloadPressureJsonPath',
  'topicFlow',
  'payloadFlowJsonPath',
  'topicOpenLevel',
  'payloadOpenLevelJsonPath',
  'topicAirQuality',
  'payloadAirQualityJsonPath',
  'topicTvoc',
  'payloadTvocJsonPath',
  'topicCo2',
  'payloadCo2JsonPath',
  'topicPm25',
  'payloadPm25JsonPath',
  'components',
  'topicPower',
  'payloadPowerJsonPath',
  'topicVoltage',
  'payloadVoltageJsonPath',
  'topicCurrent',
  'payloadCurrentJsonPath',
  'topicEnergy',
  'payloadEnergyJsonPath',
  'topicFrequency',
  'payloadFrequencyJsonPath',
  'topicEvseState',
  'payloadEvseStateJsonPath',
  'topicOperationalState',
  'payloadOperationalStateJsonPath',
  'payloadRunning',
  'payloadStopped',
  'payloadPaused',
  'topicCountdownTime',
  'payloadCountdownTimeJsonPath',
  'topicCurrentPhase',
  'payloadCurrentPhaseJsonPath',
  'topicOperationalError',
  'payloadOperationalErrorJsonPath',
  'topicSetOperationalState',
  'topicWasherMode',
  'payloadWasherModeJsonPath',
  'topicSetWasherMode',
  'topicSpinSpeed',
  'payloadSpinSpeedJsonPath',
  'topicNumberOfRinses',
  'payloadNumberOfRinsesJsonPath',
  'topicTemperatureLevel',
  'payloadTemperatureLevelJsonPath',
  'topicSetTemperatureLevel',
  'topicCoolingSetpoint',
  'payloadCoolingSetpointJsonPath',
  'topicSetCoolingSetpoint',
  'topicPlaybackState',
  'payloadPlaybackJsonPath',
  'topicSetPlaybackState',
  'topicSetPlaybackCmd',
  'topicSetMediaSeek',
  'topicVolume',
  'payloadVolumeJsonPath',
  'topicSetVolume',
  'topicOvenMode',
  'payloadOvenModeJsonPath',
  'topicSetOvenMode',
  'topicMicrowaveMode',
  'payloadMicrowaveModeJsonPath',
  'topicCookTime',
  'payloadCookTimeJsonPath',
  'topicSelectedWattIndex',
  'payloadSelectedWattIndexJsonPath',
  'topicDrynessLevel',
  'payloadDrynessLevelJsonPath',
  'topicDishwasherMode',
  'payloadDishwasherModeJsonPath',
  'topicSetDishwasherMode',
  'topicDishwasherAlarm',
  'payloadDishwasherAlarmJsonPath',
];

/** Keys whose values are stored as numbers, not strings. */
export const NUMBER_KEYS: readonly EditableDeviceKey[] = [
  'brightnessMin',
  'brightnessMax',
  'positionMin',
  'positionMax',
  'tiltMin',
  'tiltMax',
  'speedMin',
  'speedMax',
  'batteryMin',
  'batteryMax',
];

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
export interface XyRequest {
  request: { colorX: number; colorY: number };
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

// ── ComposedComponentDef — metadata for composed sensor sub-components ────

/**
 * Describes one selectable sub-component of a 'composed' sensor device.
 * The platform editor uses these definitions to render checkboxes and
 * show/hide the relevant MQTT fields when each component is toggled.
 */
export interface ComposedComponentDef {
  /** Stable identifier stored in `cfg.components[]`. */
  readonly id: string;
  /** Human-readable label shown next to the checkbox in the device editor. */
  readonly label: string;
  /** Subscribe/JSON-path keys that should be visible when this component is active. */
  readonly subscribeKeys: readonly EditableDeviceKey[];
  /** Settings keys that should be visible when this component is active. */
  readonly settingsKeys: readonly EditableDeviceKey[];
}

// ── DeviceDescriptor — per-type static config + factory ───────────────────

export interface DeviceDescriptor {
  readonly type: DeviceKind;
  /** Editable keys grouped by role shown in the device editor for this type. */
  readonly editableKeys: EditableKeyGroups;
  /**
   * For 'composed' device types: definitions of the selectable sub-components.
   * The device editor renders one checkbox per entry and hides irrelevant fields.
   */
  readonly componentDefs?: readonly ComposedComponentDef[];
  /** Returns topic/field defaults to merge into the config for this type. */
  applyDefaults(cfg: MqttDeviceConfig, baseTopic: string): Partial<MqttDeviceConfig>;
  /** Creates the Matter endpoint and wires up all MQTT handlers. */
  create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void>;
}
