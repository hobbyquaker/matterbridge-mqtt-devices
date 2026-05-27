import { evse, MatterbridgeEndpoint } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const evseDescriptor: DeviceDescriptor = {
  type: 'evse',
  editableKeys: {
    publish: ['topicSetOnOff'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicOnOff',
      'payloadOnOffJsonPath',
      'topicPower',
      'payloadPowerJsonPath',
      'topicVoltage',
      'payloadVoltageJsonPath',
      'topicCurrent',
      'payloadCurrentJsonPath',
      'topicFrequency',
      'payloadFrequencyJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([evse]);
    ctx.initEp(ep, cfg, 0x8028);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultElectricalPowerMeasurementClusterServer();
    ep.addRequiredClusterServers();

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    if (cfg.topicPower) {
      ctx.subscribe(cfg.topicPower, (p) => {
        const w = ctx.parseFloatPayload(p, ['power', 'charging_power', 'watt'], cfg.payloadPowerJsonPath);
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
        const a = ctx.parseFloatPayload(p, ['current', 'ampere', 'amp'], cfg.payloadCurrentJsonPath);
        if (a !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'activeCurrent', Math.round(a * 1000));
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
    ctx.log.info(`✓ EVSE "${cfg.name}"`);
  },
};
