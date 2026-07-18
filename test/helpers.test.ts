import path from 'node:path';

import { jest } from '@jest/globals';
import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

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
  rootDirectory: path.join('.cache', 'jest', 'MqttHelpers'),
  homeDirectory: path.join('.cache', 'jest', 'MqttHelpers'),
  matterbridgeDirectory: path.join('.cache', 'jest', 'MqttHelpers', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'jest', 'MqttHelpers', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'jest', 'MqttHelpers', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'jest', 'MqttHelpers', 'node_modules'),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MqttPlatform helpers', () => {
  let platform: any;

  beforeAll(() => {
    platform = new MqttPlatform(mockMatterbridge, mockLog, mockConfig);
  });

  afterAll(async () => {
    await platform.onShutdown('helpers test');
    loggerLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('parseOnOff', () => {
    it('should parse the configured on/off payloads', () => {
      expect(platform.parseOnOff('ON', 'ON', 'OFF')).toBe(true);
      expect(platform.parseOnOff('OFF', 'ON', 'OFF')).toBe(false);
      expect(platform.parseOnOff('open', 'open', 'closed')).toBe(true);
      expect(platform.parseOnOff('closed', 'open', 'closed')).toBe(false);
    });

    it('should parse common boolean-ish payloads', () => {
      expect(platform.parseOnOff('1', 'ON', 'OFF')).toBe(true);
      expect(platform.parseOnOff('true', 'ON', 'OFF')).toBe(true);
      expect(platform.parseOnOff('0', 'ON', 'OFF')).toBe(false);
      expect(platform.parseOnOff('false', 'ON', 'OFF')).toBe(false);
    });

    it('should parse JSON payloads with state/value/power fields', () => {
      expect(platform.parseOnOff('{"state":"on"}', 'ON', 'OFF')).toBe(true);
      expect(platform.parseOnOff('{"state":"off"}', 'ON', 'OFF')).toBe(false);
      expect(platform.parseOnOff('{"power":1}', 'ON', 'OFF')).toBe(true);
    });

    it('should extract the value with a json path', () => {
      expect(platform.parseOnOff('{"s":{"v":"ON"}}', 'ON', 'OFF', 's.v')).toBe(true);
      expect(platform.parseOnOff('{"s":{"v":"off"}}', 'ON', 'OFF', 's.v')).toBe(false);
    });

    it('should return null for unrecognized payloads', () => {
      expect(platform.parseOnOff('garbage', 'ON', 'OFF')).toBeNull();
      expect(platform.parseOnOff('{"s":{"v":"weird"}}', 'ON', 'OFF', 's.v')).toBeNull();
    });
  });

  describe('extractPayloadValue', () => {
    it('should return the raw payload without a json path', () => {
      expect(platform.extractPayloadValue('21.5')).toBe('21.5');
    });

    it('should resolve dot notation paths', () => {
      expect(platform.extractPayloadValue('{"a":{"b":5}}', 'a.b')).toBe(5);
      expect(platform.extractPayloadValue('{"a":{"b":5}}', '$.a.b')).toBe(5);
    });

    it('should resolve array index paths', () => {
      expect(platform.extractPayloadValue('{"values":[{"t":1},{"t":2}]}', 'values[1].t')).toBe(2);
    });

    it('should return undefined for missing keys', () => {
      expect(platform.extractPayloadValue('{"a":1}', 'x.y')).toBeUndefined();
    });

    it('should fall back to the raw payload when the payload is not JSON', () => {
      expect(platform.extractPayloadValue('plain', 'a.b')).toBe('plain');
    });
  });

  describe('wrapPayloadValue', () => {
    it('should return the plain value without a json path', () => {
      expect(platform.wrapPayloadValue(350)).toBe('350');
    });

    it('should wrap the value into nested JSON for dot notation paths', () => {
      expect(platform.wrapPayloadValue(350, 'state.ct')).toBe('{"state":{"ct":350}}');
    });

    it('should wrap the value into arrays for index paths', () => {
      expect(platform.wrapPayloadValue(350, 'a[0]')).toBe('{"a":[350]}');
    });
  });

  describe('toPayloadString', () => {
    it('should stringify primitive values', () => {
      expect(platform.toPayloadString(null)).toBe('');
      expect(platform.toPayloadString(undefined)).toBe('');
      expect(platform.toPayloadString('  x ')).toBe('x');
      expect(platform.toPayloadString(7)).toBe('7');
      expect(platform.toPayloadString(false)).toBe('false');
      expect(platform.toPayloadString({ a: 1 })).toBe('{"a":1}');
    });
  });

  describe('parseFloatPayload', () => {
    it('should parse plain numeric payloads', () => {
      expect(platform.parseFloatPayload('21.5', [])).toBe(21.5);
    });

    it('should parse JSON payloads with well-known keys', () => {
      expect(platform.parseFloatPayload('{"temperature":22.3}', ['temperature'])).toBe(22.3);
      expect(platform.parseFloatPayload('{"level":50}', ['battery', 'level'])).toBe(50);
    });

    it('should parse values behind a json path', () => {
      expect(platform.parseFloatPayload('{"s":{"v":"12.5"}}', [], 's.v')).toBe(12.5);
    });

    it('should return null for non-numeric payloads', () => {
      expect(platform.parseFloatPayload('abc', [])).toBeNull();
    });
  });

  describe('brightness mapping', () => {
    it('should map matter levels to the mqtt brightness range', () => {
      expect(platform.matterLevelToMqttBrightness(254, 0, 100)).toBe(100);
      expect(platform.matterLevelToMqttBrightness(127, 0, 100)).toBe(50);
      expect(platform.matterLevelToMqttBrightness(300, 0, 254)).toBe(254);
      expect(platform.matterLevelToMqttBrightness(-5, 0, 254)).toBe(0);
    });

    it('should map mqtt brightness to matter levels with clamping', () => {
      expect(platform.mqttBrightnessToMatterLevel(100, 0, 100)).toBe(254);
      expect(platform.mqttBrightnessToMatterLevel(50, 0, 100)).toBe(127);
      expect(platform.mqttBrightnessToMatterLevel(150, 0, 100)).toBe(254);
      expect(platform.mqttBrightnessToMatterLevel(-10, 0, 100)).toBe(0);
    });

    it('should return the configured brightness range and fall back on invalid ranges', () => {
      expect(platform.getBrightnessRange({ name: 'x' })).toEqual({ min: 0, max: 100 });
      expect(platform.getBrightnessRange({ name: 'x', brightnessMin: 0, brightnessMax: 254 })).toEqual({ min: 0, max: 254 });
      expect(platform.getBrightnessRange({ name: 'x', brightnessMin: 100, brightnessMax: 50 })).toEqual({ min: 0, max: 100 });
    });
  });

  describe('cover position mapping', () => {
    it('should map matter percentage to the mqtt position range', () => {
      expect(platform.coverMatterPctToMqttPosition(100, 0, 255)).toBe(255);
      expect(platform.coverMatterPctToMqttPosition(50, 0, 100)).toBe(50);
      expect(platform.coverMatterPctToMqttPosition(120, 0, 100)).toBe(100);
    });

    it('should map mqtt position to matter percentage with clamping', () => {
      expect(platform.coverMqttPositionToMatterPct(255, 0, 255)).toBe(100);
      expect(platform.coverMqttPositionToMatterPct(300, 0, 255)).toBe(100);
      expect(platform.coverMqttPositionToMatterPct(0, 0, 255)).toBe(0);
    });

    it('should return the configured position range and fall back on invalid ranges', () => {
      expect(platform.getCoverPositionRange({ name: 'x' })).toEqual({ min: 0, max: 100 });
      expect(platform.getCoverPositionRange({ name: 'x', positionMin: 9, positionMax: 3 })).toEqual({ min: 0, max: 100 });
    });
  });

  describe('slugify', () => {
    it('should generate stable ids from device names', () => {
      expect(platform.slugify('Living Room Light')).toBe('living_room_light');
      expect(platform.slugify('Küche!')).toBe('k_che');
      expect(platform.slugify('--')).toBe('');
    });
  });

  describe('buildDeviceConfigUrl', () => {
    it('should prefer a custom configUrl and trim it', () => {
      expect(platform.buildDeviceConfigUrl({ name: 'x', configUrl: ' http://example.local/page ' })).toBe('http://example.local/page');
    });

    it('should build the plugin editor url with the encoded device id', () => {
      expect(platform.buildDeviceConfigUrl({ name: 'x', id: 'my dev' })).toBe('/plugins/matterbridge-mqtt-devices/?device=my%20dev');
    });
  });
});
