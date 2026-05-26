import { dimmableOutlet, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { COMMON_KEYS, CID } from './types.js';
import type { DeviceDescriptor, DeviceContext, MqttDeviceConfig, LevelRequest, AnyHandler } from './types.js';


export const dimmableOutletDescriptor: DeviceDescriptor = {
  type: 'dimmable_outlet',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic', 'stateJsonPath', 'commandTopic', 'payloadOn', 'payloadOff', 'retain',
    'brightnessStateTopic', 'brightnessStateJsonPath', 'brightnessCommandTopic',
    'brightnessMin', 'brightnessMax',
  ],
  applyDefaults(cfg, baseTopic) {
    return {
      commandTopic:           cfg.commandTopic           ?? `${baseTopic}/set`,
      brightnessStateTopic:   cfg.brightnessStateTopic   ?? `${baseTopic}/brightness`,
      brightnessCommandTopic: cfg.brightnessCommandTopic ?? `${baseTopic}/brightness/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON  = cfg.payloadOn  ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([dimmableOutlet, powerSource]);
    ctx.initEp(ep, cfg, 0x800C);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();

    ctx.onCmd(ep, 'on',  async () => { if (cfg.commandTopic) ctx.publish(cfg.commandTopic, ON,  cfg.retain); });
    ctx.onCmd(ep, 'off', async () => { if (cfg.commandTopic) ctx.publish(cfg.commandTopic, OFF, cfg.retain); });

    const levelHandler = async (data: LevelRequest): Promise<void> => {
      const lv254 = data.request.level;
      const mqttBrightness = ctx.matterLevelToMqttBrightness(lv254, briMin, briMax);
      ctx.log.info(`[${cfg.name}] → level ${lv254} (mqtt ${mqttBrightness}, range ${briMin}-${briMax})`);
      if (cfg.brightnessCommandTopic) ctx.publish(cfg.brightnessCommandTopic, String(mqttBrightness), cfg.retain);
      if (cfg.commandTopic)           ctx.publish(cfg.commandTopic, lv254 > 0 ? ON : OFF, cfg.retain);
    };
    ctx.onCmd(ep, 'moveToLevel',          levelHandler as AnyHandler);
    ctx.onCmd(ep, 'moveToLevelWithOnOff', levelHandler as AnyHandler);

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.stateJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }
    if (cfg.brightnessStateTopic) {
      ctx.subscribe(cfg.brightnessStateTopic, (p) => {
        const raw = ctx.parseFloatPayload(p, [], cfg.brightnessStateJsonPath);
        if (raw !== null && !isNaN(raw)) {
          const lv = ctx.mqttBrightnessToMatterLevel(raw, briMin, briMax);
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', lv);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ dimmable outlet "${cfg.name}"`);
  },
};
