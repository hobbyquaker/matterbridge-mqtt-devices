/**
 * Device descriptor registry.
 * Import this in platform.ts to look up descriptors by device type.
 */

import { colorTemperatureLightDescriptor } from './color-temperature-light.js';
import { contactSensorDescriptor } from './contact-sensor.js';
import { coverDescriptor } from './cover.js';
import { dimmableLightDescriptor } from './dimmable-light.js';
import { dimmableOutletDescriptor } from './dimmable-outlet.js';
import { doorLockDescriptor } from './door-lock.js';
import { fanDescriptor } from './fan.js';
import { genericSwitchDescriptor } from './generic-switch.js';
import { humiditySensorDescriptor } from './humidity-sensor.js';
import { lightSensorDescriptor } from './light-sensor.js';
import { occupancySensorDescriptor } from './occupancy-sensor.js';
import { onOffLightDescriptor } from './on-off-light.js';
import { onOffOutletDescriptor } from './on-off-outlet.js';
import { onOffSwitchDescriptor } from './on-off-switch.js';
import { rainSensorDescriptor } from './rain-sensor.js';
import { smokeCoAlarmDescriptor } from './smoke-co-alarm.js';
import { soilSensorDescriptor } from './soil-sensor.js';
import { temperatureSensorDescriptor } from './temperature-sensor.js';
import { thermostatDescriptor } from './thermostat.js';
import type { DeviceDescriptor, DeviceKind } from './types.js';
import { waterLeakDetectorDescriptor } from './water-leak-detector.js';

export const DEVICE_REGISTRY: readonly DeviceDescriptor[] = [
  onOffOutletDescriptor,
  onOffSwitchDescriptor,
  dimmableLightDescriptor,
  colorTemperatureLightDescriptor,
  contactSensorDescriptor,
  temperatureSensorDescriptor,
  humiditySensorDescriptor,
  occupancySensorDescriptor,
  coverDescriptor,
  fanDescriptor,
  thermostatDescriptor,
  onOffLightDescriptor,
  dimmableOutletDescriptor,
  genericSwitchDescriptor,
  doorLockDescriptor,
  lightSensorDescriptor,
  rainSensorDescriptor,
  waterLeakDetectorDescriptor,
  smokeCoAlarmDescriptor,
  soilSensorDescriptor,
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

export type { AnyHandler, DeviceContext, DeviceKind, EditableDeviceKey, EditableKeyGroups, MqttDeviceConfig } from './types.js';
export { ALL_EDITABLE_KEYS, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS, NUMBER_KEYS } from './types.js';
