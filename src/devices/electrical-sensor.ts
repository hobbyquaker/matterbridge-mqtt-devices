import { electricalSensor, MatterbridgeEndpoint } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const electricalSensorDescriptor: DeviceDescriptor = {
  type: 'electrical-sensor',
  editableKeys: {
    publish: [],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
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
    ],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([electricalSensor]);
    ctx.initEp(ep, cfg, 0x8021);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultElectricalPowerMeasurementClusterServer();
    ep.createDefaultElectricalEnergyMeasurementClusterServer();

    if (cfg.topicPower) {
      ctx.subscribe(cfg.topicPower, (p) => {
        const w = ctx.parseFloatPayload(p, ['power', 'active_power', 'watt'], cfg.payloadPowerJsonPath);
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

    if (cfg.topicEnergy) {
      ctx.subscribe(cfg.topicEnergy, (p) => {
        const wh = ctx.parseFloatPayload(p, ['energy', 'total_energy', 'kwh'], cfg.payloadEnergyJsonPath);
        if (wh !== null) ctx.setAttr(ep, CID.ElectricalEnergyMeasurement, 'cumulativeEnergyImported', { energy: Math.round(wh * 1000) });
      });
    }

    if (cfg.topicFrequency) {
      ctx.subscribe(cfg.topicFrequency, (p) => {
        const hz = ctx.parseFloatPayload(p, ['frequency', 'freq', 'hz'], cfg.payloadFrequencyJsonPath);
        if (hz !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'frequency', Math.round(hz * 1000));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ electrical sensor "${cfg.name}"`);
  },
};
