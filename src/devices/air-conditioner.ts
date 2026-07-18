import { MatterbridgeEndpoint, powerSource, roomAirConditioner } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const airConditionerDescriptor: DeviceDescriptor = {
  type: 'air-conditioner',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetTargetTemp', 'topicSetCoolingSetpoint', 'topicSetSpeed', 'topicSetSystemMode', 'topicSetFanMode'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicOnOff',
      'payloadOnOffJsonPath',
      'topicLocalTemp',
      'payloadLocalTempJsonPath',
      'topicTargetTemp',
      'payloadTargetTempJsonPath',
      'topicCoolingSetpoint',
      'payloadCoolingSetpointJsonPath',
      'topicSpeed',
      'payloadSpeedJsonPath',
      'topicSystemMode',
      'payloadSystemModeJsonPath',
      'topicFanMode',
      'payloadFanModeJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([roomAirConditioner, powerSource]);
    ctx.initEp(ep, cfg, 0x801f);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultThermostatClusterServer(2000, 2100, 2600);
    ep.createDefaultFanControlClusterServer();

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    void ep.subscribeAttribute(
      'Thermostat',
      'occupiedHeatingSetpoint',
      (newValue: number) => {
        if (cfg.topicSetTargetTemp) ctx.publish(cfg.topicSetTargetTemp, String(newValue / 100), cfg.retain);
      },
      ctx.log,
    );

    void ep.subscribeAttribute(
      'Thermostat',
      'occupiedCoolingSetpoint',
      (newValue: number) => {
        if (cfg.topicSetCoolingSetpoint) ctx.publish(cfg.topicSetCoolingSetpoint, String(newValue / 100), cfg.retain);
      },
      ctx.log,
    );

    void ep.subscribeAttribute(
      'FanControl',
      'percentSetting',
      (newPct: number) => {
        if (cfg.topicSetSpeed) ctx.publish(cfg.topicSetSpeed, String(newPct), cfg.retain);
      },
      ctx.log,
    );

    const SYSTEM_MODE_STR: Record<number, string> = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 5: 'emergency_heat', 7: 'fan_only', 8: 'dry' };
    const SYSTEM_MODE_NUM: Record<string, number> = { off: 0, auto: 1, cool: 3, heat: 4, emergency_heat: 5, fan_only: 7, dry: 8 };
    const FAN_MODE_STR: Record<number, string> = { 0: 'off', 1: 'low', 2: 'medium', 3: 'high', 4: 'on', 5: 'auto', 6: 'smart' };
    const FAN_MODE_NUM: Record<string, number> = { off: 0, low: 1, medium: 2, high: 3, on: 4, auto: 5, smart: 6 };

    void ep.subscribeAttribute(
      'Thermostat',
      'systemMode',
      (newValue: number) => {
        const s = SYSTEM_MODE_STR[newValue] ?? String(newValue);
        if (cfg.topicSetSystemMode) ctx.publish(cfg.topicSetSystemMode, s, cfg.retain);
      },
      ctx.log,
    );

    void ep.subscribeAttribute(
      'FanControl',
      'fanMode',
      (newValue: number) => {
        const s = FAN_MODE_STR[newValue] ?? String(newValue);
        if (cfg.topicSetFanMode) ctx.publish(cfg.topicSetFanMode, s, cfg.retain);
      },
      ctx.log,
    );

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

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

    if (cfg.topicCoolingSetpoint) {
      ctx.subscribe(cfg.topicCoolingSetpoint, (p) => {
        const c = ctx.parseFloatPayload(p, ['cooling_setpoint', 'occupied_cooling_setpoint'], cfg.payloadCoolingSetpointJsonPath);
        if (c !== null) ctx.setAttr(ep, CID.Thermostat, 'occupiedCoolingSetpoint', Math.round(c * 100));
      });
    }

    if (cfg.topicSpeed) {
      ctx.subscribe(cfg.topicSpeed, (p) => {
        const pct = ctx.parseFloatPayload(p, ['percent', 'speed'], cfg.payloadSpeedJsonPath);
        if (pct !== null) ctx.setAttr(ep, CID.FanControl, 'percentSetting', Math.round(Math.max(0, Math.min(100, pct))));
      });
    }

    if (cfg.topicSystemMode) {
      ctx.subscribe(cfg.topicSystemMode, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadSystemModeJsonPath)).toLowerCase();
        const mode = SYSTEM_MODE_NUM[raw] ?? parseInt(raw, 10);
        if (Number.isFinite(mode)) ctx.setAttr(ep, CID.Thermostat, 'systemMode', mode);
      });
    }

    if (cfg.topicFanMode) {
      ctx.subscribe(cfg.topicFanMode, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadFanModeJsonPath)).toLowerCase();
        const mode = FAN_MODE_NUM[raw] ?? parseInt(raw, 10);
        if (Number.isFinite(mode)) ctx.setAttr(ep, CID.FanControl, 'fanMode', mode);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ air conditioner "${cfg.name}"`);
  },
};
