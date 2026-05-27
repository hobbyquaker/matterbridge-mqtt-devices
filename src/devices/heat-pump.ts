import { heatPump, MatterbridgeEndpoint } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const heatPumpDescriptor: DeviceDescriptor = {
  type: 'heat-pump',
  editableKeys: {
    publish: ['topicSetTargetTemp', 'topicSetCoolingSetpoint', 'topicSetSystemMode'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicLocalTemp',
      'payloadLocalTempJsonPath',
      'topicTargetTemp',
      'payloadTargetTempJsonPath',
      'topicCoolingSetpoint',
      'payloadCoolingSetpointJsonPath',
      'topicPower',
      'payloadPowerJsonPath',
      'topicSystemMode',
      'payloadSystemModeJsonPath',
      'topicRunningState',
      'payloadRunningStateJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([heatPump]);
    ctx.initEp(ep, cfg, 0x8029);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultThermostatClusterServer(2000, 2100, 2600);
    ep.createDefaultElectricalPowerMeasurementClusterServer();

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

    if (cfg.topicPower) {
      ctx.subscribe(cfg.topicPower, (p) => {
        const w = ctx.parseFloatPayload(p, ['power', 'active_power', 'watt'], cfg.payloadPowerJsonPath);
        if (w !== null) ctx.setAttr(ep, CID.ElectricalPowerMeasurement, 'activePower', Math.round(w * 1000));
      });
    }

    if (cfg.topicSystemMode) {
      ctx.subscribe(cfg.topicSystemMode, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadSystemModeJsonPath)).toLowerCase();
        const mode = SYSTEM_MODE_NUM[raw] ?? parseInt(raw, 10);
        if (Number.isFinite(mode)) ctx.setAttr(ep, CID.Thermostat, 'systemMode', mode);
      });
    }

    if (cfg.topicRunningState) {
      ctx.subscribe(cfg.topicRunningState, (p) => {
        const val = ctx.parseFloatPayload(p, ['running_state', 'state', 'value'], cfg.payloadRunningStateJsonPath);
        if (val !== null && Number.isFinite(val)) ctx.setAttr(ep, CID.Thermostat, 'thermostatRunningState', Math.round(val));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ heat pump "${cfg.name}"`);
  },
};
