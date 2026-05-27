import { MatterbridgeEndpoint, powerSource, pumpDevice } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const pumpDescriptor: DeviceDescriptor = {
  type: 'pump',
  editableKeys: {
    publish: ['topicSetOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicFlow', 'payloadFlowJsonPath', 'topicPressure', 'payloadPressureJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicOnOff: cfg.topicOnOff ?? `${baseTopic}/state`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([pumpDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x8024);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultPumpConfigurationAndControlClusterServer();
    ep.createDefaultFlowMeasurementClusterServer();
    ep.createDefaultPressureMeasurementClusterServer();

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });
    ctx.onCmd(ep, 'toggle', () => {
      const cur = (ctx.getAttr(ep, CID.OnOff, 'onOff') as boolean) ?? false;
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, cur ? OFF : ON, cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

    if (cfg.topicFlow) {
      ctx.subscribe(cfg.topicFlow, (p) => {
        const fl = ctx.parseFloatPayload(p, ['flow', 'flow_rate', 'liter'], cfg.payloadFlowJsonPath);
        if (fl !== null) ctx.setAttr(ep, CID.FlowMeasurement, 'measuredValue', Math.round(fl * 10));
      });
    }

    if (cfg.topicPressure) {
      ctx.subscribe(cfg.topicPressure, (p) => {
        const kpa = ctx.parseFloatPayload(p, ['pressure', 'kpa', 'bar'], cfg.payloadPressureJsonPath);
        if (kpa !== null) ctx.setAttr(ep, CID.PressureMeasurement, 'measuredValue', Math.round(kpa * 10));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ pump "${cfg.name}"`);
  },
};
