import path from 'node:path';

import { jest } from '@jest/globals';
import type { MatterbridgeEndpoint, PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

import type { AnyHandler, DeviceContext, MqttDeviceConfig } from '../src/devices/index.js';
import { ALL_EDITABLE_KEYS, DEVICE_REGISTRY, findDescriptor } from '../src/devices/index.js';
import type { DeviceDescriptor } from '../src/devices/types.js';
import { CID } from '../src/devices/types.js';
import { MqttPlatform } from '../src/platform.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockLog = {
  fatal: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  notice: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

const mockMatterbridge: PlatformMatterbridge = {
  systemInformation: { ipv4Address: '127.0.0.1', ipv6Address: '::1', osRelease: 'x', nodeVersion: '22.0.0' },
  rootDirectory: path.join('.cache', 'jest', 'MqttDevices'),
  homeDirectory: path.join('.cache', 'jest', 'MqttDevices'),
  matterbridgeDirectory: path.join('.cache', 'jest', 'MqttDevices', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'jest', 'MqttDevices', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'jest', 'MqttDevices', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'jest', 'MqttDevices', 'node_modules'),
  matterbridgeVersion: '3.10.0',
  matterbridgeLatestVersion: '3.10.0',
  matterbridgeDevVersion: '3.10.0',
  bridgeMode: 'bridge',
  restartMode: '',
  aggregatorVendorId: VendorId(0xfff1),
  aggregatorVendorName: 'Matterbridge',
  aggregatorProductId: 0x8000,
  aggregatorProductName: 'Matterbridge aggregator',
  registerVirtualDevice: jest.fn(async () => {}),
  addBridgedEndpoint: jest.fn(async () => {}),
  removeBridgedEndpoint: jest.fn(async () => {}),
  removeAllBridgedEndpoints: jest.fn(async () => {}),
} as unknown as PlatformMatterbridge;

const mockConfig: PlatformConfig = {
  name: 'matterbridge-mqtt-devices',
  type: 'DynamicPlatform',
  version: '0.11.0',
  broker: 'mqtt://localhost:1883',
  devices: [],
  debug: false,
  unregisterOnShutdown: false,
};

const loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((_level: string, _message: string, ..._parameters: any[]) => {});

// A fake DeviceContext that captures MQTT wiring while reusing the real
// parse/convert helpers from the platform, so descriptor logic runs unchanged.
interface FakeCtx {
  ctx: DeviceContext;
  subs: Map<string, (payload: string) => void>;
  cmds: Map<string, AnyHandler>;
  publish: jest.Mock;
  setAttr: jest.Mock;
}

function descriptor(type: string): DeviceDescriptor {
  const found = findDescriptor(type);
  if (!found) throw new Error(`Descriptor not found: ${type}`);
  return found;
}

function handler(subs: Map<string, (payload: string) => void>, topic: string): (payload: string) => void {
  const h = subs.get(topic);
  if (!h) throw new Error(`No subscription for topic: ${topic}`);
  return h;
}

function command(cmds: Map<string, AnyHandler>, cmd: string): AnyHandler {
  const f = cmds.get(cmd);
  if (!f) throw new Error(`No command handler: ${cmd}`);
  return f;
}

describe('Device descriptors', () => {
  let platform: any;

  beforeAll(() => {
    platform = new MqttPlatform(mockMatterbridge, mockLog, mockConfig);
  });

  afterAll(async () => {
    await platform.onShutdown('devices test');
    loggerLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function makeCtx(): FakeCtx {
    const subs = new Map<string, (payload: string) => void>();
    const cmds = new Map<string, AnyHandler>();
    const publish = jest.fn();
    const setAttr = jest.fn();
    const ctx = {
      log: mockLog,
      subscribe: (topic: string, handler: (payload: string) => void) => subs.set(topic, handler),
      publish,
      getAttr: jest.fn(),
      setAttr,
      onCmd: (_ep: MatterbridgeEndpoint, cmd: string, fn: AnyHandler) => cmds.set(cmd, fn),
      initEp: platform.initEp.bind(platform),
      applyConfigUrl: platform.applyConfigUrl.bind(platform),
      registerDevice: jest.fn(async () => {}),
      subscribeToAvailabilityAndBattery: jest.fn(),
      endpointMap: new Map<string, MatterbridgeEndpoint>(),
      parseOnOff: platform.parseOnOff.bind(platform),
      parseFloatPayload: platform.parseFloatPayload.bind(platform),
      extractPayloadValue: platform.extractPayloadValue.bind(platform),
      wrapPayloadValue: platform.wrapPayloadValue.bind(platform),
      toPayloadString: platform.toPayloadString.bind(platform),
      getBrightnessRange: platform.getBrightnessRange.bind(platform),
      matterLevelToMqttBrightness: platform.matterLevelToMqttBrightness.bind(platform),
      mqttBrightnessToMatterLevel: platform.mqttBrightnessToMatterLevel.bind(platform),
      getCoverPositionRange: platform.getCoverPositionRange.bind(platform),
      coverMatterPctToMqttPosition: platform.coverMatterPctToMqttPosition.bind(platform),
      coverMqttPositionToMatterPct: platform.coverMqttPositionToMatterPct.bind(platform),
    } as unknown as DeviceContext;
    return { ctx, subs, cmds, publish, setAttr };
  }

  describe('registry', () => {
    it('should have a unique type per descriptor', () => {
      const types = DEVICE_REGISTRY.map((d) => d.type);
      expect(new Set(types).size).toBe(types.length);
    });

    it('should only reference known editable keys', () => {
      for (const descriptor of DEVICE_REGISTRY) {
        const keys = [...descriptor.editableKeys.publish, ...descriptor.editableKeys.subscribe, ...descriptor.editableKeys.settings];
        for (const key of keys) {
          expect(ALL_EDITABLE_KEYS).toContain(key);
        }
      }
    });

    it('should find descriptors by type and fall back to on-off-outlet without a type', () => {
      expect(findDescriptor('on-off-light')?.type).toBe('on-off-light');
      expect(findDescriptor('does-not-exist')).toBeUndefined();
      expect(findDescriptor(undefined)?.type).toBe('on-off-outlet');
    });
  });

  describe('on-off-outlet', () => {
    const cfg: MqttDeviceConfig = { id: 'o1', name: 'Outlet', type: 'on-off-outlet', topicSetOnOff: 'o/set', topicOnOff: 'o/state', retain: true };

    it('should publish the configured payloads on on/off commands', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('on-off-outlet').create(ctx, cfg);
      await command(cmds, 'on')({});
      expect(publish).toHaveBeenCalledWith('o/set', 'ON', true);
      await command(cmds, 'off')({});
      expect(publish).toHaveBeenCalledWith('o/set', 'OFF', true);
    });

    it('should update the OnOff attribute from state messages', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('on-off-outlet').create(ctx, cfg);
      const h = handler(subs, 'o/state');
      h('OFF');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.OnOff, 'onOff', false);
      h('{"state":"on"}');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.OnOff, 'onOff', true);
      const calls = setAttr.mock.calls.length;
      h('bogus');
      expect(setAttr.mock.calls.length).toBe(calls);
    });
  });

  describe('dimmable-light', () => {
    const cfg: MqttDeviceConfig = {
      id: 'd1',
      name: 'Dimmer',
      type: 'dimmable-light',
      topicSetOnOff: 'd/set',
      topicOnOff: 'd/state',
      topicMoveToLevel: 'd/bri/set',
      topicMoveToLevelWithOnOff: 'd/bri2/set',
      topicCurrentLevel: 'd/bri',
      brightnessMin: 0,
      brightnessMax: 254,
    };

    it('should publish the mapped brightness on moveToLevel', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('dimmable-light').create(ctx, cfg);
      await command(cmds, 'moveToLevel')({ request: { level: 200 } });
      expect(publish).toHaveBeenCalledWith('d/bri/set', '200', undefined);
    });

    it('should publish brightness and on/off on moveToLevelWithOnOff', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('dimmable-light').create(ctx, cfg);
      await command(cmds, 'moveToLevelWithOnOff')({ request: { level: 0 } });
      expect(publish).toHaveBeenCalledWith('d/bri2/set', '0', undefined);
      expect(publish).toHaveBeenCalledWith('d/set', 'OFF', undefined);
    });

    it('should scale brightness to a custom range', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('dimmable-light').create(ctx, { ...cfg, brightnessMax: 100 });
      await command(cmds, 'moveToLevel')({ request: { level: 254 } });
      expect(publish).toHaveBeenCalledWith('d/bri/set', '100', undefined);
    });

    it('should update currentLevel from brightness messages', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('dimmable-light').create(ctx, cfg);
      handler(subs, 'd/bri')('127');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.LevelControl, 'currentLevel', 127);
    });

    it('should scale incoming brightness from a custom range', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('dimmable-light').create(ctx, { ...cfg, brightnessMax: 100 });
      handler(subs, 'd/bri')('50');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.LevelControl, 'currentLevel', 127);
    });
  });

  describe('color-temperature-light', () => {
    const cfg: MqttDeviceConfig = {
      id: 'c1',
      name: 'CT Light',
      type: 'color-temperature-light',
      topicSetOnOff: 'c/set',
      topicSetColorTemp: 'c/ct/set',
      topicColorTemp: 'c/ct',
    };

    it('should publish plain mireds on moveToColorTemperature', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('color-temperature-light').create(ctx, cfg);
      await command(cmds, 'moveToColorTemperature')({ request: { colorTemperatureMireds: 350 } });
      expect(publish).toHaveBeenCalledWith('c/ct/set', '350', undefined);
    });

    it('should wrap mireds into JSON when a json path is configured', async () => {
      const { ctx, cmds, publish } = makeCtx();
      await descriptor('color-temperature-light').create(ctx, { ...cfg, payloadColorTempJsonPath: 'state.ct' });
      await command(cmds, 'moveToColorTemperature')({ request: { colorTemperatureMireds: 350 } });
      expect(publish).toHaveBeenCalledWith('c/ct/set', '{"state":{"ct":350}}', undefined);
    });

    it('should update colorTemperatureMireds from state messages', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('color-temperature-light').create(ctx, cfg);
      handler(subs, 'c/ct')('370');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.ColorControl, 'colorTemperatureMireds', 370);
    });

    it('should extract mireds behind a json path', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('color-temperature-light').create(ctx, { ...cfg, payloadColorTempJsonPath: 'state.ct' });
      handler(subs, 'c/ct')('{"state":{"ct":320}}');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.ColorControl, 'colorTemperatureMireds', 320);
    });
  });

  describe('contact-sensor', () => {
    const cfg: MqttDeviceConfig = { id: 'cs1', name: 'Door', type: 'contact-sensor', topicContactState: 'door/contact' };

    it('should map open/closed payloads to the BooleanState attribute', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('contact-sensor').create(ctx, cfg);
      const h = handler(subs, 'door/contact');
      h('OPEN');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.BooleanState, 'stateValue', false);
      h('CLOSED');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.BooleanState, 'stateValue', true);
      h('1');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.BooleanState, 'stateValue', true);
    });

    it('should honor custom open/closed payloads', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('contact-sensor').create(ctx, { ...cfg, payloadOpen: 'up', payloadClosed: 'down' });
      const h = handler(subs, 'door/contact');
      h('up');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.BooleanState, 'stateValue', false);
      h('down');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.BooleanState, 'stateValue', true);
    });
  });

  describe('temperature-sensor', () => {
    const cfg: MqttDeviceConfig = { id: 't1', name: 'Temp', type: 'temperature-sensor', topicTemperature: 't/temp' };

    it('should convert celsius payloads to centi-degrees', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('temperature-sensor').create(ctx, cfg);
      const h = handler(subs, 't/temp');
      h('21.57');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.TemperatureMeasurement, 'measuredValue', 2157);
      h('{"temp":22}');
      expect(setAttr).toHaveBeenLastCalledWith(expect.anything(), CID.TemperatureMeasurement, 'measuredValue', 2200);
    });

    it('should ignore non-numeric payloads', async () => {
      const { ctx, subs, setAttr } = makeCtx();
      await descriptor('temperature-sensor').create(ctx, cfg);
      handler(subs, 't/temp')('not-a-number');
      expect(setAttr).not.toHaveBeenCalled();
    });
  });
});
