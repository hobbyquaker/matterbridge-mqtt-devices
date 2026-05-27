import { irrigationSystem, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const irrigationSystemDescriptor: DeviceDescriptor = {
  type: 'irrigation-system',
  editableKeys: {
    publish: ['topicSetOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicOpenLevel', 'payloadOpenLevelJsonPath', 'topicFlow', 'payloadFlowJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([irrigationSystem, powerSource]);
    ctx.initEp(ep, cfg, 0x8023);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultValveConfigurationAndControlClusterServer();
    ep.createDefaultFlowMeasurementClusterServer();

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'open', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'close', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.ValveConfigurationAndControl, 'currentState', v ? 1 : 0);
      });
    }

    if (cfg.topicOpenLevel) {
      ctx.subscribe(cfg.topicOpenLevel, (p) => {
        const pct = ctx.parseFloatPayload(p, ['level', 'open_level', 'percent'], cfg.payloadOpenLevelJsonPath);
        if (pct !== null) ctx.setAttr(ep, CID.ValveConfigurationAndControl, 'currentLevel', Math.round(Math.max(0, Math.min(100, pct))));
      });
    }

    if (cfg.topicFlow) {
      ctx.subscribe(cfg.topicFlow, (p) => {
        const fl = ctx.parseFloatPayload(p, ['flow', 'flow_rate', 'liter'], cfg.payloadFlowJsonPath);
        if (fl !== null) ctx.setAttr(ep, CID.FlowMeasurement, 'measuredValue', Math.round(fl * 10));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ irrigation system "${cfg.name}"`);
  },
};
