/**
 * Device descriptor registry.
 * Import this in platform.ts to look up descriptors by device type.
 */

import { colorlightDescriptor } from './colorlight.js';
import { contactDescriptor } from './contact.js';
import { coverDescriptor } from './cover.js';
import { dimmableOutletDescriptor } from './dimmable-outlet.js';
import { doorLockDescriptor } from './door-lock.js';
import { fanDescriptor } from './fan.js';
import { genericSwitchDescriptor } from './generic-switch.js';
import { humidityDescriptor } from './humidity.js';
import { lightDescriptor } from './light.js';
import { lightSensorDescriptor } from './light-sensor.js';
import { occupancyDescriptor } from './occupancy.js';
import { onoffLightDescriptor } from './onoff-light.js';
import { outletDescriptor } from './outlet.js';
import { rainSensorDescriptor } from './rain-sensor.js';
import { smokeAlarmDescriptor } from './smoke-alarm.js';
import { soilSensorDescriptor } from './soil-sensor.js';
import { switchDescriptor } from './switch.js';
import { temperatureDescriptor } from './temperature.js';
import { thermostatDescriptor } from './thermostat.js';
import type { DeviceDescriptor, DeviceKind } from './types.js';
import { waterLeakDescriptor } from './water-leak.js';

export const DEVICE_REGISTRY: readonly DeviceDescriptor[] = [
  outletDescriptor,
  switchDescriptor,
  lightDescriptor,
  colorlightDescriptor,
  contactDescriptor,
  temperatureDescriptor,
  humidityDescriptor,
  occupancyDescriptor,
  coverDescriptor,
  fanDescriptor,
  thermostatDescriptor,
  onoffLightDescriptor,
  dimmableOutletDescriptor,
  genericSwitchDescriptor,
  doorLockDescriptor,
  lightSensorDescriptor,
  rainSensorDescriptor,
  waterLeakDescriptor,
  smokeAlarmDescriptor,
  soilSensorDescriptor,
];

/**
 * Finds a device descriptor by device type name.
 *
 * @param {string | undefined} type - The device type name to look up.
 * @returns {DeviceDescriptor | undefined} The matching descriptor, or undefined if not found.
 */
export function findDescriptor(type: string | undefined): DeviceDescriptor | undefined {
  const t = (type ?? 'outlet') as DeviceKind;
  return DEVICE_REGISTRY.find((d) => d.type === t);
}

// Re-export types so platform.ts has a single import source.
export type { AnyHandler, DeviceContext, DeviceKind, EditableDeviceKey, MqttDeviceConfig } from './types.js';
export { ALL_EDITABLE_KEYS, COMMON_KEYS, NUMBER_KEYS } from './types.js';
