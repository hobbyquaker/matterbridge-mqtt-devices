import * as matterbridge from 'matterbridge';
import { MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

// Thermostat device type (spec code 0x0301).
// Some Matterbridge versions don't export it by name, so we search for it.
const mb = matterbridge as unknown as Record<string, unknown>;
const thermostatDeviceType: unknown = mb['thermostat'] ??
  mb['Thermostat'] ??
  Object.values(mb).find(
    (v) =>
      v !== null &&
      typeof v === 'object' &&
      ((v as Record<string, unknown>)['code'] === 0x0301 ||
        (v as Record<string, unknown>)['deviceType'] === 0x0301 ||
        (typeof (v as Record<string, unknown>)['name'] === 'string' && ((v as Record<string, unknown>)['name'] as string).toLowerCase().includes('thermostat'))),
  ) ?? {
    name: 'MA-thermostat',
    code: 0x0301,
    deviceType: 0x0301,
    deviceRevision: 2,
    tag: 'MA-thermostat',
    typeName: 'MA-thermostat',
  };

export const thermostatDescriptor: DeviceDescriptor = {
  type: 'thermostat',
  editableKeys: {
    publish: ['topicSetTargetTemp', 'topicSetSystemMode'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicLocalTemp',
      'payloadLocalTempJsonPath',
      'topicTargetTemp',
      'payloadTargetTempJsonPath',
      'topicSystemMode',
      'payloadSystemModeJsonPath',
      'topicOccupancy',
      'payloadOccupancyJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([thermostatDeviceType as import('matterbridge').DeviceTypeDefinition, powerSource]);
    ctx.initEp(ep, cfg, 0x0301);
    ctx.applyConfigUrl(ep, cfg);

    ep.createDefaultThermostatClusterServer(
      4, // systemMode: Heat
      20, // localTemperature = 20?C
      16, // occupiedCoolingSetpoint = 16?C
      21, // occupiedHeatingSetpoint = 21?C
    );

    void ep.subscribeAttribute(
      'Thermostat',
      'occupiedHeatingSetpoint',
      (newValue: number) => {
        const targetC = newValue / 100;
        if (cfg.topicSetTargetTemp) ctx.publish(cfg.topicSetTargetTemp, String(targetC), cfg.retain);
      },
      ctx.log,
    );

    const SYSTEM_MODE_STR: Record<number, string> = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 5: 'emergency_heat', 7: 'fan_only', 8: 'dry' };
    const SYSTEM_MODE_NUM: Record<string, number> = { off: 0, auto: 1, cool: 3, heat: 4, emergency_heat: 5, fan_only: 7, dry: 8 };

    void ep.subscribeAttribute(
      'Thermostat',
      'systemMode',
      (newValue: number) => {
        const s = SYSTEM_MODE_STR[newValue] ?? String(newValue);
        if (cfg.topicSetSystemMode) ctx.publish(cfg.topicSetSystemMode, s, cfg.retain);
      },
      ctx.log,
    );

    if (cfg.topicSystemMode) {
      ctx.subscribe(cfg.topicSystemMode, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadSystemModeJsonPath)).toLowerCase();
        const mode = SYSTEM_MODE_NUM[raw] ?? parseInt(raw, 10);
        if (Number.isFinite(mode)) ctx.setAttr(ep, CID.Thermostat, 'systemMode', mode);
      });
    }

    if (cfg.topicLocalTemp) {
      ctx.subscribe(cfg.topicLocalTemp, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'local_temperature'], cfg.payloadLocalTempJsonPath);
        if (c !== null) {
          ctx.setAttr(ep, CID.Thermostat, 'localTemperature', Math.round(c * 100));
        }
      });
    }

    if (cfg.topicTargetTemp) {
      ctx.subscribe(cfg.topicTargetTemp, (p) => {
        const c = ctx.parseFloatPayload(p, ['target_temperature', 'occupied_heating_setpoint'], cfg.payloadTargetTempJsonPath);
        if (c !== null) {
          ctx.setAttr(ep, CID.Thermostat, 'occupiedHeatingSetpoint', Math.round(c * 100));
        }
      });
    }

    if (cfg.topicOccupancy) {
      ctx.subscribe(cfg.topicOccupancy, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOccupancyJsonPath)).toLowerCase();
        const occupied = raw === 'occupied' || raw === 'true' || raw === '1' || raw === 'on';
        ctx.setAttr(ep, CID.Thermostat, 'occupancy', occupied ? 1 : 0);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? thermostat "${cfg.name}" pr?t`);
  },
};
