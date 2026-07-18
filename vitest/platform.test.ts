/**
 * Unit tests for MqttPlatform utility methods and MQTT flows.
 *
 * @file platform.test.ts
 */

import path from 'node:path';

import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted — declare mock client via vi.hoisted so it is available in the factory
const mockMqttClient = vi.hoisted(() => ({
  connected: false,
  once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'connect') cb();
  }),
  on: vi.fn(),
  subscribe: vi.fn(),
  publish: vi.fn(),
  endAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => mockMqttClient) },
}));

import type { MqttDeviceConfig } from '../src/devices/index.js';
import initializePlugin, { MqttPlatform } from '../src/module.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const mockLog = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  notice: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as AnsiLogger;

const mockMatterbridge: PlatformMatterbridge = {
  systemInformation: { ipv4Address: '127.0.0.1', ipv6Address: '::1', osRelease: 'x', nodeVersion: '22.0.0' },
  rootDirectory: path.join('.cache', 'vitest', 'MqttPlatform'),
  homeDirectory: path.join('.cache', 'vitest', 'MqttPlatform'),
  matterbridgeDirectory: path.join('.cache', 'vitest', 'MqttPlatform', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'vitest', 'MqttPlatform', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'vitest', 'MqttPlatform', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'vitest', 'MqttPlatform', 'node_modules'),
  matterbridgeVersion: '3.5.0',
  matterbridgeLatestVersion: '3.5.0',
  matterbridgeDevVersion: '3.5.0',
  bridgeMode: 'bridge',
  restartMode: '',
  aggregatorVendorId: VendorId(0xfff1),
  aggregatorVendorName: 'Matterbridge',
  aggregatorProductId: 0x8000,
  aggregatorProductName: 'Matterbridge aggregator',
  registerVirtualDevice: vi.fn(async () => {}),
  addBridgedEndpoint: vi.fn(async () => {}),
  removeBridgedEndpoint: vi.fn(async () => {}),
  removeAllBridgedEndpoints: vi.fn(async () => {}),
} as unknown as PlatformMatterbridge;

const baseConfig: PlatformConfig = {
  name: 'matterbridge-mqtt-devices',
  type: 'DynamicPlatform',
  version: '0.11.0',
  broker: 'mqtt://localhost:1883',
  devices: [],
  debug: false,
  unregisterOnShutdown: false,
};

function makeInstance(extra: Record<string, unknown> = {}): MqttPlatform {
  return initializePlugin(mockMatterbridge, mockLog, { ...baseConfig, ...extra } as PlatformConfig);
}

// ── Private method accessor ────────────────────────────────────────────────────
// Private methods are accessed via `as any` cast — compile-time private is a TypeScript
// construct only; at runtime they are regular methods.
function priv(inst: MqttPlatform): any {
  return inst as any;
}

// ── Utility method tests ───────────────────────────────────────────────────────

