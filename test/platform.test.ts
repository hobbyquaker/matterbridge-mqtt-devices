import path from 'node:path';

import { jest } from '@jest/globals';
import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

// Mock mqtt BEFORE importing the module (ESM requirement)
const mockMqttClient = {
  connected: true,
  once: jest.fn((event: string, cb: (...args: any[]) => void) => {
    if (event === 'connect') cb();
  }),
  on: jest.fn(),
  subscribe: jest.fn(),
  publish: jest.fn(),
  endAsync: jest.fn(async () => {}),
};

jest.unstable_mockModule('mqtt', () => ({
  default: { connect: jest.fn(() => mockMqttClient) },
}));

const { MqttPlatform } = await import('../src/platform.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockLog = {
  fatal: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  notice: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

function makeMatterbridge(): PlatformMatterbridge {
  return {
    systemInformation: { ipv4Address: '127.0.0.1', ipv6Address: '::1', osRelease: 'x', nodeVersion: '22.0.0' },
    rootDirectory: path.join('.cache', 'jest', 'MqttPlatformTest'),
    homeDirectory: path.join('.cache', 'jest', 'MqttPlatformTest'),
    matterbridgeDirectory: path.join('.cache', 'jest', 'MqttPlatformTest', '.matterbridge'),
    matterbridgePluginDirectory: path.join('.cache', 'jest', 'MqttPlatformTest', 'Matterbridge'),
    matterbridgeCertDirectory: path.join('.cache', 'jest', 'MqttPlatformTest', '.mattercert'),
    globalModulesDirectory: path.join('.cache', 'jest', 'MqttPlatformTest', 'node_modules'),
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
}

function makeConfig(devices: Record<string, unknown>[], extra: Record<string, unknown> = {}): PlatformConfig {
  return {
    name: 'matterbridge-mqtt-devices',
    type: 'DynamicPlatform',
    version: '0.11.0',
    broker: 'mqtt://localhost:1883',
    devices,
    debug: false,
    unregisterOnShutdown: false,
    ...extra,
  } as unknown as PlatformConfig;
}

const loggerLogSpy = jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation((_level: string, _message: string, ..._parameters: any[]) => {});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MqttPlatform', () => {
  afterAll(() => {
    loggerLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('onStart with configured devices', () => {
    let platform: any;

    beforeAll(async () => {
      jest.clearAllMocks();
      platform = new MqttPlatform(
        makeMatterbridge(),
        mockLog,
        makeConfig([
          { name: 'Kitchen Light', type: 'on-off-light', topicSetOnOff: 'kitchen/set', topicOnOff: 'kitchen/state' },
          { name: 'Outdoor Temp', type: 'temperature-sensor', topicTemperature: 'outdoor/temp' },
          { name: 'Mystery', type: 'ufo-device' },
        ]),
      );
      await platform.onStart('test');
    });

    afterAll(async () => {
      await platform.onShutdown('test');
    });

    it('should create endpoints for known device types and generate slug ids', () => {
      expect(platform.endpointMap.size).toBe(2);
      expect(platform.endpointMap.has('kitchen_light')).toBe(true);
      expect(platform.endpointMap.has('outdoor_temp')).toBe(true);
    });

    it('should warn and skip devices with an unknown type', () => {
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown type "ufo-device"'));
    });

    it('should subscribe to the configured state topics', () => {
      const topics = mockMqttClient.subscribe.mock.calls.map((c: any[]) => c[0]);
      expect(topics).toContain('kitchen/state');
      expect(topics).toContain('outdoor/temp');
    });

    function getOnMessage(): (topic: string, buf: Buffer) => void {
      const messageCall = mockMqttClient.on.mock.calls.find((c: any[]) => c[0] === 'message');
      if (!messageCall) throw new Error('Expected MQTT "message" handler to be registered');
      return messageCall[1] as (topic: string, buf: Buffer) => void;
    }

    it('should dispatch incoming messages to the registered topic handler', () => {
      const onMessage = getOnMessage();
      expect(() => onMessage('kitchen/state', Buffer.from(' ON \n'))).not.toThrow();
    });

    it('should warn on messages for topics without a handler', () => {
      const onMessage = getOnMessage();
      onMessage('unknown/topic', Buffer.from('x'));
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('no handler registered'));
    });
  });

  describe('whiteList and blackList', () => {
    it('should only create whitelisted devices', async () => {
      const platform: any = new MqttPlatform(
        makeMatterbridge(),
        mockLog,
        makeConfig(
          [
            { name: 'Kitchen Light', type: 'on-off-light', topicOnOff: 'kitchen/state' },
            { name: 'Outdoor Temp', type: 'temperature-sensor', topicTemperature: 'outdoor/temp' },
          ],
          { whiteList: ['Kitchen Light'] },
        ),
      );
      await platform.onStart('test');
      expect(platform.endpointMap.size).toBe(1);
      expect(platform.endpointMap.has('kitchen_light')).toBe(true);
      await platform.onShutdown('test');
    });

    it('should skip blacklisted devices', async () => {
      const platform: any = new MqttPlatform(
        makeMatterbridge(),
        mockLog,
        makeConfig(
          [
            { name: 'Kitchen Light', type: 'on-off-light', topicOnOff: 'kitchen/state' },
            { name: 'Outdoor Temp', type: 'temperature-sensor', topicTemperature: 'outdoor/temp' },
          ],
          { blackList: ['Outdoor Temp'] },
        ),
      );
      await platform.onStart('test');
      expect(platform.endpointMap.size).toBe(1);
      expect(platform.endpointMap.has('kitchen_light')).toBe(true);
      await platform.onShutdown('test');
    });

    it('should skip devices disabled in their config', async () => {
      const platform: any = new MqttPlatform(
        makeMatterbridge(),
        mockLog,
        makeConfig([
          { name: 'Kitchen Light', type: 'on-off-light', topicOnOff: 'kitchen/state', enabled: false },
          { name: 'Outdoor Temp', type: 'temperature-sensor', topicTemperature: 'outdoor/temp' },
        ]),
      );
      await platform.onStart('test');
      expect(platform.endpointMap.size).toBe(1);
      expect(platform.endpointMap.has('outdoor_temp')).toBe(true);
      await platform.onShutdown('test');
    });
  });

  describe('onFetch config API', () => {
    let platform: any;
    let saveConfigSpy: any;

    beforeAll(async () => {
      platform = new MqttPlatform(
        makeMatterbridge(),
        mockLog,
        makeConfig([{ name: 'Kitchen Light', type: 'on-off-light', topicSetOnOff: 'kitchen/set', topicOnOff: 'kitchen/state' }]),
      );
      saveConfigSpy = jest.spyOn(platform, 'saveConfig').mockImplementation(() => {});
      await platform.onStart('test');
    });

    afterAll(async () => {
      await platform.onShutdown('test');
    });

    it('should return the editor model for a known device on GET', async () => {
      const result: any = await platform.onFetch('GET', 'config', { device: 'kitchen_light' });
      expect(result).toBeDefined();
      expect(result.title).toBe('Kitchen Light (on-off-light)');
      expect(result.deviceId).toBe('kitchen_light');
      expect(result.values.topicSetOnOff).toBe('kitchen/set');
      expect(result.groups.publish).toContain('topicSetOnOff');
    });

    it('should return undefined for unknown devices and paths', async () => {
      expect(await platform.onFetch('GET', 'config', { device: 'nope' })).toBeUndefined();
      expect(await platform.onFetch('GET', 'other', { device: 'kitchen_light' })).toBeUndefined();
    });

    it('should apply editable values and persist on POST', async () => {
      const result: any = await platform.onFetch('POST', 'config', {
        deviceId: 'kitchen_light',
        topicSetOnOff: 'kitchen/cmd',
        retain: 'true',
      });
      expect(result).toEqual({ ok: true });
      const devices = platform.config.devices as Record<string, unknown>[];
      expect(devices[0].topicSetOnOff).toBe('kitchen/cmd');
      expect(devices[0].retain).toBe(true);
      expect(saveConfigSpy).toHaveBeenCalled();
    });

    it('should ignore keys that are not editable for the device type', async () => {
      await platform.onFetch('POST', 'config', { deviceId: 'kitchen_light', brightnessMin: '7' });
      const devices = platform.config.devices as Record<string, unknown>[];
      expect(devices[0].brightnessMin).toBeUndefined();
    });

    it('should reject a POST without deviceId and return undefined for unknown devices', async () => {
      expect(await platform.onFetch('POST', 'config', {})).toEqual({ ok: false, error: 'deviceId is required' });
      expect(await platform.onFetch('POST', 'config', { deviceId: 'nope' })).toBeUndefined();
    });

    it('should report save failures', async () => {
      saveConfigSpy.mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      const result: any = await platform.onFetch('POST', 'config', { deviceId: 'kitchen_light', topicSetOnOff: 'kitchen/cmd2' });
      expect(result).toEqual({ ok: false, error: 'Save failed: disk full' });
    });
  });
});
