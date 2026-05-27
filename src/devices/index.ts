/**
 * Device descriptor registry.
 * Import this in platform.ts to look up descriptors by device type.
 */

import { airConditionerDescriptor } from './air-conditioner.js';
import { airPurifierDescriptor } from './air-purifier.js';
import { airQualitySensorDescriptor } from './air-quality-sensor.js';
import { basicVideoPlayerDescriptor } from './basic-video-player.js';
import { batteryStorageDescriptor } from './battery-storage.js';
import { castingVideoPlayerDescriptor } from './casting-video-player.js';
import { closureDescriptor } from './closure.js';
import { colorTemperatureLightDescriptor } from './color-temperature-light.js';
import { colorTemperatureSwitchDescriptor } from './color-temperature-switch.js';
import { composedDescriptor } from './composed.js';
import { contactSensorDescriptor } from './contact-sensor.js';
import { cooktopDescriptor } from './cooktop.js';
import { deviceEnergyManagementDescriptor } from './device-energy-management.js';
import { dimmableLightDescriptor } from './dimmable-light.js';
import { dimmableMountedSwitchDescriptor } from './dimmable-mounted-switch.js';
import { dimmableOutletDescriptor } from './dimmable-outlet.js';
import { dimmableSwitchDescriptor } from './dimmable-switch.js';
import { dishwasherDescriptor } from './dishwasher.js';
import { doorLockDescriptor } from './door-lock.js';
import { electricalSensorDescriptor } from './electrical-sensor.js';
import { evseDescriptor } from './evse.js';
import { extendedColorLightDescriptor } from './extended-color-light.js';
import { extractorHoodDescriptor } from './extractor-hood.js';
import { fanDescriptor } from './fan.js';
import { flowSensorDescriptor } from './flow-sensor.js';
import { genericSwitchDescriptor } from './generic-switch.js';
import { heatPumpDescriptor } from './heat-pump.js';
import { humiditySensorDescriptor } from './humidity-sensor.js';
import { irrigationSystemDescriptor } from './irrigation-system.js';
import { laundryDryerDescriptor } from './laundry-dryer.js';
import { laundryWasherDescriptor } from './laundry-washer.js';
import { lightSensorDescriptor } from './light-sensor.js';
import { microwaveOvenDescriptor } from './microwave-oven.js';
import { occupancySensorDescriptor } from './occupancy-sensor.js';
import { onOffLightDescriptor } from './on-off-light.js';
import { onOffMountedSwitchDescriptor } from './on-off-mounted-switch.js';
import { onOffOutletDescriptor } from './on-off-outlet.js';
import { onOffSwitchDescriptor } from './on-off-switch.js';
import { ovenDescriptor } from './oven.js';
import { pressureSensorDescriptor } from './pressure-sensor.js';
import { pumpDescriptor } from './pump.js';
import { rainSensorDescriptor } from './rain-sensor.js';
import { refrigeratorDescriptor } from './refrigerator.js';
import { roboticVacuumCleanerDescriptor } from './robotic-vacuum-cleaner.js';
import { smokeCoAlarmDescriptor } from './smoke-co-alarm.js';
import { soilSensorDescriptor } from './soil-sensor.js';
import { solarPowerDescriptor } from './solar-power.js';
import { speakerDescriptor } from './speaker.js';
import { temperatureSensorDescriptor } from './temperature-sensor.js';
import { thermostatDescriptor } from './thermostat.js';
import type { DeviceDescriptor, DeviceKind } from './types.js';
import { waterFreezeDetectorDescriptor } from './water-freeze-detector.js';
import { waterHeaterDescriptor } from './water-heater.js';
import { waterLeakDetectorDescriptor } from './water-leak-detector.js';
import { waterValveDescriptor } from './water-valve.js';
import { windowCoveringDescriptor } from './window-covering.js';

export const DEVICE_REGISTRY: readonly DeviceDescriptor[] = [
  onOffOutletDescriptor,
  onOffSwitchDescriptor,
  onOffMountedSwitchDescriptor,
  dimmableLightDescriptor,
  dimmableSwitchDescriptor,
  dimmableMountedSwitchDescriptor,
  colorTemperatureLightDescriptor,
  colorTemperatureSwitchDescriptor,
  extendedColorLightDescriptor,
  contactSensorDescriptor,
  temperatureSensorDescriptor,
  humiditySensorDescriptor,
  occupancySensorDescriptor,
  pressureSensorDescriptor,
  flowSensorDescriptor,
  windowCoveringDescriptor,
  fanDescriptor,
  thermostatDescriptor,
  onOffLightDescriptor,
  dimmableOutletDescriptor,
  genericSwitchDescriptor,
  doorLockDescriptor,
  lightSensorDescriptor,
  rainSensorDescriptor,
  waterLeakDetectorDescriptor,
  waterFreezeDetectorDescriptor,
  waterValveDescriptor,
  smokeCoAlarmDescriptor,
  soilSensorDescriptor,
  airQualitySensorDescriptor,
  airConditionerDescriptor,
  airPurifierDescriptor,
  electricalSensorDescriptor,
  closureDescriptor,
  irrigationSystemDescriptor,
  pumpDescriptor,
  roboticVacuumCleanerDescriptor,
  batteryStorageDescriptor,
  deviceEnergyManagementDescriptor,
  evseDescriptor,
  heatPumpDescriptor,
  solarPowerDescriptor,
  waterHeaterDescriptor,
  cooktopDescriptor,
  dishwasherDescriptor,
  extractorHoodDescriptor,
  laundryWasherDescriptor,
  laundryDryerDescriptor,
  microwaveOvenDescriptor,
  ovenDescriptor,
  refrigeratorDescriptor,
  basicVideoPlayerDescriptor,
  castingVideoPlayerDescriptor,
  speakerDescriptor,
  composedDescriptor,
];

/**
 * Finds a device descriptor by device type name.
 *
 * @param {string | undefined} type - The device type name to look up.
 * @returns {DeviceDescriptor | undefined} The matching descriptor, or undefined if not found.
 */
export function findDescriptor(type: string | undefined): DeviceDescriptor | undefined {
  const t = (type ?? 'on-off-outlet') as DeviceKind;
  return DEVICE_REGISTRY.find((d) => d.type === t);
}

export { SENSOR_COMPONENT_DEFS } from './composed.js';
export type { AnyHandler, ComposedComponentDef, DeviceContext, DeviceKind, EditableDeviceKey, EditableKeyGroups, MqttDeviceConfig } from './types.js';
export { ALL_EDITABLE_KEYS, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS, NUMBER_KEYS } from './types.js';
