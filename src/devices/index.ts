/**
 * Device descriptor registry.
 * Import this in platform.ts to look up descriptors by device type.
 */

import type { DeviceDescriptor, DeviceKind } from './types.js';

import { outletDescriptor }      from './outlet.js';
import { switchDescriptor }      from './switch.js';
import { lightDescriptor }       from './light.js';
import { colorlightDescriptor }  from './colorlight.js';
import { contactDescriptor }     from './contact.js';
import { temperatureDescriptor } from './temperature.js';
import { humidityDescriptor }    from './humidity.js';
import { occupancyDescriptor }   from './occupancy.js';
import { coverDescriptor }       from './cover.js';
import { fanDescriptor }         from './fan.js';
import { thermostatDescriptor }      from './thermostat.js';
import { onoffLightDescriptor }      from './onoff-light.js';
import { dimmableOutletDescriptor }  from './dimmable-outlet.js';
import { genericSwitchDescriptor }   from './generic-switch.js';
import { doorLockDescriptor }        from './door-lock.js';
import { lightSensorDescriptor }     from './light-sensor.js';
import { rainSensorDescriptor }      from './rain-sensor.js';
import { waterLeakDescriptor }       from './water-leak.js';
import { smokeAlarmDescriptor }      from './smoke-alarm.js';
import { soilSensorDescriptor }      from './soil-sensor.js';

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

export function findDescriptor(type: string | undefined): DeviceDescriptor | undefined {
  const t = (type ?? 'outlet') as DeviceKind;
  return DEVICE_REGISTRY.find((d) => d.type === t);
}

// Re-export types so platform.ts has a single import source.
export type { DeviceKind, MqttDeviceConfig, EditableDeviceKey, DeviceContext, AnyHandler } from './types.js';
export { ALL_EDITABLE_KEYS, NUMBER_KEYS, COMMON_KEYS } from './types.js';
