import path from 'node:path';

import { jest } from '@jest/globals';
import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

// Mock mqtt BEFORE importing the module (ESM requirement)
const mockMqttClient = {
  connected: false,
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

const { default: initializePlugin, MqttPlatform } = await import('../src/module.js');

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
  rootDirectory: path.join('.cache', 'jest', 'MqttPlugin'),
  homeDirectory: path.join('.cache', 'jest', 'MqttPlugin'),
  matterbridgeDirectory: path.join('.cache', 'jest', 'MqttPlugin', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'jest', 'MqttPlugin', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'jest', 'MqttPlugin', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'jest', 'MqttPlugin', 'node_modules'),
  matterbridgeVersion: '3.5.0',
  matterbridgeLatestVersion: '3.5.0',
  matterbridgeDevVersion: '3.5.0',
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

describe('MqttPlatform', () => {
  let instance: InstanceType<typeof MqttPlatform>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMqttClient.connected = false;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should create an instance via initializePlugin', () => {
    instance = initializePlugin(mockMatterbridge, mockLog, mockConfig) as InstanceType<typeof MqttPlatform>;
    expect(instance).toBeInstanceOf(MqttPlatform);
    expect(instance.matterbridge).toBe(mockMatterbridge);
    expect(instance.config).toBe(mockConfig);
  });

  it('should start and warn when no devices are configured', async () => {
    await instance.onStart('test');
    expect(mockLog.warn).toHaveBeenCalledWith('No devices configured.');
  });

  it('should force-close the mqtt client when it is not connected', async () => {
    mockMqttClient.connected = false;
    await instance.onShutdown('test');
    expect(mockMqttClient.endAsync).toHaveBeenCalledWith(true);
  });
});