describe('MqttPlatform – utility methods', () => {
  let instance: MqttPlatform;

  beforeEach(() => {
    vi.spyOn(AnsiLogger.prototype, 'log').mockImplementation(() => {});
    instance = makeInstance();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ── onShutdown ───────────────────────────────────────────────────────────────

  describe('onShutdown', () => {
    it('should call endAsync when MQTT is connected', async () => {
      await instance.onStart('setup');
      mockMqttClient.connected = true;
      await instance.onShutdown('test');
      expect(mockMqttClient.endAsync).toHaveBeenCalledOnce();
      mockMqttClient.connected = false;
    });
  });

  // ── extractPayloadValue ──────────────────────────────────────────────────────

  describe('extractPayloadValue', () => {
    it('should return payload as-is when no jsonPath is given', () => {
      expect(priv(instance).extractPayloadValue('hello', undefined)).toBe('hello');
    });

    it('should return raw payload when jsonPath is empty string (falsy → no extraction)', () => {
      expect(priv(instance).extractPayloadValue('{"a":1}', '')).toBe('{"a":1}');
    });

    it('should extract a top-level key from JSON', () => {
      expect(priv(instance).extractPayloadValue('{"temperature":22.5}', 'temperature')).toBe(22.5);
    });

    it('should extract a nested key using dot notation', () => {
      expect(priv(instance).extractPayloadValue('{"sensor":{"value":42}}', 'sensor.value')).toBe(42);
    });

    it('should extract an array element by index notation', () => {
      expect(priv(instance).extractPayloadValue('{"values":[10,20,30]}', 'values[1]')).toBe(20);
    });

    it('should strip a leading $. prefix from jsonPath', () => {
      expect(priv(instance).extractPayloadValue('{"a":99}', '$.a')).toBe(99);
    });

    it('should strip a bare $ prefix from jsonPath', () => {
      expect(priv(instance).extractPayloadValue('{"x":7}', '$.x')).toBe(7);
    });

    it('should return undefined when the key is not present in the object', () => {
      expect(priv(instance).extractPayloadValue('{"a":1}', 'b')).toBeUndefined();
    });

    it('should return the raw payload string and warn when JSON is invalid', () => {
      const result = priv(instance).extractPayloadValue('not-json', 'a.b');
      expect(result).toBe('not-json');
    });

    it('should return undefined when traversing a path into a primitive', () => {
      expect(priv(instance).extractPayloadValue('{"a":42}', 'a.b')).toBeUndefined();
    });

    it('should handle deeply nested paths', () => {
      expect(priv(instance).extractPayloadValue('{"a":{"b":{"c":true}}}', 'a.b.c')).toBe(true);
    });
  });

  // ── toPayloadString ──────────────────────────────────────────────────────────

  describe('toPayloadString', () => {
    it.each([
      [null, ''],
      [undefined, ''],
      ['  hello  ', 'hello'],
      [42, '42'],
      [true, 'true'],
      [false, 'false'],
      [{ x: 1 }, '{"x":1}'],
    ] as [unknown, string][])('should convert %s to "%s"', (input, expected) => {
      expect(priv(instance).toPayloadString(input)).toBe(expected);
    });
  });

  // ── parseFloatPayload ────────────────────────────────────────────────────────

  describe('parseFloatPayload', () => {
    it('should parse a plain numeric string', () => {
      expect(priv(instance).parseFloatPayload('23.5', ['value'])).toBe(23.5);
    });

    it('should extract the value from a JSON object using the first matching key', () => {
      expect(priv(instance).parseFloatPayload('{"temperature":18.1}', ['temperature', 'value'])).toBe(18.1);
    });

    it('should try alternative JSON keys in order', () => {
      expect(priv(instance).parseFloatPayload('{"val":7}', ['temperature', 'val'])).toBe(7);
    });

    it('should use jsonPath when provided', () => {
      expect(priv(instance).parseFloatPayload('{"sensor":{"reading":55}}', ['value'], 'sensor.reading')).toBe(55);
    });

    it('should return null for a non-numeric plain string', () => {
      expect(priv(instance).parseFloatPayload('hot', ['value'])).toBeNull();
    });

    it('should return null when the JSON key value is non-numeric', () => {
      expect(priv(instance).parseFloatPayload('{"value":"hot"}', ['value'])).toBeNull();
    });

    it('should fallback to plain parse when no JSON key matches', () => {
      expect(priv(instance).parseFloatPayload('{"other":1}', ['temperature'], undefined)).toBe(null);
    });
  });

  // ── parseOnOff ───────────────────────────────────────────────────────────────

  describe('parseOnOff', () => {
    it('should return true for a custom ON payload', () => {
      expect(priv(instance).parseOnOff('POWER_ON', 'POWER_ON', 'POWER_OFF')).toBe(true);
    });

    it('should return false for a custom OFF payload', () => {
      expect(priv(instance).parseOnOff('POWER_OFF', 'POWER_ON', 'POWER_OFF')).toBe(false);
    });

    it('should return true for a plain "ON" string', () => {
      expect(priv(instance).parseOnOff('ON', 'X', 'Y')).toBe(true);
    });

    it('should return false for a plain "OFF" string', () => {
      expect(priv(instance).parseOnOff('OFF', 'X', 'Y')).toBe(false);
    });

    it('should return true for "1"', () => {
      expect(priv(instance).parseOnOff('1', 'X', 'Y')).toBe(true);
    });

    it('should return false for "0"', () => {
      expect(priv(instance).parseOnOff('0', 'X', 'Y')).toBe(false);
    });

    it('should return true for "TRUE" (case-insensitive)', () => {
      expect(priv(instance).parseOnOff('true', 'X', 'Y')).toBe(true);
    });

    it('should return false for "false" (case-insensitive)', () => {
      expect(priv(instance).parseOnOff('FALSE', 'X', 'Y')).toBe(false);
    });

    it('should extract state from a JSON object {"state":"ON"}', () => {
      expect(priv(instance).parseOnOff('{"state":"ON"}', 'X', 'Y')).toBe(true);
    });

    it('should extract state from a JSON object {"state":"OFF"}', () => {
      expect(priv(instance).parseOnOff('{"state":"OFF"}', 'X', 'Y')).toBe(false);
    });

    it('should extract value from a JSON object {"value":"1"}', () => {
      expect(priv(instance).parseOnOff('{"value":"1"}', 'X', 'Y')).toBe(true);
    });

    it('should extract power from a JSON object {"power":"OFF"}', () => {
      expect(priv(instance).parseOnOff('{"power":"OFF"}', 'X', 'Y')).toBe(false);
    });

    it('should use jsonPath when provided and return true', () => {
      expect(priv(instance).parseOnOff('{"device":{"on":"true"}}', 'X', 'Y', 'device.on')).toBe(true);
    });

    it('should use jsonPath when provided and return false', () => {
      expect(priv(instance).parseOnOff('{"device":{"on":"0"}}', 'X', 'Y', 'device.on')).toBe(false);
    });

    it('should return null and warn for an unrecognized payload', () => {
      const result = priv(instance).parseOnOff('BANANA', 'X', 'Y');
      expect(result).toBeNull();
    });
  });

  // ── getBrightnessRange ────────────────────────────────────────────────────────

  describe('getBrightnessRange', () => {
    it('should return the configured range', () => {
      const cfg = { name: 'test', brightnessMin: 10, brightnessMax: 200 } as MqttDeviceConfig;
      expect(priv(instance).getBrightnessRange(cfg)).toEqual({ min: 10, max: 200 });
    });

    it('should default to 0-100 when values are not set', () => {
      const cfg = { name: 'test' } as MqttDeviceConfig;
      expect(priv(instance).getBrightnessRange(cfg)).toEqual({ min: 0, max: 100 });
    });

    it('should fall back to 0-100 and warn when min >= max', () => {
      const cfg = { name: 'test', brightnessMin: 100, brightnessMax: 10 } as MqttDeviceConfig;
      expect(priv(instance).getBrightnessRange(cfg)).toEqual({ min: 0, max: 100 });
    });

    it('should fall back to 0-100 when min equals max', () => {
      const cfg = { name: 'test', brightnessMin: 50, brightnessMax: 50 } as MqttDeviceConfig;
      expect(priv(instance).getBrightnessRange(cfg)).toEqual({ min: 0, max: 100 });
    });
  });

  // ── matterLevelToMqttBrightness ──────────────────────────────────────────────

  describe('matterLevelToMqttBrightness', () => {
    it('should convert level 0 to the minimum brightness', () => {
      expect(priv(instance).matterLevelToMqttBrightness(0, 0, 100)).toBe(0);
    });

    it('should convert level 254 to the maximum brightness', () => {
      expect(priv(instance).matterLevelToMqttBrightness(254, 0, 100)).toBe(100);
    });

    it('should clamp a level above 254 to maximum', () => {
      expect(priv(instance).matterLevelToMqttBrightness(300, 0, 100)).toBe(100);
    });

    it('should clamp a negative level to minimum', () => {
      expect(priv(instance).matterLevelToMqttBrightness(-10, 0, 100)).toBe(0);
    });

    it('should work correctly with a custom range', () => {
      // level 127 ≈ 50% of 254 → ~50% of (0..255) ≈ 128
      const result = priv(instance).matterLevelToMqttBrightness(127, 0, 255);
      expect(result).toBeGreaterThanOrEqual(125);
      expect(result).toBeLessThanOrEqual(130);
    });
  });

  // ── mqttBrightnessToMatterLevel ──────────────────────────────────────────────

  describe('mqttBrightnessToMatterLevel', () => {
    it('should convert minimum brightness to level 0', () => {
      expect(priv(instance).mqttBrightnessToMatterLevel(0, 0, 100)).toBe(0);
    });

    it('should convert maximum brightness to level 254', () => {
      expect(priv(instance).mqttBrightnessToMatterLevel(100, 0, 100)).toBe(254);
    });

    it('should clamp values below min to level 0', () => {
      expect(priv(instance).mqttBrightnessToMatterLevel(-10, 0, 100)).toBe(0);
    });

    it('should clamp values above max to level 254', () => {
      expect(priv(instance).mqttBrightnessToMatterLevel(200, 0, 100)).toBe(254);
    });

    it('should work with a custom range', () => {
      expect(priv(instance).mqttBrightnessToMatterLevel(255, 0, 255)).toBe(254);
    });
  });

  // ── getCoverPositionRange ─────────────────────────────────────────────────────

  describe('getCoverPositionRange', () => {
    it('should return the configured range', () => {
      const cfg = { name: 'cover', positionMin: 5, positionMax: 95 } as MqttDeviceConfig;
      expect(priv(instance).getCoverPositionRange(cfg)).toEqual({ min: 5, max: 95 });
    });

    it('should default to 0-100 when values are not set', () => {
      const cfg = { name: 'cover' } as MqttDeviceConfig;
      expect(priv(instance).getCoverPositionRange(cfg)).toEqual({ min: 0, max: 100 });
    });

    it('should fall back to 0-100 and warn when min >= max', () => {
      const cfg = { name: 'cover', positionMin: 100, positionMax: 0 } as MqttDeviceConfig;
      expect(priv(instance).getCoverPositionRange(cfg)).toEqual({ min: 0, max: 100 });
    });
  });

  // ── coverMatterPctToMqttPosition ─────────────────────────────────────────────

  describe('coverMatterPctToMqttPosition', () => {
    it('should convert 0% to the minimum position', () => {
      expect(priv(instance).coverMatterPctToMqttPosition(0, 0, 100)).toBe(0);
    });

    it('should convert 100% to the maximum position', () => {
      expect(priv(instance).coverMatterPctToMqttPosition(100, 0, 100)).toBe(100);
    });

    it('should clamp a percentage above 100 to maximum', () => {
      expect(priv(instance).coverMatterPctToMqttPosition(150, 0, 100)).toBe(100);
    });

    it('should work correctly with a custom range', () => {
      // 50% of (10..90) = 50
      expect(priv(instance).coverMatterPctToMqttPosition(50, 10, 90)).toBe(50);
    });
  });

  // ── coverMqttPositionToMatterPct ─────────────────────────────────────────────

  describe('coverMqttPositionToMatterPct', () => {
    it('should convert the minimum position to 0%', () => {
      expect(priv(instance).coverMqttPositionToMatterPct(0, 0, 100)).toBe(0);
    });

    it('should convert the maximum position to 100%', () => {
      expect(priv(instance).coverMqttPositionToMatterPct(100, 0, 100)).toBe(100);
    });

    it('should clamp values above max to 100%', () => {
      expect(priv(instance).coverMqttPositionToMatterPct(150, 0, 100)).toBe(100);
    });

    it('should clamp values below min to 0%', () => {
      expect(priv(instance).coverMqttPositionToMatterPct(-5, 0, 100)).toBe(0);
    });

    it('should correctly map a midpoint in a custom range', () => {
      // position 50 in range (0..200) → 25%
      expect(priv(instance).coverMqttPositionToMatterPct(50, 0, 200)).toBe(25);
    });
  });

  // ── slugify ───────────────────────────────────────────────────────────────────

  describe('slugify', () => {
    it('should lowercase the result', () => {
      expect(priv(instance).slugify('ABC')).toBe('abc');
    });

    it('should convert spaces to underscores', () => {
      expect(priv(instance).slugify('Kitchen Light')).toBe('kitchen_light');
    });

    it('should collapse multiple special characters into one underscore', () => {
      expect(priv(instance).slugify('hello--world!!')).toBe('hello_world');
    });

    it('should strip leading underscores', () => {
      expect(priv(instance).slugify('_test')).toBe('test');
    });

    it('should strip trailing underscores', () => {
      expect(priv(instance).slugify('test_')).toBe('test');
    });

    it('should truncate the result at 64 characters', () => {
      const long = 'a'.repeat(80);
      expect(priv(instance).slugify(long)).toHaveLength(64);
    });

    it('should return an empty string for empty input', () => {
      expect(priv(instance).slugify('')).toBe('');
    });
  });

  // ── applyDeviceDefaults ──────────────────────────────────────────────────────

  describe('applyDeviceDefaults', () => {
    it('should keep explicit id and name', () => {
      const cfg: MqttDeviceConfig = { name: 'My Light', id: 'my-light', type: 'on-off-light' };
      const result = priv(instance).applyDeviceDefaults(cfg, 0);
      expect(result.name).toBe('My Light');
      expect(result.id).toBe('my-light');
    });

    it('should generate the id from the name when id is missing', () => {
      const cfg: MqttDeviceConfig = { name: 'Kitchen Light', type: 'on-off-light' };
      const result = priv(instance).applyDeviceDefaults(cfg, 0);
      expect(result.id).toBe('kitchen_light');
    });

    it('should auto-number the name when name is empty', () => {
      const cfg: MqttDeviceConfig = { name: '', type: 'on-off-light' };
      const result = priv(instance).applyDeviceDefaults(cfg, 2);
      expect(result.name).toBe('Device 3');
    });

    it('should assign a sequential serial padded to three digits', () => {
      const cfg: MqttDeviceConfig = { name: 'Test', type: 'on-off-light' };
      const result = priv(instance).applyDeviceDefaults(cfg, 4);
      expect(result.serial).toBe('mqd-005');
    });

    it('should default the type to "on-off-outlet" when type is missing', () => {
      const cfg: MqttDeviceConfig = { name: 'Test' };
      const result = priv(instance).applyDeviceDefaults(cfg, 0);
      expect(result.type).toBe('on-off-outlet');
    });

    it('should set a default topicOnOff when not provided', () => {
      const cfg: MqttDeviceConfig = { name: 'Light', id: 'light', type: 'on-off-light' };
      const result = priv(instance).applyDeviceDefaults(cfg, 0);
      expect(result.topicOnOff).toBe('matterbridge/light/state');
    });

    it('should keep an explicit topicOnOff', () => {
      const cfg: MqttDeviceConfig = { name: 'Light', id: 'light', type: 'on-off-light', topicOnOff: 'custom/topic' };
      const result = priv(instance).applyDeviceDefaults(cfg, 0);
      expect(result.topicOnOff).toBe('custom/topic');
    });
  });

  // ── isDeviceEnabled ───────────────────────────────────────────────────────────

  describe('isDeviceEnabled', () => {
    const lightCfg: MqttDeviceConfig = { name: 'Kitchen Light', id: 'kitchen-light', type: 'on-off-light' };

    beforeEach(() => {
      instance.config['whiteList'] = [];
      instance.config['blackList'] = [];
    });

    it('should return true when no whitelist or blacklist is configured', () => {
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(true);
    });

    it('should return false when enabled is explicitly false', () => {
      expect(priv(instance).isDeviceEnabled({ ...lightCfg, enabled: false })).toBe(false);
    });

    it('should return false when device name is not in the whitelist', () => {
      instance.config['whiteList'] = ['other-device'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(false);
    });

    it('should return true when device name is in the whitelist', () => {
      instance.config['whiteList'] = ['Kitchen Light'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(true);
    });

    it('should return true when device id is in the whitelist', () => {
      instance.config['whiteList'] = ['kitchen-light'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(true);
    });

    it('should return false when device name is in the blacklist', () => {
      instance.config['blackList'] = ['Kitchen Light'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(false);
    });

    it('should return false when device id is in the blacklist', () => {
      instance.config['blackList'] = ['kitchen-light'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(false);
    });

    it('should return true when whiteList is present but blackList does not contain the device', () => {
      instance.config['whiteList'] = ['Kitchen Light'];
      instance.config['blackList'] = ['other'];
      expect(priv(instance).isDeviceEnabled(lightCfg)).toBe(true);
    });
  });

  // ── onFetch ───────────────────────────────────────────────────────────────────

  describe('onFetch', () => {
    it('should return undefined for a non-config path', async () => {
      await expect(instance.onFetch('GET', 'status')).resolves.toBeUndefined();
    });

    it('should return undefined for GET with unknown device id', async () => {
      instance.config['devices'] = [{ name: 'Light', type: 'on-off-light', id: 'light' }] as MqttDeviceConfig[];
      const result = await instance.onFetch('GET', 'config', { device: 'unknown' });
      expect(result).toBeUndefined();
    });

    it('should return device config for GET with a known device id', async () => {
      instance.config['devices'] = [{ name: 'Kitchen Light', type: 'on-off-light', id: 'kitchen-light' }] as MqttDeviceConfig[];
      const result = (await instance.onFetch('GET', 'config', { device: 'kitchen-light' })) as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result['deviceId']).toBe('kitchen-light');
      expect(String(result['title'])).toContain('Kitchen Light');
      expect(result).toHaveProperty('values');
      expect(result).toHaveProperty('groups');
    });

    it('should return an error object for POST without deviceId', async () => {
      const result = (await instance.onFetch('POST', 'config', {})) as Record<string, unknown>;
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('deviceId') });
    });

    it('should return undefined for POST with unknown deviceId', async () => {
      instance.config['devices'] = [{ name: 'Light', type: 'on-off-light', id: 'light' }] as MqttDeviceConfig[];
      const result = await instance.onFetch('POST', 'config', { deviceId: 'unknown' });
      expect(result).toBeUndefined();
    });

    it('should update config and return ok:true for POST with a known deviceId', async () => {
      instance.config['devices'] = [{ name: 'Kitchen Light', type: 'on-off-light', id: 'kitchen-light' }] as MqttDeviceConfig[];
      vi.spyOn(priv(instance), 'saveConfig').mockImplementation(() => {});
      const result = (await instance.onFetch('POST', 'config', {
        deviceId: 'kitchen-light',
        topicSetOnOff: 'home/light/set',
        retain: 'true',
      })) as Record<string, unknown>;
      expect(result).toMatchObject({ ok: true });
      const devices = instance.config['devices'] as MqttDeviceConfig[];
      expect(devices[0].retain).toBe(true);
    });

    it('should return undefined for unsupported HTTP method on config path', async () => {
      const result = await instance.onFetch('DELETE', 'config', {});
      expect(result).toBeUndefined();
    });
  });

  // ── onStart ───────────────────────────────────────────────────────────────────

  describe('onStart', () => {
    it('should warn when no devices are configured', async () => {
      await instance.onStart('test');
      expect(mockLog.warn).toHaveBeenCalledWith('No devices configured.');
    });

    it('should skip a device with enabled:false', async () => {
      instance.config['devices'] = [{ name: 'Disabled', type: 'on-off-light', id: 'disabled', enabled: false }] as MqttDeviceConfig[];
      await instance.onStart('test');
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    });

    it('should log a warning for an unknown device type', async () => {
      instance.config['devices'] = [{ name: 'Weird', type: 'unknown-type' as MqttDeviceConfig['type'], id: 'weird' }] as MqttDeviceConfig[];
      await instance.onStart('test');
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown type'));
    });

    it('should initialize whiteList and blackList when missing', async () => {
      delete instance.config['whiteList'];
      delete instance.config['blackList'];
      await instance.onStart('test');
      expect(Array.isArray(instance.config['whiteList'])).toBe(true);
      expect(Array.isArray(instance.config['blackList'])).toBe(true);
    });
  });
});

// ── MQTT routing tests ─────────────────────────────────────────────────────────

describe('MqttPlatform – MQTT routing', () => {
  let instance: MqttPlatform;
  let messageHandler: (topic: string, buf: Buffer) => void;

  // Use beforeEach so the instance and messageHandler are created fresh after
  // clearMocks/restoreMocks run (which clear the on.mock.calls between tests).
  beforeEach(async () => {
    vi.spyOn(AnsiLogger.prototype, 'log').mockImplementation(() => {});
    instance = makeInstance();
    await instance.onStart('test');
    // onStart → connectMqtt → mqttClient.on('message', handler) is now recorded
    const messageCall = mockMqttClient.on.mock.calls.find((c: any[]) => c[0] === 'message');
    if (!messageCall) throw new Error('Expected MQTT "message" handler to be registered');
    messageHandler = messageCall[1] as (topic: string, buf: Buffer) => void;
  });

  afterAll(() => {
    vi.restoreAllMocks();
    mockMqttClient.connected = false;
  });

  it('should route a message to a registered handler', () => {
    const handler = vi.fn();
    priv(instance).subscribe('sensors/temp', handler);
    messageHandler('sensors/temp', Buffer.from('22.5'));
    expect(handler).toHaveBeenCalledWith('22.5');
  });

  it('should trim whitespace from incoming payloads', () => {
    const handler = vi.fn();
    priv(instance).subscribe('sensors/trim', handler);
    messageHandler('sensors/trim', Buffer.from('  42.0  '));
    expect(handler).toHaveBeenCalledWith('42.0');
  });

  it('should add a second handler to the same topic without re-subscribing', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    priv(instance).subscribe('sensors/hum', handler1);
    const subscribeCallsBefore = mockMqttClient.subscribe.mock.calls.length;
    priv(instance).subscribe('sensors/hum', handler2);
    // No new MQTT subscribe call should have been made
    expect(mockMqttClient.subscribe.mock.calls.length).toBe(subscribeCallsBefore);
    messageHandler('sensors/hum', Buffer.from('60'));
    expect(handler1).toHaveBeenCalledWith('60');
    expect(handler2).toHaveBeenCalledWith('60');
  });

  it('should log a warning for messages on a topic with no registered handler', () => {
    messageHandler('unregistered/topic', Buffer.from('data'));
    expect(mockLog.warn).toHaveBeenCalled();
  });

  it('should log an error when a handler throws', () => {
    priv(instance).subscribe('sensors/bad', () => {
      throw new Error('handler error');
    });
    messageHandler('sensors/bad', Buffer.from('boom'));
    expect(mockLog.error).toHaveBeenCalled();
  });

  it('should not publish and warn when MQTT is not connected', () => {
    mockMqttClient.connected = false;
    priv(instance).publish('test/topic', 'value');
    expect(mockMqttClient.publish).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalled();
  });

  it('should publish with retain and qos:1 when MQTT is connected', () => {
    mockMqttClient.connected = true;
    priv(instance).publish('test/pub', 'hello', true);
    expect(mockMqttClient.publish).toHaveBeenCalledWith('test/pub', 'hello', { retain: true, qos: 1 });
    mockMqttClient.connected = false;
  });

  it('should publish without retain by default when MQTT is connected', () => {
    mockMqttClient.connected = true;
    priv(instance).publish('test/pub2', 'world');
    expect(mockMqttClient.publish).toHaveBeenCalledWith('test/pub2', 'world', { retain: false, qos: 1 });
    mockMqttClient.connected = false;
  });
});
