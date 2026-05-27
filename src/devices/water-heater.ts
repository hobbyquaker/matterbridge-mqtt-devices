import { MatterbridgeEndpoint, waterHeater } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const waterHeaterDescriptor: DeviceDescriptor = {
  type: 'water-heater',
  editableKeys: {
    publish: ['topicSetTargetTemp'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicLocalTemp', 'payloadLocalTempJsonPath', 'topicTargetTemp', 'payloadTargetTempJsonPath', 'topicPower', 'payloadPowerJsonPath', 'topicVoltage', 'payloadVoltageJsonPath', 'topicCurrent', 'payloadCurrentJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicLocalTemp: cfg.topicLocalTemp ?? `${baseTopic}/temperature`,
      topicTargetTemp: cfg.topicTargetTemp ?? `${baseTopic}/target`,
      topicSetTargetTemp: cfg.topicSetTargetTemp ?? `${baseTopic}/target/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([waterHeater]);
    ctx.initEp(ep, cfg, 0x802b);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultHeatingThermostatClusterServer(5000, 6000);
    ep.createDefaultElectricalPowerMeasurementClusterServer();

    void ep.subscribeAttribute(
      'Thermostat',
      'occupiedHeatingSetpoint',
      (newValue: number) => {
        if (cfg.topicSetTargetTemp) ctx.publish(cfg.topicSetTargetTemp, String(newValue / 100), cfg.retain);
      },
      ctx.log,
    );

    if (cfg.topicLocalTemp) {
      ctx.subscribe(cfg.topicLocalTemp, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'local_temperature'], cfg.payloadLocalTempJsonPath);
        if (c !== null) ctx.setAttr(ep, CID.Thermostat, 'localTemperature', Math.round(c * 100));
      });
    }

    if (cfg.topicTargetTemp) {
      ctx.subscribe(cfg.topicTargetTemp, (p) => {
        const c = ctx.parseFloatPayload(p, ['target_temperature', 'occupied_heating_setpoint'], cfg.payloadTargetTempJsonPath);
        if (c !== null) ctx.setAttr(ep, CID.Thermostat, 'occupiedHeatingSetpoint', Math.round(c * 100));
      });
    }

    if (cfg.topicPower) {
      ctx.subscribe(cfg.topicPower, (p) => {
        const w = ctx.parseFloatPayload(p, ['power', 'heating_power', 'watt'], cfg.payloadPowerJsonPath);
        if (w !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'activePower', Math.round(w * 1000));
      });
    }

    if (cfg.topicVoltage) {
      ctx.subscribe(cfg.topicVoltage, (p) => {
        const v = ctx.parseFloatPayload(p, ['voltage', 'volt'], cfg.payloadVoltageJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'voltage', Math.round(v * 1000));
      });
    }

    if (cfg.topicCurrent) {
      ctx.subscribe(cfg.topicCurrent, (p) => {
        const a = ctx.parseFloatPayload(p, ['current', 'ampere'], cfg.payloadCurrentJsonPath);
        if (a !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'activeCurrent', Math.round(a * 1000));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ water heater "${cfg.name}"`);
  },
};
