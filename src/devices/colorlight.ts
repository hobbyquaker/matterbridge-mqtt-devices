import { colorTemperatureLight, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { COMMON_KEYS, CID } from './types.js';
import type {
  DeviceDescriptor, DeviceContext, MqttDeviceConfig,
  LevelRequest, HueSatRequest, ColorTempRequest, AnyHandler,
} from './types.js';


export const colorlightDescriptor: DeviceDescriptor = {
  type: 'colorlight',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic', 'stateJsonPath', 'commandTopic', 'payloadOn', 'payloadOff', 'retain',
    'brightnessStateTopic', 'brightnessStateJsonPath', 'brightnessCommandTopic',
    'brightnessMin', 'brightnessMax',
    'colorStateTopic', 'colorStateJsonPath', 'colorCommandTopic',
  ],
  applyDefaults(cfg, baseTopic) {
    return {
      commandTopic:           cfg.commandTopic           ?? `${baseTopic}/set`,
      brightnessStateTopic:   cfg.brightnessStateTopic   ?? `${baseTopic}/brightness`,
      brightnessCommandTopic: cfg.brightnessCommandTopic ?? `${baseTopic}/brightness/set`,
      colorStateTopic:        cfg.colorStateTopic        ?? `${baseTopic}/color`,
      colorCommandTopic:      cfg.colorCommandTopic      ?? `${baseTopic}/color/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON  = cfg.payloadOn  ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([colorTemperatureLight, powerSource]);
    ctx.initEp(ep, cfg, 0x8003);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();
    ep.createDefaultColorControlClusterServer();

    ctx.onCmd(ep, 'on',  async () => { if (cfg.commandTopic) ctx.publish(cfg.commandTopic, ON,  cfg.retain); });
    ctx.onCmd(ep, 'off', async () => { if (cfg.commandTopic) ctx.publish(cfg.commandTopic, OFF, cfg.retain); });

    const levelHandler = async (data: LevelRequest): Promise<void> => {
      const mqttBrightness = ctx.matterLevelToMqttBrightness(data.request.level, briMin, briMax);
      if (cfg.brightnessCommandTopic) ctx.publish(cfg.brightnessCommandTopic, String(mqttBrightness), cfg.retain);
    };
    ctx.onCmd(ep, 'moveToLevel',          levelHandler as AnyHandler);
    ctx.onCmd(ep, 'moveToLevelWithOnOff', levelHandler as AnyHandler);

    ctx.onCmd(ep, 'moveToHueAndSaturation', (async (data: HueSatRequest) => {
      const hue360 = Math.round((data.request.hue        / 254) * 360);
      const sat100 = Math.round((data.request.saturation / 254) * 100);
      ctx.log.info(`[${cfg.name}] → H${hue360}° S${sat100}%`);
      if (cfg.colorCommandTopic)
        ctx.publish(cfg.colorCommandTopic, JSON.stringify({ hue: hue360, saturation: sat100 }), cfg.retain);
    }) as AnyHandler);

    ctx.onCmd(ep, 'moveToColorTemperature', (async (data: ColorTempRequest) => {
      const mireds = data.request.colorTemperatureMireds;
      ctx.log.info(`[${cfg.name}] → ${mireds} mireds`);
      if (cfg.colorCommandTopic)
        ctx.publish(cfg.colorCommandTopic, JSON.stringify({ colorTemp: mireds }), cfg.retain);
    }) as AnyHandler);

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
    if (cfg.colorStateTopic) {
      ctx.subscribe(cfg.colorStateTopic, (p) => {
        const extracted = ctx.extractPayloadValue(p, cfg.colorStateJsonPath);
        if (extracted !== undefined && extracted !== null && typeof extracted === 'object') {
          const d = extracted as Record<string, number>;
          if (d['hue']        !== undefined) ctx.setAttr(ep, CID.ColorControl, 'currentHue',             Math.round((d['hue']        / 360) * 254));
          if (d['saturation'] !== undefined) ctx.setAttr(ep, CID.ColorControl, 'currentSaturation',      Math.round((d['saturation'] / 100) * 254));
          if (d['colorTemp']  !== undefined) ctx.setAttr(ep, CID.ColorControl, 'colorTemperatureMireds', d['colorTemp']);
          return;
        }
        const m = parseInt(ctx.toPayloadString(extracted), 10);
        if (!isNaN(m)) {
          ctx.setAttr(ep, CID.ColorControl, 'colorTemperatureMireds', m);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ color light "${cfg.name}"`);
  },
};
