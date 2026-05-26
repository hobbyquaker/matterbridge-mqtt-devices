import * as matterbridge from 'matterbridge';
import { MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

// Thermostat device type (spec code 0x0301).
// Some Matterbridge versions don't export it by name, so we search for it.
const thermostatDeviceType: any = (matterbridge as any).thermostat ??
  (matterbridge as any).Thermostat ??
  Object.values(matterbridge as any).find(
    (v: any) =>
      v !== null && typeof v === 'object' && (v.code === 0x0301 || v.deviceType === 0x0301 || (typeof v.name === 'string' && v.name.toLowerCase().includes('thermostat'))),
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
  editableKeys: [...COMMON_KEYS, 'stateTopic', 'stateJsonPath', 'targetTempStateTopic', 'targetTempStateJsonPath', 'targetTempCommandTopic', 'retain'],
  applyDefaults(cfg, baseTopic) {
    return {
      commandTopic: cfg.commandTopic ?? `${baseTopic}/set`,
      targetTempStateTopic: cfg.targetTempStateTopic ?? `${baseTopic}/target`,
      targetTempCommandTopic: cfg.targetTempCommandTopic ?? `${baseTopic}/target/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    ctx.log.info(`[${cfg.name}] thermostatDeviceType = ${JSON.stringify(thermostatDeviceType)}`);

    const ep = new MatterbridgeEndpoint([thermostatDeviceType, powerSource]);
    ctx.initEp(ep, cfg, 0x0301);
    ctx.applyConfigUrl(ep, cfg);

    ep.createDefaultThermostatClusterServer(
      4, // systemMode: Heat
      20, // localTemperature = 20°C
      16, // occupiedCoolingSetpoint = 16°C
      21, // occupiedHeatingSetpoint = 21°C
    );

    ep.subscribeAttribute(
      CID.Thermostat as any,
      'occupiedHeatingSetpoint',
      (newValue: number) => {
        const targetC = newValue / 100;
        ctx.log.info(`[${cfg.name}] → Nouvelle consigne : ${targetC}°C`);
        if (cfg.targetTempCommandTopic) ctx.publish(cfg.targetTempCommandTopic, String(targetC), cfg.retain);
      },
      ctx.log,
    );

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'local_temperature'], cfg.stateJsonPath);
        if (c !== null) {
          ctx.log.info(`[${cfg.name}] ← localTemperature ${c}°C`);
          ctx.setAttr(ep, CID.Thermostat, 'localTemperature', Math.round(c * 100));
        }
      });
    }

    if (cfg.targetTempStateTopic) {
      ctx.subscribe(cfg.targetTempStateTopic, (p) => {
        const c = ctx.parseFloatPayload(p, ['target_temperature', 'occupied_heating_setpoint'], cfg.targetTempStateJsonPath);
        if (c !== null) {
          ctx.log.info(`[${cfg.name}] ← occupiedHeatingSetpoint ${c}°C`);
          ctx.setAttr(ep, CID.Thermostat, 'occupiedHeatingSetpoint', Math.round(c * 100));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ thermostat "${cfg.name}" prêt`);
  },
};
